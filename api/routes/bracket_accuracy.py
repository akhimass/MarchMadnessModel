"""
Bracket accuracy: compare deterministic model brackets to truth (CSV + optional JSON).
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

from model.bracket_accuracy import (
    HeuristicBracketModel,
    compute_metrics,
    load_compact_results_frame,
    load_truth_slots_from_json,
    merge_truth,
    team_name_map_from_pipeline,
)
from model.simulation.monte_carlo import BracketSimulator

router = APIRouter(prefix="/api", tags=["bracket"])


def _get_pipeline_for_gender(request: Request, gender: str) -> Any:
    g = (gender or "M").upper().strip()
    if g == "W":
        pipe = getattr(request.app.state, "pipeline_w", None)
    else:
        pipe = getattr(request.app.state, "pipeline_m", None)
    if pipe is None:
        raise HTTPException(status_code=500, detail=f"Pipeline not loaded for gender={g}.")
    return pipe


def _make_simulator(pipeline: Any) -> BracketSimulator:
    if pipeline.standard_model is None or pipeline.chaos_model is None:
        raise HTTPException(status_code=500, detail="Models not loaded.")
    return BracketSimulator(
        seeds_df=pipeline.seeds_df,
        slots_df=pipeline.slots_df,
        teams_df=pipeline.teams_df,
        model={"standard": pipeline.standard_model, "chaos": pipeline.chaos_model},
        season=int(getattr(pipeline, "season", 2026)),
        gender=str(getattr(pipeline, "gender", "M")),
        feature_builder=pipeline._feature_builder_for_matchups(),  # type: ignore[attr-defined]
    )


@router.get("/bracket/accuracy")
def bracket_accuracy(request: Request, gender: str = "M", season: int = 2026) -> Dict[str, Any]:
    """
    Run deterministic brackets for multiple models and score against known results.

    Truth is merged from:
      - `MNCAATourneyCompactResults.csv` / `WNCAATourneyCompactResults.csv` (games played)
      - Optional `data/bracket_truth_{M|W}_{season}.json` (manual overrides / early results)

    When no truth data exists yet, `truthAvailable` is false and metrics are null.
    """
    pipeline = _get_pipeline_for_gender(request, gender)
    season_i = int(season)
    sim = _make_simulator(pipeline)

    truth_from_csv: Dict[str, int] = {}
    compact = load_compact_results_frame(gender)
    if compact is not None:
        truth_from_csv = sim.fill_from_compact_results(compact)

    truth_json = load_truth_slots_from_json(gender, season_i)
    truth = merge_truth(truth_from_csv, truth_json)
    truth_available = len(truth) > 0

    names = team_name_map_from_pipeline(pipeline)
    champ_slot = str(getattr(sim, "champion_slot", "R6CH"))

    rows: List[Dict[str, Any]] = []

    def add_row(
        row_id: str,
        label: str,
        pred: Dict[str, int],
        prob_fn: Callable[[int, int], float],
    ) -> None:
        metrics = None
        if truth_available:
            metrics = compute_metrics(sim, pred, truth, prob_fn)
        champ_id = pred.get(champ_slot)
        rows.append(
            {
                "id": row_id,
                "label": label,
                "metrics": metrics,
                "championTeamId": champ_id,
                "championTeamName": names.get(int(champ_id)) if champ_id is not None else None,
            }
        )

    # Akhi standard
    pred_std = sim.simulate_deterministic_favorites(use_chaos=False)

    def prob_akhi_std(a: int, b: int) -> float:
        return float(sim._predict_prob_team1_wins_cached(int(a), int(b), use_chaos=False))

    add_row("akhi_standard", "Akhi model (standard)", pred_std, prob_akhi_std)

    # Akhi chaos universe
    pred_ch = sim.simulate_deterministic_favorites(use_chaos=True)

    def prob_akhi_ch(a: int, b: int) -> float:
        return float(sim._predict_prob_team1_wins_cached(int(a), int(b), use_chaos=True))

    add_row("akhi_chaos", "Akhi model (chaos)", pred_ch, prob_akhi_ch)

    # Heuristic brackets (separate simulators so probability cache stays clean)
    heuristics: List[tuple[str, str, str]] = [
        ("massey_rating", "Massey power ratings", "Higher Massey rating wins each game"),
        ("net_eff", "NET efficiency", "Higher NetEff wins each game"),
        ("seed", "Committee seed", "Better (lower) seed wins each game"),
        ("ordinal_mas", "Massey ordinals (MAS)", "Better (lower) MAS ordinal rank wins"),
    ]

    for hid, hlabel, _desc in heuristics:
        if hid == "ordinal_mas" and getattr(pipeline, "ordinal_features", None) is None:
            continue
        hmodel = HeuristicBracketModel(pipeline, hid)
        hsim = BracketSimulator(
            seeds_df=pipeline.seeds_df,
            slots_df=pipeline.slots_df,
            teams_df=pipeline.teams_df,
            model={"standard": hmodel},
            season=season_i,
            gender=str(getattr(pipeline, "gender", "M")),
            feature_builder=pipeline._feature_builder_for_matchups(),  # type: ignore[attr-defined]
        )
        pred_h = hsim.simulate_deterministic_favorites(use_chaos=False)

        def prob_heur(a: int, b: int, _m: HeuristicBracketModel = hmodel) -> float:
            return float(_m.predict_proba_matchup(int(a), int(b), season_i, use_chaos=False))

        add_row(hid, hlabel, pred_h, prob_heur)

    return {
        "season": season_i,
        "gender": (gender or "M").upper().strip(),
        "truthAvailable": truth_available,
        "truthGameCount": len(truth),
        "truthSources": {
            "fromCompactCsv": len(truth_from_csv),
            "fromJsonFile": len(truth_json),
        },
        "models": rows,
    }
