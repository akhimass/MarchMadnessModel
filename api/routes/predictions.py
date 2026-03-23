from __future__ import annotations

from typing import Any, Dict, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Request

from api.routes.models.schemas import MatchupModelBreakdown, MatchupResponse, TeamStats
from model.features.matchup_builder import create_matchup_features
from model.features.svi import classify_svi


router = APIRouter(prefix="/api", tags=["predictions"])


def _get_pipeline(request: Request) -> Any:
    pipe = getattr(request.app.state, "pipeline", None)
    if pipe is None:
        raise HTTPException(status_code=500, detail="Pipeline not loaded.")
    return pipe


def _get_pipeline_for_gender(request: Request, gender: str) -> Any:
    g = (gender or "M").upper().strip()
    if g == "W":
        pipe = getattr(request.app.state, "pipeline_w", None)
    else:
        pipe = getattr(request.app.state, "pipeline_m", None)
    if pipe is None:
        raise HTTPException(status_code=500, detail=f"Pipeline not loaded for gender={g}.")
    return pipe


def _rank_maps(pipeline: Any, season: int) -> Dict[str, Dict[int, int]]:
    """
    Build ranks for Massey and NetEff within a season.
    """
    if not hasattr(pipeline, "_rank_cache"):
        pipeline._rank_cache = {}

    cache = pipeline._rank_cache
    if season in cache:
        return cache[season]

    massey_by_team = pipeline.massey_ratings.get(season, {})
    net_eff_by_team = {
        int(tid): float(stats.get("NetEff", 0.0))
        for (s, tid), stats in pipeline.team_stats.items()
        if int(s) == season and stats is not None
    }

    massey_sorted = sorted(massey_by_team.items(), key=lambda kv: float(kv[1]), reverse=True)
    net_eff_sorted = sorted(net_eff_by_team.items(), key=lambda kv: float(kv[1]), reverse=True)

    massey_rank = {int(tid): idx + 1 for idx, (tid, _) in enumerate(massey_sorted)}
    neteff_rank = {int(tid): idx + 1 for idx, (tid, _) in enumerate(net_eff_sorted)}

    cache[season] = {"massey_rank": massey_rank, "neteff_rank": neteff_rank}
    return cache[season]


def _team_stats_to_response(pipeline: Any, team_id: int, season: int, request: Request) -> TeamStats:
    stats = pipeline.team_stats.get((season, int(team_id)), {})
    if not stats:
        # Still return a skeleton to avoid hard crashes in UI.
        return TeamStats(TeamID=int(team_id), TeamName=None, Seed=None)

    seed = float(pipeline.seeds_map.get((season, int(team_id)), 0.0))
    massey = float(pipeline.massey_ratings.get(season, {}).get(int(team_id), 0.0))
    svi = float(stats.get("SVI", 0.0))

    ranks = _rank_maps(pipeline, season)

    team_name = None
    teams_df = getattr(pipeline, "teams_df", None)
    if teams_df is not None and "TeamID" in teams_df.columns and "TeamName" in teams_df.columns:
        match = teams_df.loc[teams_df["TeamID"] == int(team_id)]
        if not match.empty:
            team_name = str(match["TeamName"].iloc[0])

    return TeamStats(
        TeamID=int(team_id),
        TeamName=team_name,
        Seed=seed if seed != 0.0 else None,
        eFG_off=float(stats.get("eFG_off", 0.0)),
        eFG_def=float(stats.get("eFG_def", 0.0)),
        TO_rate_off=float(stats.get("TO_rate_off", 0.0)),
        TO_rate_def=float(stats.get("TO_rate_def", 0.0)),
        OR_rate=float(stats.get("OR_rate", 0.0)),
        DR_rate=float(stats.get("DR_rate", 0.0)),
        FT_rate=float(stats.get("FT_rate", 0.0)),
        FT_rate_def=float(stats.get("FT_rate_def", 0.0)),
        OffEff=float(stats.get("OffEff", 0.0)),
        DefEff=float(stats.get("DefEff", 0.0)),
        NetEff=float(stats.get("NetEff", 0.0)),
        Pace=float(stats.get("Pace", 0.0)),
        AstRate=float(stats.get("AstRate", 0.0)),
        BlkRate=float(stats.get("BlkRate", 0.0)),
        StlRate=float(stats.get("StlRate", 0.0)),
        ThreePRate=float(stats.get("ThreePRate", 0.0)),
        ThreePARate=float(stats.get("ThreePARate", 0.0)),
        SVI=svi,
        SVI_category=classify_svi(svi),
        massey_rating=massey,
        elo=float(stats.get("elo_rating", stats.get("elo", 0.0)) or 0.0),
        massey_rank=ranks["massey_rank"].get(int(team_id)),
        neteff_rank=ranks["neteff_rank"].get(int(team_id)),
    )


@router.get("/matchup/{team1_id}/{team2_id}")
def get_matchup(
    team1_id: int,
    team2_id: int,
    request: Request,
    gender: str = "M",
) -> MatchupResponse:
    """
    Team1-relative matchup prediction with standard + chaos universes.
    """

    pipeline = _get_pipeline_for_gender(request, gender)
    season = int(getattr(pipeline, "season", 2026))

    # Cache matchup predictions so the UI can refresh without recomputing
    # the full feature vector + model ensemble every time.
    app_state = request.app.state
    cache = getattr(app_state, "_matchup_prediction_cache", None)
    if cache is None:
        cache = {}
        setattr(app_state, "_matchup_prediction_cache", cache)
    cache_key = (str(gender).upper().strip(), season, int(team1_id), int(team2_id))
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Build features for this matchup (including ordinal features when available).
    feats = pipeline._build_matchup_row(int(team1_id), int(team2_id), int(season))
    X = pd.DataFrame([feats])

    if pipeline.standard_model is None or pipeline.chaos_model is None:
        raise HTTPException(status_code=500, detail="Models not loaded.")

    standard_prob = float(pipeline.standard_model.predict_proba(X)[0])
    chaos_prob = float(pipeline.chaos_model.predict_proba(X)[0])

    breakdown_raw: Dict[str, float] = {}
    if hasattr(pipeline.standard_model, "get_model_breakdown"):
        breakdown_raw = pipeline.standard_model.get_model_breakdown(X)  # type: ignore[assignment]

    # Map breakdown keys to requested names.
    model_breakdown = MatchupModelBreakdown(
        decision_tree=float(breakdown_raw.get("Decision Tree (GBM)", 0.0)),
        power_ratings=float(breakdown_raw.get("Power Ratings (LR)", 0.0)),
        similar_games=float(breakdown_raw.get("Similar Games (RF)", 0.0)),
        simulation=float(breakdown_raw.get("Simulation (MLP)", 0.0)),
        seed_difference=float(feats.get("seed_hist_win_prob", 0.5)),
        overall=float(standard_prob),
    )

    upset_alert = bool((chaos_prob - standard_prob) > 0.08)
    giant_killer_score = float(chaos_prob - standard_prob)

    t1 = _team_stats_to_response(pipeline, int(team1_id), season, request)
    t2 = _team_stats_to_response(pipeline, int(team2_id), season, request)

    def _injury_payload(team_id: int) -> Dict[str, Any]:
        impacts = getattr(pipeline, "injury_impacts", {}) or {}
        rec = impacts.get(str(int(team_id)), {}) if isinstance(impacts, dict) else {}
        if not isinstance(rec, dict):
            rec = {}
        return {
            "adjustment": float(rec.get("adjustment", 0.0) or 0.0),
            "severity": str(rec.get("severity", "none") or "none"),
            "key_player": rec.get("key_player_out"),
            "reasoning": rec.get("reasoning", "") or "",
        }

    resp = MatchupResponse(
        standard_prob=standard_prob,
        chaos_prob=chaos_prob,
        model_breakdown=model_breakdown,
        team1=t1,
        team2=t2,
        team1_stats=t1,
        team2_stats=t2,
        upset_alert=upset_alert,
        giant_killer_score=giant_killer_score,
        injury1=_injury_payload(int(team1_id)),
        injury2=_injury_payload(int(team2_id)),
        narrative=None,
    )

    cache[cache_key] = resp
    return resp


@router.get("/team/{team_id}/stats")
def get_team_profile(team_id: int, request: Request, gender: str = "M") -> TeamStats:
    pipeline = _get_pipeline_for_gender(request, gender)
    season = int(getattr(pipeline, "season", 2026))
    return _team_stats_to_response(pipeline, int(team_id), season, request)

