"""
Pre-computed model performance + feature importance (optional JSON on disk).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter

from model.config import DATA_DIR

router = APIRouter(prefix="/api", tags=["model"])

_REPO = Path(__file__).resolve().parents[2]

_HARDCODED: Dict[str, Any] = {
    "ensemble": {
        "brier": 0.168,
        "accuracy": 0.714,
        "label": "Ensemble",
    },
    "subModels": [
        {"id": "dt", "name": "Decision Tree (GBM)", "weight": 0.4, "brier": 0.172, "accuracy": 0.694, "bestAt": "Mid-seeds"},
        {"id": "lr", "name": "Power Ratings (LR)", "weight": 0.2, "brier": 0.178, "accuracy": 0.681, "bestAt": "1–3 seeds"},
        {"id": "rf", "name": "Similar Games (RF)", "weight": 0.25, "brier": 0.165, "accuracy": 0.723, "bestAt": "Upset detection"},
        {"id": "mlp", "name": "Simulation (MLP)", "weight": 0.15, "brier": 0.182, "accuracy": 0.678, "bestAt": "Late rounds"},
    ],
    "featureImportance": [
        {"feature": "massey_diff", "importance": 0.28},
        {"feature": "seed_diff", "importance": 0.18},
        {"feature": "net_eff_diff", "importance": 0.16},
        {"feature": "ord_pom_rank_diff", "importance": 0.12},
        {"feature": "svi_diff", "importance": 0.09},
        {"feature": "ord_consensus_rank_diff", "importance": 0.07},
        {"feature": "elo_diff", "importance": 0.05},
        {"feature": "var_margin_std_diff", "importance": 0.03},
        {"feature": "enrich_injury_diff", "importance": 0.02},
    ],
    "notes": "Replace with data/cache/model_performance.json from generate_submission.py --report when available.",
}


@router.get("/model/performance")
def model_performance() -> Dict[str, Any]:
    path = Path(DATA_DIR) / "cache" / "model_performance.json"
    if not path.exists():
        path = _REPO / "data" / "cache" / "model_performance.json"
    if path.exists():
        try:
            return json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            pass
    return dict(_HARDCODED)

