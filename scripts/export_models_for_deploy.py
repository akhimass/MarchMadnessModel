#!/usr/bin/env python3
"""
Train once using the men's pipeline and save pickled models for fast API startup.

On Render (or any deploy), set:
  STANDARD_MODEL_PATH=<repo>/artifacts/standard.pkl
  CHAOS_MODEL_PATH=<repo>/artifacts/chaos.pkl

Run from repository root:
  python scripts/export_models_for_deploy.py

If .pkl files are large, track with Git LFS or upload to Render disk and point env vars there.
"""
from __future__ import annotations

import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))


def main() -> None:
    out_dir = _REPO / "artifacts"
    out_dir.mkdir(exist_ok=True)
    std_path = out_dir / "standard.pkl"
    chaos_path = out_dir / "chaos.pkl"

    from model.pipeline import MarchMadnessPipeline

    pipe = MarchMadnessPipeline(data_dir=_REPO / "data", gender="M")
    pipe.load_data()
    pipe.build_features()
    print("Training models (this is what Render does on every cold start without saved weights)...")
    pipe.train()

    if pipe.standard_model is None or pipe.chaos_model is None:
        raise RuntimeError("Training did not produce models.")

    pipe.standard_model.save(str(std_path))
    pipe.chaos_model.save(str(chaos_path))

    print(f"Wrote {std_path} ({std_path.stat().st_size:,} bytes)")
    print(f"Wrote {chaos_path} ({chaos_path.stat().st_size:,} bytes)")
    print()
    print("Render → Environment:")
    print(f'  STANDARD_MODEL_PATH=/opt/render/project/src/artifacts/standard.pkl')
    print(f'  CHAOS_MODEL_PATH=/opt/render/project/src/artifacts/chaos.pkl')
    print(f'  (or use relative paths ./artifacts/standard.pkl if cwd is repo root)')


if __name__ == "__main__":
    main()
