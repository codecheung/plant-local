import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Iterator

from .config import DB_PATH, ensure_directories


def now_ts() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    ensure_directories()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                original_path TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                sha256 TEXT UNIQUE NOT NULL,
                status TEXT NOT NULL DEFAULT 'imported',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS labels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_id INTEGER UNIQUE NOT NULL,
                label TEXT NOT NULL CHECK(label IN ('target_plant', 'other')),
                reviewed INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (image_id) REFERENCES images(id)
            );

            CREATE TABLE IF NOT EXISTS label_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_id INTEGER NOT NULL,
                operation_id TEXT NOT NULL,
                old_label TEXT,
                old_reviewed INTEGER,
                new_label TEXT NOT NULL,
                new_reviewed INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (image_id) REFERENCES images(id)
            );
            CREATE INDEX IF NOT EXISTS idx_label_events_op_id ON label_events(operation_id);

            CREATE TABLE IF NOT EXISTS train_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mode TEXT NOT NULL CHECK(mode IN ('new', 'continue')),
                base_version TEXT,
                status TEXT NOT NULL DEFAULT 'queued',
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                metrics_json TEXT,
                model_version TEXT,
                log_path TEXT,
                error_message TEXT
            );

            CREATE TABLE IF NOT EXISTS infer_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_version TEXT,
                input_dir TEXT,
                status TEXT NOT NULL DEFAULT 'queued',
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                output_csv TEXT,
                output_json TEXT,
                total INTEGER NOT NULL DEFAULT 0,
                processed INTEGER NOT NULL DEFAULT 0,
                error_message TEXT
            );

            CREATE TABLE IF NOT EXISTS model_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL,
                metrics_json TEXT,
                model_path TEXT NOT NULL,
                note TEXT,
                is_published INTEGER NOT NULL DEFAULT 0
            );
            """
        )
