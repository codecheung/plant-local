from pathlib import Path
import os


ROOT_DIR = Path(__file__).resolve().parents[2]

DATA_DIR = ROOT_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
LABELED_DIR = DATA_DIR / "labeled"
SPLIT_TRAIN_DIR = DATA_DIR / "split" / "train"
SPLIT_VAL_DIR = DATA_DIR / "split" / "val"

MODELS_DIR = ROOT_DIR / "models"
PREDICTIONS_DIR = ROOT_DIR / "outputs" / "predictions"
REPORTS_DIR = ROOT_DIR / "outputs" / "reports"
LOGS_DIR = ROOT_DIR / "logs"
STATIC_DIR = ROOT_DIR / "backend" / "app" / "static"

DB_PATH = DATA_DIR / "plant_local.db"
USE_REAL_TRAINING = os.getenv("USE_REAL_TRAINING", "0") == "1"


def ensure_directories() -> None:
    for path in [
        RAW_DIR,
        LABELED_DIR,
        SPLIT_TRAIN_DIR,
        SPLIT_VAL_DIR,
        MODELS_DIR,
        PREDICTIONS_DIR,
        REPORTS_DIR,
        LOGS_DIR,
    ]:
        path.mkdir(parents=True, exist_ok=True)
