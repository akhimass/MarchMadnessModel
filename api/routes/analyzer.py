from __future__ import annotations

from pathlib import Path

import pandas as pd
from fastapi import APIRouter

router = APIRouter()
BASE_DIR = Path(__file__).resolve().parents[2]


@router.get("/api/analyzer/submission-stats")
async def get_submission_stats():
    """Return basic stats about the current submission.csv if it exists."""
    submission_path = BASE_DIR / "submission.csv"
    if not submission_path.exists():
        return {"available": False}

    df = pd.read_csv(submission_path)
    if "Pred" not in df.columns:
        return {"available": True, "rows": int(len(df)), "has_pred_column": False}

    return {
        "available": True,
        "rows": int(len(df)),
        "has_pred_column": True,
        "pred_min": float(df["Pred"].min()),
        "pred_max": float(df["Pred"].max()),
        "pred_mean": float(df["Pred"].mean()),
        "pred_std": float(df["Pred"].std()),
    }
