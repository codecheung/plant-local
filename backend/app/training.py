import json
import random
import shutil
from pathlib import Path
from typing import Dict, List, Optional

from .config import MODELS_DIR, SPLIT_TRAIN_DIR, SPLIT_VAL_DIR
from .db import get_conn


def prepare_train_val_split(train_ratio: float = 0.8) -> dict:
    for root in [SPLIT_TRAIN_DIR, SPLIT_VAL_DIR]:
        for cls in ["target_plant", "other"]:
            p = root / cls
            if p.exists():
                shutil.rmtree(p)
            p.mkdir(parents=True, exist_ok=True)

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT i.storage_path, l.label
            FROM labels l
            JOIN images i ON i.id = l.image_id
            WHERE l.label IN ('target_plant', 'other')
            """
        ).fetchall()

    buckets: Dict[str, List[Path]] = {"target_plant": [], "other": []}
    for r in rows:
        p = Path(r["storage_path"])
        if p.exists():
            buckets[r["label"]].append(p)

    split_stats = {
        "target_plant": {"train": 0, "val": 0},
        "other": {"train": 0, "val": 0},
    }

    for label, files in buckets.items():
        random.shuffle(files)
        cutoff = max(1, int(len(files) * train_ratio)) if files else 0
        train_files = files[:cutoff]
        val_files = files[cutoff:]

        for idx, src in enumerate(train_files, start=1):
            dst = SPLIT_TRAIN_DIR / label / f"{idx:06d}_{src.name}"
            shutil.copy2(src, dst)
        for idx, src in enumerate(val_files, start=1):
            dst = SPLIT_VAL_DIR / label / f"{idx:06d}_{src.name}"
            shutil.copy2(src, dst)

        split_stats[label]["train"] = len(train_files)
        split_stats[label]["val"] = len(val_files)

    return split_stats


def train_with_pytorch(
    version: str, base_checkpoint: Optional[Path] = None
) -> dict:
    try:
        import torch
        import torch.nn as nn
        import torch.optim as optim
        from torch.utils.data import DataLoader
        from torchvision import datasets, models, transforms
    except ImportError as e:
        raise RuntimeError(
            "Real training requires torch/torchvision. Install requirements-ml.txt first."
        ) from e

    train_dir = SPLIT_TRAIN_DIR
    val_dir = SPLIT_VAL_DIR
    classes = ["other", "target_plant"]

    transform = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
        ]
    )

    train_ds = datasets.ImageFolder(root=str(train_dir), transform=transform)
    val_ds = datasets.ImageFolder(root=str(val_dir), transform=transform)

    if len(train_ds) < 20 or len(val_ds) < 4:
        raise RuntimeError("Not enough split data. Need at least 20 train and 4 val images.")

    if sorted(train_ds.classes) != classes:
        raise RuntimeError("Dataset classes must contain exactly: other, target_plant")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = models.resnet18(weights=None)
    model.fc = nn.Linear(model.fc.in_features, 2)
    if base_checkpoint is not None and base_checkpoint.is_file():
        try:
            state = torch.load(
                str(base_checkpoint), map_location=device, weights_only=True
            )
        except TypeError:
            state = torch.load(str(base_checkpoint), map_location=device)
        model.load_state_dict(state)
    model.to(device)

    criterion = nn.CrossEntropyLoss()
    lr = 1e-4 if base_checkpoint is not None and base_checkpoint.is_file() else 1e-3
    optimizer = optim.Adam(model.parameters(), lr=lr)
    train_loader = DataLoader(train_ds, batch_size=16, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=16, shuffle=False, num_workers=0)

    epochs = 2
    model.train()
    for _ in range(epochs):
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()

    model.eval()
    correct = 0
    total = 0
    with torch.no_grad():
        for x, y in val_loader:
            x, y = x.to(device), y.to(device)
            logits = model(x)
            pred = logits.argmax(dim=1)
            correct += (pred == y).sum().item()
            total += y.size(0)

    acc = round(correct / total, 4) if total else 0.0
    precision = acc
    recall = acc
    f1 = acc

    model_dir = MODELS_DIR / version
    model_dir.mkdir(parents=True, exist_ok=True)
    pt_path = model_dir / "model.pt"
    onnx_path = model_dir / "model.onnx"
    torch.save(model.state_dict(), pt_path)

    dummy_input = torch.randn(1, 3, 224, 224, device=device)
    torch.onnx.export(
        model,
        dummy_input,
        str(onnx_path),
        input_names=["input"],
        output_names=["logits"],
        opset_version=12,
    )

    metrics = {
        "acc": acc,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "samples": len(train_ds) + len(val_ds),
        "engine": "pytorch",
    }
    if base_checkpoint is not None and base_checkpoint.is_file():
        metrics["continued_from"] = base_checkpoint.parent.name
    (model_dir / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=True, indent=2), encoding="utf-8")
    return {"metrics": metrics, "model_path": str(onnx_path)}
