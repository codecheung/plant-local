# plant-local

本项目是一个本地部署的植物识别训练系统（V1 骨架），支持：

- 数据导入
- 标注保存
- 启动训练（后台任务）
- 启动批量识别（后台任务）
- 识别结果导出
- 模型发布与回滚

## 1. 目录

```text
plant-local/
  backend/
    app/
  data/
    raw/
    labeled/
    split/train/
    split/val/
  models/
  outputs/predictions/
  outputs/reports/
  logs/
```

## 2. 运行

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.app.main:app --reload
```

启动后访问：

- 控制台页面: `http://127.0.0.1:8000/`
- API 文档: `http://127.0.0.1:8000/docs`
- 健康检查: `http://127.0.0.1:8000/health`
- 使用手册: `docs/操作手册.md`
- 交付清单: `docs/交付清单.md`

## 3. 主流程 API（V1）

- `POST /api/data/import`
- `POST /api/data/upload-files`
- `GET /api/images`
- `GET /api/images/random-unlabeled?count=20`
- `POST /api/label/save`
- `POST /api/label/undo`
- `GET /api/label/operations?limit=20`
- `GET /api/labels/stats`
- `POST /api/train/start`
- `GET /api/train/{job_id}`
- `POST /api/infer/start`
- `GET /api/infer/{job_id}`
- `GET /api/infer/{job_id}/export?format=csv|json`
- `GET /api/infer/{job_id}/results/review`
- `GET /api/model/list`
- `POST /api/model/publish`
- `POST /api/model/rollback`

## 4. 注意事项

- 默认训练是可运行骨架（模拟引擎），便于先跑通业务闭环。
- 如需启用真实训练：

```bash
pip install -r requirements-ml.txt
export USE_REAL_TRAINING=1
uvicorn backend.app.main:app --reload
```

- 真实训练流程会执行：标注样本切分（train/val）-> PyTorch 训练 -> ONNX 导出。
