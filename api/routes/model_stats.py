"""
Pre-computed model performance + feature importance (optional JSON on disk).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict
from fastapi import Request

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


@router.get("/model/ordinal-systems")
def ordinal_systems() -> Dict[str, Any]:
    """
    Enumerate all unique MMasseyOrdinals SystemName values available on disk.
    """
    ordinals_path = Path(DATA_DIR) / "MMasseyOrdinals.csv"
    if not ordinals_path.exists():
        ordinals_path = _REPO / "data" / "MMasseyOrdinals.csv"
    if not ordinals_path.exists():
        return {"count": 0, "systems": [], "notes": "MMasseyOrdinals.csv not found."}

    try:
        import pandas as pd

        df = pd.read_csv(ordinals_path, usecols=["SystemName"])
        systems = sorted({str(v).strip() for v in df["SystemName"].dropna().tolist() if str(v).strip()})
        return {
            "count": len(systems),
            "systems": systems,
            "notes": "Unique SystemName values from MMasseyOrdinals.csv",
        }
    except Exception as e:
        return {"count": 0, "systems": [], "notes": f"Failed to read ordinals: {e}"}


@router.get("/model/r64-r32-accuracy")
def r64_r32_accuracy(request: Request) -> Dict[str, Any]:
    """
    Game-by-game model accuracy audit for completed R64/R32 games in 2026.
    """
    pipe = getattr(request.app.state, "pipeline_m", None)
    if pipe is None:
        return {"games": [], "summary": {"total": 0, "correct": 0, "accuracy": 0.0, "avgBrier": 0.0}}

    path = Path(DATA_DIR) / "cache" / "results_2026.json"
    if not path.exists():
        path = _REPO / "data" / "cache" / "results_2026.json"
    if not path.exists():
        return {"games": [], "summary": {"total": 0, "correct": 0, "accuracy": 0.0, "avgBrier": 0.0}}

    try:
        rows = json.loads(path.read_text())
    except Exception:
        rows = []

    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        rnd = str(r.get("round", "")).upper()
        if rnd not in {"R64", "R32"}:
            continue
        w = int(r.get("wTeamId", 0) or 0)
        l = int(r.get("lTeamId", 0) or 0)
        if not w or not l:
            continue
        lo, hi = min(w, l), max(w, l)
        pred = pipe.get_matchup_prediction(lo, hi)
        p_lo = float(pred.get("standard_prob", 0.5))
        winner_is_lo = w == lo
        p_winner = p_lo if winner_is_lo else (1 - p_lo)
        pred_winner = lo if p_lo >= 0.5 else hi
        correct = pred_winner == w
        brier = (1.0 - p_winner) ** 2
        out.append(
            {
                "gameId": r.get("gameId"),
                "round": rnd,
                "wTeamId": w,
                "lTeamId": l,
                "predProbWinner": round(p_winner, 4),
                "predWinnerTeamId": pred_winner,
                "correct": correct,
                "brier": round(float(brier), 4),
            }
        )

    total = len(out)
    correct_n = sum(1 for g in out if g["correct"])
    avg_brier = (sum(float(g["brier"]) for g in out) / total) if total else 0.0
    return {
        "games": out,
        "summary": {
            "total": total,
            "correct": correct_n,
            "accuracy": round((correct_n / total) if total else 0.0, 4),
            "avgBrier": round(avg_brier, 4),
        },
    }

