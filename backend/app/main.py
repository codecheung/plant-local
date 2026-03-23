import json
import mimetypes
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import DB_PATH, STATIC_DIR, ensure_directories
from .db import get_conn, init_db, now_ts
from .schemas import (
    ImportRequest,
    ImportResponse,
    InferStartRequest,
    InferStartResponse,
    LabelSaveRequest,
    LabelSaveResponse,
    LabelUndoRequest,
    LabelUndoResponse,
    ModelPublishRequest,
    ModelRollbackRequest,
    TrainStartRequest,
    TrainStartResponse,
)
from .services import (
    get_label_stats,
    get_infer_results_for_review,
    get_train_readiness,
    list_label_operations,
    get_random_unlabeled_images,
    import_uploaded_files,
    import_images,
    list_images,
    publish_model,
    save_labels_with_history,
    undo_label_operations,
)
from .tasks import submit_infer_job, submit_train_job


app = FastAPI(title="plant-local API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    ensure_directories()
    init_db()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "db_exists": DB_PATH.exists()}


@app.get("/")
def home() -> FileResponse:
    index = STATIC_DIR / "index.html"
    if not index.exists():
        raise HTTPException(status_code=404, detail="UI file not found")
    return FileResponse(index)


@app.get("/favicon.png")
def favicon() -> FileResponse:
    path = STATIC_DIR / "favicon.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="favicon not found")
    return FileResponse(path)


static_assets = STATIC_DIR / "static"
if static_assets.is_dir():
    app.mount(
        "/static",
        StaticFiles(directory=static_assets),
        name="spa_static",
    )


@app.post("/api/data/import", response_model=ImportResponse)
def api_data_import(req: ImportRequest) -> ImportResponse:
    try:
        result = import_images(
            source_dir=req.source_dir,
            copy_to_raw=req.copy_to_raw,
            extensions=req.extensions,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return ImportResponse(**result)


@app.post("/api/data/upload-files", response_model=ImportResponse)
def api_data_upload_files(files: List[UploadFile] = File(...)) -> ImportResponse:
    if not files:
        return ImportResponse(imported=0, duplicates=0, skipped=0)
    result = import_uploaded_files(files)
    return ImportResponse(**result)


@app.post("/api/label/save", response_model=LabelSaveResponse)
def api_label_save(req: LabelSaveRequest) -> LabelSaveResponse:
    if not req.items:
        return LabelSaveResponse(saved=0, operation_id=None)

    result = save_labels_with_history(
        [
            {"image_id": i.image_id, "label": i.label, "reviewed": i.reviewed}
            for i in req.items
        ]
    )
    return LabelSaveResponse(saved=result["saved"], operation_id=result["operation_id"])


@app.post("/api/label/undo", response_model=LabelUndoResponse)
def api_label_undo(req: LabelUndoRequest) -> LabelUndoResponse:
    result = undo_label_operations(steps=req.steps)
    return LabelUndoResponse(
        operations_undone=result["operations_undone"],
        reverted_items=result["reverted_items"],
    )


@app.get("/api/label/operations")
def api_label_operations(limit: int = Query(default=20, ge=1, le=100)) -> dict:
    items = list_label_operations(limit=limit)
    return {"items": items}


@app.get("/api/images")
def api_images(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    status: Optional[str] = Query(default=None),
    label: Optional[str] = Query(default=None, regex="^(target_plant|other)$"),
    reviewed: Optional[bool] = Query(default=None),
    keyword: Optional[str] = Query(default=None),
) -> dict:
    return list_images(
        page=page,
        page_size=page_size,
        status=status,
        label=label,
        reviewed=reviewed,
        keyword=keyword,
    )


@app.get("/api/images/{image_id}/preview")
def api_image_preview(image_id: int) -> FileResponse:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT storage_path, filename FROM images WHERE id=?",
            (image_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="image not found")

    path = Path(row["storage_path"])
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="image file not found")

    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path=path, media_type=media_type, filename=row["filename"])


@app.get("/api/labels/stats")
def api_label_stats() -> dict:
    return get_label_stats()


@app.get("/api/images/random-unlabeled")
def api_random_unlabeled_images(count: int = Query(default=20, ge=1, le=200)) -> dict:
    items = get_random_unlabeled_images(limit=count)
    return {"count": len(items), "items": items}


@app.post("/api/train/start", response_model=TrainStartResponse)
def api_train_start(req: TrainStartRequest) -> TrainStartResponse:
    readiness = get_train_readiness(min_samples_per_class=10)
    if not readiness["ready"]:
        raise HTTPException(
            status_code=400,
            detail=(
                "样本不足，暂不能启动训练。"
                f"当前：目标植物 {readiness['target_plant']}，其他 {readiness['other']}；"
                f"每类至少需要 {readiness['min_required_per_class']} 条。"
            ),
        )

    base_for_insert: Optional[str] = None
    if req.mode == "continue":
        if not req.base_version or not str(req.base_version).strip():
            raise HTTPException(
                status_code=400,
                detail="继续训练必须指定基础版本（从已有模型版本中选择）。",
            )
        bv = str(req.base_version).strip()
        with get_conn() as conn:
            row = conn.execute(
                "SELECT version FROM model_versions WHERE version=?",
                (bv,),
            ).fetchone()
        if not row:
            raise HTTPException(
                status_code=400,
                detail=f"基础版本不存在: {bv}。请先在「模型版本」中确认已有该版本。",
            )
        base_for_insert = bv

    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO train_jobs (mode, base_version, status, created_at)
            VALUES (?, ?, 'queued', ?)
            """,
            (req.mode, base_for_insert, now_ts()),
        )
        job_id = cur.lastrowid

    submit_train_job(job_id)
    return TrainStartResponse(job_id=job_id, status="queued")


@app.get("/api/train/{job_id}")
def api_train_status(job_id: int) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM train_jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="train job not found")

    data = dict(row)
    if data.get("metrics_json"):
        try:
            data["metrics"] = json.loads(data["metrics_json"])
        except json.JSONDecodeError:
            data["metrics"] = None
    return data


@app.post("/api/infer/start", response_model=InferStartResponse)
def api_infer_start(req: InferStartRequest) -> InferStartResponse:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO infer_jobs (model_version, input_dir, status, created_at)
            VALUES (?, ?, 'queued', ?)
            """,
            (req.model_version, req.input_dir, now_ts()),
        )
        job_id = cur.lastrowid

    submit_infer_job(job_id)
    return InferStartResponse(job_id=job_id, status="queued")


@app.get("/api/infer/{job_id}")
def api_infer_status(job_id: int) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM infer_jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="infer job not found")
    return dict(row)


@app.get("/api/infer/{job_id}/export")
def api_infer_export(job_id: int, format: str = Query(default="csv", regex="^(csv|json)$")):
    with get_conn() as conn:
        row = conn.execute("SELECT output_csv, output_json FROM infer_jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="infer job not found")

    file_path = row["output_csv"] if format == "csv" else row["output_json"]
    if not file_path:
        raise HTTPException(status_code=400, detail="result not ready")

    path = Path(file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="file not exists")

    media_type = "text/csv" if format == "csv" else "application/json"
    return FileResponse(path=path, media_type=media_type, filename=path.name)


@app.get("/api/infer/{job_id}/results/review")
def api_infer_results_review(
    job_id: int,
    sort_order: str = Query(default="asc", regex="^(asc|desc)$"),
    predicted_class: Optional[str] = Query(default=None, regex="^(target_plant|other)$"),
    limit: int = Query(default=1000, ge=1, le=5000),
) -> dict:
    try:
        return get_infer_results_for_review(
            job_id=job_id,
            sort_order=sort_order,
            predicted_class=predicted_class,
            limit=limit,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/api/model/publish")
def api_model_publish(req: ModelPublishRequest) -> dict:
    try:
        publish_model(req.version, note=f"published@{now_ts()}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"status": "ok", "published_version": req.version}


@app.post("/api/model/rollback")
def api_model_rollback(req: ModelRollbackRequest) -> dict:
    try:
        publish_model(req.version, note=f"rollback@{now_ts()}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"status": "ok", "active_version": req.version}


@app.get("/api/model/list")
def api_model_list() -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT version, created_at, metrics_json, model_path, note, is_published
            FROM model_versions
            ORDER BY id DESC
            """
        ).fetchall()
    items = []
    for r in rows:
        item = dict(r)
        metrics_raw = item.get("metrics_json")
        if metrics_raw:
            try:
                item["metrics"] = json.loads(metrics_raw)
            except json.JSONDecodeError:
                item["metrics"] = None
        items.append(item)
    return {"items": items}
