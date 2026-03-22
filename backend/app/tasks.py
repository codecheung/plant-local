from concurrent.futures import ThreadPoolExecutor

from .db import get_conn, now_ts
from .services import run_infer_job, run_train_job


EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="plant-local")


def _safe_run_train_job(job_id: int) -> None:
    try:
        run_train_job(job_id)
    except Exception as e:
        with get_conn() as conn:
            conn.execute(
                """
                UPDATE train_jobs
                SET status='failed', finished_at=?, error_message=?
                WHERE id=?
                """,
                (now_ts(), f"Training crashed: {e}", job_id),
            )


def submit_train_job(job_id: int) -> None:
    EXECUTOR.submit(_safe_run_train_job, job_id)


def submit_infer_job(job_id: int) -> None:
    EXECUTOR.submit(run_infer_job, job_id)
