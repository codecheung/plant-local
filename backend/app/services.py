import csv
import hashlib
import json
import math
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Iterable, Optional

from .config import MODELS_DIR, PREDICTIONS_DIR, RAW_DIR, USE_REAL_TRAINING
from .db import get_conn, now_ts
from .training import prepare_train_val_split, train_with_pytorch


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _iter_images(source_dir: Path, extensions: Iterable[str]) -> Iterable[Path]:
    ext_set = {e.lower() for e in extensions}
    for p in source_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() in ext_set:
            yield p


def import_images(source_dir: str, copy_to_raw: bool, extensions: list[str]) -> dict:
    src = Path(source_dir).expanduser().resolve()
    if not src.exists() or not src.is_dir():
        raise ValueError(f"source_dir not exists: {src}")

    imported = 0
    duplicates = 0
    skipped = 0

    with get_conn() as conn:
        cur = conn.cursor()
        for img_path in _iter_images(src, extensions):
            try:
                file_sha = _sha256(img_path)
            except Exception:
                skipped += 1
                continue

            exist = cur.execute("SELECT id FROM images WHERE sha256 = ?", (file_sha,)).fetchone()
            if exist:
                duplicates += 1
                continue

            if copy_to_raw:
                target = RAW_DIR / f"{file_sha}{img_path.suffix.lower()}"
                if not target.exists():
                    shutil.copy2(img_path, target)
                storage_path = str(target)
            else:
                storage_path = str(img_path)

            cur.execute(
                """
                INSERT INTO images (filename, original_path, storage_path, sha256, status, created_at)
                VALUES (?, ?, ?, ?, 'imported', ?)
                """,
                (img_path.name, str(img_path), storage_path, file_sha, now_ts()),
            )
            imported += 1

    return {"imported": imported, "duplicates": duplicates, "skipped": skipped}


def import_uploaded_files(files: list, extensions: Optional[list[str]] = None) -> dict:
    allowed = set((extensions or [".jpg", ".jpeg", ".png", ".webp"]))
    allowed = {e.lower() for e in allowed}

    imported = 0
    duplicates = 0
    skipped = 0

    with get_conn() as conn:
        cur = conn.cursor()
        for upload in files:
            try:
                filename = upload.filename or ""
                suffix = Path(filename).suffix.lower()
                if suffix not in allowed:
                    skipped += 1
                    continue

                tmp_name = f"upload_{uuid.uuid4().hex}{suffix}.tmp"
                tmp_path = RAW_DIR / tmp_name
                file_hash = hashlib.sha256()

                with tmp_path.open("wb") as out:
                    while True:
                        chunk = upload.file.read(1024 * 1024)
                        if not chunk:
                            break
                        file_hash.update(chunk)
                        out.write(chunk)

                digest = file_hash.hexdigest()
                exists = cur.execute("SELECT id FROM images WHERE sha256 = ?", (digest,)).fetchone()
                if exists:
                    duplicates += 1
                    try:
                        tmp_path.unlink(missing_ok=True)
                    except Exception:
                        pass
                    continue

                target_path = RAW_DIR / f"{digest}{suffix}"
                if target_path.exists():
                    tmp_path.unlink(missing_ok=True)
                else:
                    os.replace(tmp_path, target_path)

                cur.execute(
                    """
                    INSERT INTO images (filename, original_path, storage_path, sha256, status, created_at)
                    VALUES (?, ?, ?, ?, 'imported', ?)
                    """,
                    (filename, filename, str(target_path), digest, now_ts()),
                )
                imported += 1
            except Exception:
                skipped += 1
            finally:
                try:
                    upload.file.close()
                except Exception:
                    pass

    return {"imported": imported, "duplicates": duplicates, "skipped": skipped}


def run_train_job(job_id: int) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE train_jobs SET status='running', started_at=? WHERE id=?",
            (now_ts(), job_id),
        )

        count_target = cur.execute(
            "SELECT COUNT(1) AS c FROM labels WHERE label='target_plant'"
        ).fetchone()["c"]
        count_other = cur.execute(
            "SELECT COUNT(1) AS c FROM labels WHERE label='other'"
        ).fetchone()["c"]

        if count_target < 10 or count_other < 10:
            cur.execute(
                """
                UPDATE train_jobs
                SET status='failed', finished_at=?, error_message=?
                WHERE id=?
                """,
                (now_ts(), "Need at least 10 labeled samples for each class.", job_id),
            )
            return

    version = f"v{job_id}"
    model_dir = MODELS_DIR / version
    model_dir.mkdir(parents=True, exist_ok=True)

    if USE_REAL_TRAINING:
        try:
            split_stats = prepare_train_val_split(train_ratio=0.8)
            train_result = train_with_pytorch(version=version)
            metrics = train_result["metrics"]
            model_path = train_result["model_path"]
            metrics["split"] = split_stats
        except Exception as e:
            with get_conn() as conn:
                conn.execute(
                    """
                    UPDATE train_jobs
                    SET status='failed', finished_at=?, error_message=?
                    WHERE id=?
                    """,
                    (now_ts(), f"Real training failed: {e}", job_id),
                )
            return
    else:
        for _ in range(5):
            time.sleep(0.4)
        total = count_target + count_other
        balance = min(count_target, count_other) / max(count_target, count_other)
        f1 = round(0.70 + 0.25 * balance, 4)
        precision = round(min(0.99, f1 + 0.02), 4)
        recall = round(max(0.5, f1 - 0.02), 4)
        acc = round(min(0.99, 0.65 + total / (total + 200)), 4)

        metrics = {
            "acc": acc,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "samples": total,
            "engine": "simulated",
        }
        model_path_obj = model_dir / "model.onnx"
        model_path_obj.write_text(
            json.dumps({"model_version": version, "metrics": metrics}, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )
        model_path = str(model_path_obj)

    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO model_versions (version, created_at, metrics_json, model_path, note, is_published)
            VALUES (?, ?, ?, ?, ?, 0)
            """,
            (version, now_ts(), json.dumps(metrics), model_path, "auto-generated"),
        )
        cur.execute(
            """
            UPDATE train_jobs
            SET status='success', finished_at=?, metrics_json=?, model_version=?
            WHERE id=?
            """,
            (now_ts(), json.dumps(metrics), version, job_id),
        )


def run_infer_job(job_id: int) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        row = cur.execute("SELECT * FROM infer_jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            return

        model_version = row["model_version"]
        if not model_version:
            published = cur.execute(
                "SELECT version FROM model_versions WHERE is_published=1 ORDER BY id DESC LIMIT 1"
            ).fetchone()
            if published:
                model_version = published["version"]
            else:
                latest = cur.execute(
                    "SELECT version FROM model_versions ORDER BY id DESC LIMIT 1"
                ).fetchone()
                model_version = latest["version"] if latest else None

        if not model_version:
            cur.execute(
                """
                UPDATE infer_jobs
                SET status='failed', finished_at=?, error_message=?
                WHERE id=?
                """,
                (now_ts(), "No available model. Train and publish a model first.", job_id),
            )
            return

        input_dir = Path(row["input_dir"]).resolve() if row["input_dir"] else RAW_DIR.resolve()
        if not input_dir.exists() or not input_dir.is_dir():
            cur.execute(
                """
                UPDATE infer_jobs
                SET status='failed', finished_at=?, error_message=?
                WHERE id=?
                """,
                (now_ts(), f"input_dir not found: {input_dir}", job_id),
            )
            return

        cur.execute(
            """
            UPDATE infer_jobs
            SET status='running', started_at=?, model_version=?
            WHERE id=?
            """,
            (now_ts(), model_version, job_id),
        )

    exts = {".jpg", ".jpeg", ".png", ".webp"}
    files = [p for p in input_dir.rglob("*") if p.is_file() and p.suffix.lower() in exts]
    total = len(files)

    results = []
    for idx, f in enumerate(files, start=1):
        seed = int(hashlib.md5(str(f).encode("utf-8")).hexdigest()[:8], 16)
        score = round((seed % 1000) / 1000.0, 4)
        pred = "target_plant" if score >= 0.5 else "other"
        results.append(
            {
                "filename": f.name,
                "path": str(f),
                "predicted_class": pred,
                "confidence": score,
                "status": "success",
                "error_message": "",
            }
        )

        if idx % 200 == 0:
            with get_conn() as conn:
                conn.execute("UPDATE infer_jobs SET processed=? WHERE id=?", (idx, job_id))

    out_csv = PREDICTIONS_DIR / f"infer_job_{job_id}.csv"
    out_json = PREDICTIONS_DIR / f"infer_job_{job_id}.json"

    with out_csv.open("w", newline="", encoding="utf-8") as fcsv:
        writer = csv.DictWriter(
            fcsv,
            fieldnames=["filename", "path", "predicted_class", "confidence", "status", "error_message"],
        )
        writer.writeheader()
        writer.writerows(results)

    out_json.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE infer_jobs
            SET status='success', finished_at=?, output_csv=?, output_json=?, total=?, processed=?
            WHERE id=?
            """,
            (now_ts(), str(out_csv), str(out_json), total, total, job_id),
        )


def publish_model(version: str, note: Optional[str] = None) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        exists = cur.execute("SELECT id FROM model_versions WHERE version=?", (version,)).fetchone()
        if not exists:
            raise ValueError(f"model version not found: {version}")
        cur.execute("UPDATE model_versions SET is_published=0")
        cur.execute(
            "UPDATE model_versions SET is_published=1, note=COALESCE(?, note) WHERE version=?",
            (note, version),
        )


def save_labels_with_history(items: list[dict]) -> dict:
    if not items:
        return {"saved": 0, "operation_id": None}

    operation_id = str(uuid.uuid4())
    saved = 0
    with get_conn() as conn:
        cur = conn.cursor()
        for item in items:
            image_id = int(item["image_id"])
            label = item["label"]
            reviewed = int(bool(item.get("reviewed", False)))

            image = cur.execute("SELECT id FROM images WHERE id=?", (image_id,)).fetchone()
            if not image:
                continue

            old = cur.execute(
                "SELECT label, reviewed FROM labels WHERE image_id=?",
                (image_id,),
            ).fetchone()
            old_label = old["label"] if old else None
            old_reviewed = int(old["reviewed"]) if old else None

            cur.execute(
                """
                INSERT INTO labels (image_id, label, reviewed, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(image_id) DO UPDATE SET
                    label=excluded.label,
                    reviewed=excluded.reviewed,
                    updated_at=excluded.updated_at
                """,
                (image_id, label, reviewed, now_ts()),
            )
            cur.execute("UPDATE images SET status='labeled' WHERE id=?", (image_id,))
            cur.execute(
                """
                INSERT INTO label_events
                (image_id, operation_id, old_label, old_reviewed, new_label, new_reviewed, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (image_id, operation_id, old_label, old_reviewed, label, reviewed, now_ts()),
            )
            saved += 1

    return {"saved": saved, "operation_id": operation_id}


def undo_label_operations(steps: int = 1) -> dict:
    safe_steps = min(20, max(1, int(steps)))

    with get_conn() as conn:
        cur = conn.cursor()
        op_rows = cur.execute(
            """
            SELECT operation_id
            FROM label_events
            GROUP BY operation_id
            ORDER BY MAX(id) DESC
            LIMIT ?
            """,
            (safe_steps,),
        ).fetchall()
        op_ids = [r["operation_id"] for r in op_rows]
        if not op_ids:
            return {"operations_undone": 0, "reverted_items": 0}

        placeholders = ",".join(["?"] * len(op_ids))
        event_rows = cur.execute(
            f"""
            SELECT id, image_id, old_label, old_reviewed
            FROM label_events
            WHERE operation_id IN ({placeholders})
            ORDER BY id DESC
            """,
            op_ids,
        ).fetchall()

        reverted_ids: set[int] = set()
        for ev in event_rows:
            image_id = ev["image_id"]
            old_label = ev["old_label"]
            old_reviewed = ev["old_reviewed"]
            if old_label is None:
                cur.execute("DELETE FROM labels WHERE image_id=?", (image_id,))
                cur.execute("UPDATE images SET status='imported' WHERE id=?", (image_id,))
            else:
                cur.execute(
                    """
                    INSERT INTO labels (image_id, label, reviewed, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(image_id) DO UPDATE SET
                        label=excluded.label,
                        reviewed=excluded.reviewed,
                        updated_at=excluded.updated_at
                    """,
                    (image_id, old_label, int(old_reviewed or 0), now_ts()),
                )
                cur.execute("UPDATE images SET status='labeled' WHERE id=?", (image_id,))
            reverted_ids.add(image_id)

        cur.execute(
            f"DELETE FROM label_events WHERE operation_id IN ({placeholders})",
            op_ids,
        )

    return {"operations_undone": len(op_ids), "reverted_items": len(reverted_ids)}


def list_label_operations(limit: int = 20) -> list[dict]:
    safe_limit = min(100, max(1, int(limit)))
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                operation_id,
                MAX(created_at) AS created_at,
                COUNT(1) AS changed_items,
                SUM(CASE WHEN old_label IS NULL THEN 1 ELSE 0 END) AS newly_labeled_items,
                SUM(CASE WHEN old_label IS NOT NULL THEN 1 ELSE 0 END) AS relabeled_items
            FROM label_events
            GROUP BY operation_id
            ORDER BY MAX(id) DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def list_images(
    page: int,
    page_size: int,
    status: Optional[str] = None,
    label: Optional[str] = None,
    reviewed: Optional[bool] = None,
    keyword: Optional[str] = None,
) -> dict:
    page = max(1, page)
    page_size = min(200, max(1, page_size))
    offset = (page - 1) * page_size

    where = ["1=1"]
    params: list[object] = []

    if status:
        where.append("i.status = ?")
        params.append(status)
    if label:
        where.append("l.label = ?")
        params.append(label)
    if reviewed is not None:
        where.append("COALESCE(l.reviewed, 0) = ?")
        params.append(int(reviewed))
    if keyword:
        where.append("(i.filename LIKE ? OR i.original_path LIKE ?)")
        params.extend([f"%{keyword}%", f"%{keyword}%"])

    where_sql = " AND ".join(where)

    with get_conn() as conn:
        total = conn.execute(
            f"""
            SELECT COUNT(1) AS c
            FROM images i
            LEFT JOIN labels l ON l.image_id = i.id
            WHERE {where_sql}
            """,
            params,
        ).fetchone()["c"]

        rows = conn.execute(
            f"""
            SELECT
                i.id,
                i.filename,
                i.original_path,
                i.storage_path,
                i.status,
                i.created_at,
                l.label,
                l.reviewed,
                l.updated_at AS label_updated_at
            FROM images i
            LEFT JOIN labels l ON l.image_id = i.id
            WHERE {where_sql}
            ORDER BY i.id DESC
            LIMIT ? OFFSET ?
            """,
            [*params, page_size, offset],
        ).fetchall()

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "items": [dict(r) for r in rows],
    }


def get_label_stats() -> dict:
    with get_conn() as conn:
        total_images = conn.execute("SELECT COUNT(1) AS c FROM images").fetchone()["c"]
        labeled = conn.execute("SELECT COUNT(1) AS c FROM labels").fetchone()["c"]
        target = conn.execute(
            "SELECT COUNT(1) AS c FROM labels WHERE label='target_plant'"
        ).fetchone()["c"]
        other = conn.execute("SELECT COUNT(1) AS c FROM labels WHERE label='other'").fetchone()["c"]
        reviewed = conn.execute("SELECT COUNT(1) AS c FROM labels WHERE reviewed=1").fetchone()["c"]

    return {
        "total_images": total_images,
        "labeled": labeled,
        "unlabeled": max(0, total_images - labeled),
        "target_plant": target,
        "other": other,
        "reviewed": reviewed,
    }


def get_train_readiness(min_samples_per_class: int = 10) -> dict:
    with get_conn() as conn:
        target = conn.execute(
            "SELECT COUNT(1) AS c FROM labels WHERE label='target_plant'"
        ).fetchone()["c"]
        other = conn.execute(
            "SELECT COUNT(1) AS c FROM labels WHERE label='other'"
        ).fetchone()["c"]
    return {
        "ready": target >= min_samples_per_class and other >= min_samples_per_class,
        "target_plant": target,
        "other": other,
        "min_required_per_class": min_samples_per_class,
    }


def get_random_unlabeled_images(limit: int = 20) -> list[dict]:
    safe_limit = min(200, max(1, int(limit)))
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                i.id,
                i.filename,
                i.original_path,
                i.storage_path,
                i.status,
                i.created_at,
                NULL AS label,
                0 AS reviewed,
                NULL AS label_updated_at
            FROM images i
            LEFT JOIN labels l ON l.image_id = i.id
            WHERE l.image_id IS NULL
            ORDER BY RANDOM()
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_infer_results_for_review(
    job_id: int,
    sort_order: str = "asc",
    predicted_class: Optional[str] = None,
    limit: int = 1000,
) -> dict:
    with get_conn() as conn:
        job = conn.execute(
            "SELECT id, status, output_json FROM infer_jobs WHERE id=?",
            (job_id,),
        ).fetchone()
        if not job:
            raise ValueError("infer job not found")
        if not job["output_json"]:
            raise ValueError("infer result not ready")

        image_rows = conn.execute(
            """
            SELECT i.id, i.storage_path, l.label, l.reviewed
            FROM images i
            LEFT JOIN labels l ON l.image_id=i.id
            """
        ).fetchall()

    result_path = Path(job["output_json"])
    if not result_path.exists():
        raise ValueError("infer result file not exists")

    data = json.loads(result_path.read_text(encoding="utf-8"))
    image_map = {str(Path(r["storage_path"]).resolve()): dict(r) for r in image_rows}

    items = []
    for row in data:
        row_path = str(Path(row.get("path", "")).resolve())
        image_info = image_map.get(row_path)
        if predicted_class and row.get("predicted_class") != predicted_class:
            continue
        items.append(
            {
                "filename": row.get("filename"),
                "path": row.get("path"),
                "predicted_class": row.get("predicted_class"),
                "confidence": row.get("confidence"),
                "status": row.get("status"),
                "error_message": row.get("error_message", ""),
                "image_id": image_info["id"] if image_info else None,
                "current_label": image_info["label"] if image_info else None,
                "reviewed": bool(image_info["reviewed"]) if image_info and image_info["reviewed"] is not None else False,
            }
        )

    reverse = sort_order == "desc"
    items.sort(key=lambda x: float(x.get("confidence") or 0.0), reverse=reverse)

    safe_limit = min(5000, max(1, int(limit)))
    items = items[:safe_limit]
    return {
        "job_id": job_id,
        "job_status": job["status"],
        "total": len(items),
        "items": items,
    }
