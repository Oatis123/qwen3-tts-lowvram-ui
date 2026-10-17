import argparse
import json
import logging
import os
import sys
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--host", default="127.0.0.1")
ap.add_argument("--port", type=int, required=True)
ap.add_argument("--token", required=True)
ap.add_argument("--data-dir", required=True)
ap.add_argument("--models-dir", required=True)
args = ap.parse_args()

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
sys.stderr.reconfigure(encoding="utf-8", line_buffering=True)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", stream=sys.stdout)
logging.getLogger("asyncio").setLevel(logging.CRITICAL)

import torch  # noqa: E402  loads cuBLAS/cuDNN DLLs that CTranslate2 reuses
import uvicorn  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
from qts.server import create_app  # noqa: E402

catalog = json.loads((Path(__file__).parent / "catalog.json").read_text(encoding="utf-8"))
data_dir = Path(args.data_dir)
models_dir = Path(args.models_dir)
data_dir.mkdir(parents=True, exist_ok=True)
models_dir.mkdir(parents=True, exist_ok=True)

app = create_app(
    data_dir, models_dir, catalog, args.token,
    on_ready=lambda: print(f"QTS_READY {args.port} cuda={torch.cuda.is_available()}", flush=True),
)


uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
