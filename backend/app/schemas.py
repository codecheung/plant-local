from typing import List, Optional

try:
    from typing import Literal
except ImportError:
    from typing_extensions import Literal

from pydantic import BaseModel, Field


class ImportRequest(BaseModel):
    source_dir: str = Field(..., description="Source folder path")
    copy_to_raw: bool = Field(default=True, description="Copy files into data/raw")
    extensions: List[str] = Field(default_factory=lambda: [".jpg", ".jpeg", ".png", ".webp"])


class ImportResponse(BaseModel):
    imported: int
    duplicates: int
    skipped: int


class LabelItem(BaseModel):
    image_id: int
    label: Literal["target_plant", "other"]
    reviewed: bool = False


class LabelSaveRequest(BaseModel):
    items: List[LabelItem]


class LabelSaveResponse(BaseModel):
    saved: int
    operation_id: Optional[str] = None


class LabelUndoRequest(BaseModel):
    steps: int = Field(default=1, ge=1, le=20)


class LabelUndoResponse(BaseModel):
    operations_undone: int
    reverted_items: int


class TrainStartRequest(BaseModel):
    mode: Literal["new", "continue"] = "new"
    base_version: Optional[str] = None


class TrainStartResponse(BaseModel):
    job_id: int
    status: str


class InferStartRequest(BaseModel):
    model_version: Optional[str] = None
    input_dir: Optional[str] = None


class InferStartResponse(BaseModel):
    job_id: int
    status: str


class ModelPublishRequest(BaseModel):
    version: str


class ModelRollbackRequest(BaseModel):
    version: str
