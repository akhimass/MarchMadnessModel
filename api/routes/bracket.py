from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Request

from api.routes.models.schemas import (
    BracketPickRequest,
    BracketSimulationResponse,
    BracketRoundMatchupsRequest,
    BracketRoundMatchupsResponse,
    BracketRoundMatchup,
    FirstRoundMatchupsResponse,
    UpsetPicksResponse,
)
from model.simulation.monte_carlo import BracketSimulator


router = APIRouter(prefix="/api", tags=["bracket"])


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


def _get_seed_token_to_team_id(pipeline: Any, season: int) -> Dict[str, int]:
    seeds_df = pipeline.seeds_df
    out: Dict[str, int] = {}
    s = seeds_df.loc[seeds_df["Season"] == season]
    for _, r in s.iterrows():
        out[str(r["Seed"])] = int(r["TeamID"])
    return out


_LETTER_TO_UI_REGION_KEY = {
    # Kaggle uses W/X/Y/Z seed token prefixes for the 4 regions.
    # Frontend tabs use: east/south/west/midwest.
    "W": "east",
    "X": "south",
    "Y": "west",
    "Z": "midwest",
}

_UI_REGION_KEY_TO_UI_REGION = {
    "east": "East",
    "south": "South",
    "west": "West",
    "midwest": "Midwest",
}


def _parse_seed_num(seed_token: str) -> int:
    import re

    m = re.search(r"(\d{1,2})", str(seed_token))
    return int(m.group(1)) if m else 0


@router.get("/bracket/simulate")
def simulate_bracket(request: Request, n: int = 10_000, gender: str = "M") -> BracketSimulationResponse:
    pipeline = _get_pipeline_for_gender(request, gender)
    season = int(getattr(pipeline, "season", 2026))

    if pipeline.standard_model is None or pipeline.chaos_model is None:
        raise HTTPException(status_code=500, detail="Models not loaded.")

    simulator = BracketSimulator(
        seeds_df=pipeline.seeds_df,
        slots_df=pipeline.slots_df,
        teams_df=pipeline.teams_df,
        model={"standard": pipeline.standard_model, "chaos": pipeline.chaos_model},
        season=season,
        gender=pipeline.gender,
        feature_builder=pipeline._feature_builder_for_matchups(),  # type: ignore[attr-defined]
    )

    results = simulator.run_simulations(n=n, use_chaos=False)
    survival = simulator.get_round_by_round_survival(results)
    champ_odds = simulator.get_championship_probabilities(results)

    teams_formatted: List[Dict[str, Any]] = []
    # Use simulation output as the source of truth for top teams.
    for _, row in results.head(50).iterrows():
        teams_formatted.append(
            {
                "teamId": int(row.get("TeamID", 0) or 0),
                "teamName": str(row.get("TeamName", "") or ""),
                "champProb": round(float(row.get("Champ", 0.0) or 0.0) * 100.0, 1),
                "finalFourProb": round(float(row.get("F4", 0.0) or 0.0) * 100.0, 1),
                "elite8Prob": round(float(row.get("E8", 0.0) or 0.0) * 100.0, 1),
                "avgWins": round(float(row.get("AvgWins", 0.0) or 0.0), 2),
            }
        )
    teams_formatted = sorted(teams_formatted, key=lambda x: float(x["champProb"]), reverse=True)[:20]

    return BracketSimulationResponse(
        survival=survival.to_dict(orient="records"),
        championship_odds=champ_odds,
        teams=teams_formatted,
    )


@router.get("/bracket/favorite-picks")
def bracket_favorite_picks(request: Request, gender: str = "M", chaos: bool = False) -> Dict[str, Any]:
    """
    Deterministic bracket: model favorite wins each game (no Monte Carlo).
    Used to project full bracket for Live Bracket / read-only views.
    """
    pipeline = _get_pipeline_for_gender(request, gender)
    season = int(getattr(pipeline, "season", 2026))

    if pipeline.standard_model is None or pipeline.chaos_model is None:
        raise HTTPException(status_code=500, detail="Models not loaded.")

    simulator = BracketSimulator(
        seeds_df=pipeline.seeds_df,
        slots_df=pipeline.slots_df,
        teams_df=pipeline.teams_df,
        model={"standard": pipeline.standard_model, "chaos": pipeline.chaos_model},
        season=season,
        gender=pipeline.gender,
        feature_builder=pipeline._feature_builder_for_matchups(),  # type: ignore[attr-defined]
    )

    picks = simulator.simulate_deterministic_favorites(use_chaos=bool(chaos))
    return {"season": season, "gender": (gender or "M").upper().strip(), "picks": picks}


@router.get("/bracket/first-round")
def first_round_matchups(
    request: Request,
    season: int = 2026,
    gender: str = "M",
) -> FirstRoundMatchupsResponse:
    """
    Return first-round (Round of 64) matchups grouped by UI region key.

    Output schema matches the frontend `BracketMatchup`-driven UI.
    """
    pipeline = _get_pipeline_for_gender(request, gender)

    if pipeline.standard_model is None or pipeline.chaos_model is None:
        raise HTTPException(status_code=500, detail="Models not loaded.")

    season_i = int(getattr(pipeline, "season", season) or season)

    # Cache first-round matchups so we don't recompute predictions every time
    # the UI loads/refreshes.
    app_state = request.app.state
    cache = getattr(app_state, "_first_round_matchups_cache", None)
    if cache is None:
        cache = {}
        setattr(app_state, "_first_round_matchups_cache", cache)
    cache_key = (str(gender).upper().strip(), season_i)
    cached = cache.get(cache_key)
    if cached is not None:
        return FirstRoundMatchupsResponse(matchupsByRegion=cached)

    slots_df = pipeline.slots_df
    if slots_df is None:
        raise HTTPException(status_code=500, detail="slots_df not available.")

    # Matchups are represented as StrongSeed vs WeakSeed tokens.
    slots_season = slots_df.loc[slots_df["Season"] == season_i].copy()
    first_round_slots = slots_season[slots_season["Slot"].str.startswith("R1")]

    if first_round_slots.empty:
        return FirstRoundMatchupsResponse(matchupsByRegion={})

    seeds_df = pipeline.seeds_df
    if seeds_df is None:
        raise HTTPException(status_code=500, detail="seeds_df not available.")

    token_to_team = _get_seed_token_to_team_id(pipeline, season_i)

    # Team name lookup for UI.
    teams_df = getattr(pipeline, "teams_df", None)
    team_name_map: Dict[int, str] = {}
    if teams_df is not None and "TeamID" in teams_df.columns and "TeamName" in teams_df.columns:
        team_name_map = {int(tid): str(name) for tid, name in zip(teams_df["TeamID"], teams_df["TeamName"])}

    by_region: Dict[str, list] = {k: [] for k in _LETTER_TO_UI_REGION_KEY.values()}

    for _, row in first_round_slots.iterrows():
        strong_token = str(row["StrongSeed"])
        weak_token = str(row["WeakSeed"])
        slot_token = str(row["Slot"])

        team1_id = token_to_team.get(strong_token)
        team2_id = token_to_team.get(weak_token)
        if team1_id is None or team2_id is None:
            continue

        seed1 = float(_parse_seed_num(strong_token))
        seed2 = float(_parse_seed_num(weak_token))

        region_key = _LETTER_TO_UI_REGION_KEY.get(strong_token[0], "east")
        region_ui = _UI_REGION_KEY_TO_UI_REGION.get(region_key, "East")

        pred = pipeline.get_matchup_prediction(int(team1_id), int(team2_id))
        standard_prob = float(pred.get("standard_prob", 0.0))
        upset_alert = bool(pred.get("upset_alert", False))

        by_region[region_key].append(
            {
                "id": f"{int(team1_id)}-{int(team2_id)}",
                "slot": slot_token,
                "team1": {
                    "teamId": int(team1_id),
                    "teamName": team_name_map.get(int(team1_id)),
                    "seed": seed1,
                    "seedStr": strong_token,
                    "region": region_ui,
                    "gender": (gender or "M").upper().strip(),
                },
                "team2": {
                    "teamId": int(team2_id),
                    "teamName": team_name_map.get(int(team2_id)),
                    "seed": seed2,
                    "seedStr": weak_token,
                    "region": region_ui,
                    "gender": (gender or "M").upper().strip(),
                },
                "prob": round(standard_prob * 100.0, 2),
                "upsetFlag": upset_alert,
            }
        )
    cache[cache_key] = by_region
    return FirstRoundMatchupsResponse(matchupsByRegion=by_region)


@router.post("/bracket/round-matchups")
def round_matchups(
    request: BracketRoundMatchupsRequest,
    request_: Request,
    stage: str | None = None,
    season: int = 2026,
    gender: str = "M",
) -> BracketRoundMatchupsResponse:
    """
    Resolve matchups for a given bracket stage (R1..R6) based on user picks.

    Input:
      picks: {slot_token: winner_team_id}

    Output:
      matchups: only includes fully resolved matchups where both sides are known.
    """
    pipeline = _get_pipeline_for_gender(request_, gender)
    season_i = int(getattr(pipeline, "season", season) or season)

    # Accept stage from request body or query string for compatibility.
    stage = (request.stage or stage or "").upper().strip()
    if not stage.startswith("R"):
        raise HTTPException(status_code=400, detail=f"Invalid stage: {stage}")

    picks = request.picks or {}

    # Seeds: token_to_team maps e.g. "W01" -> 1181
    token_to_team = _get_seed_token_to_team_id(pipeline, season_i)

    # UI region for a team is derived from its seed token prefix (W/X/Y/Z)
    team_seed_token_to_ui_region: Dict[int, str] = {}
    if pipeline.seeds_df is not None:
        seeds_season = pipeline.seeds_df.loc[pipeline.seeds_df["Season"] == season_i].copy()
        for _, r in seeds_season.iterrows():
            tid = int(r["TeamID"])
            seed_token = str(r["Seed"])
            letter = seed_token[:1] if seed_token else ""
            ui_region = _UI_REGION_KEY_TO_UI_REGION.get(_LETTER_TO_UI_REGION_KEY.get(letter, "east"), "East")
            team_seed_token_to_ui_region[tid] = ui_region

    # Team name lookup
    team_name_map: Dict[int, str] = {}
    teams_df = getattr(pipeline, "teams_df", None)
    if teams_df is not None and "TeamID" in teams_df.columns and "TeamName" in teams_df.columns:
        team_name_map = {int(tid): str(name) for tid, name in zip(teams_df["TeamID"], teams_df["TeamName"])}

    # Team seed string token lookup (seedStr)
    team_id_to_seed_str: Dict[int, str] = {}
    if pipeline.seeds_df is not None:
        seeds_season = pipeline.seeds_df.loc[pipeline.seeds_df["Season"] == season_i].copy()
        for _, r in seeds_season.iterrows():
            tid = int(r["TeamID"])
            team_id_to_seed_str[tid] = str(r["Seed"])

    slots_df = pipeline.slots_df
    if slots_df is None:
        raise HTTPException(status_code=500, detail="slots_df not available.")
    slots_season = slots_df.loc[slots_df["Season"] == season_i].copy()

    slot_row_by_slot: Dict[str, Any] = {
        str(r["Slot"]): r for _, r in slots_season.iterrows()
    }
    resolve_cache: Dict[str, int | None] = {}

    def resolve_ref(ref: str) -> int | None:
        """
        Resolve a slot/seed token to a concrete team id.

        Handles:
        - direct user picks (slot -> winner)
        - direct seed tokens from seeds_df (e.g. W01, Z12)
        - play-in slot tokens (e.g. X16, Y11) by recursively resolving both
          sides of that play-in and auto-advancing the model favorite.
        """
        ref_s = str(ref)
        if ref_s in resolve_cache:
            return resolve_cache[ref_s]

        # 1) If user already picked this slot, resolve from picks.
        if ref_s in picks:
            out = int(picks[ref_s])
            resolve_cache[ref_s] = out
            return out

        # 2) Direct seed token (W01/X16a/etc) from seeds_df mapping.
        if ref_s in token_to_team:
            out = int(token_to_team[ref_s])
            resolve_cache[ref_s] = out
            return out

        # 3) Slot token (not directly seeded): resolve from its strong/weak refs.
        playin_row = slot_row_by_slot.get(ref_s)
        if playin_row is None:
            resolve_cache[ref_s] = None
            return None

        strong_ref = str(playin_row["StrongSeed"])
        weak_ref = str(playin_row["WeakSeed"])
        strong_team = resolve_ref(strong_ref)
        weak_team = resolve_ref(weak_ref)
        if strong_team is None or weak_team is None:
            resolve_cache[ref_s] = None
            return None

        # Auto-advance winner for unresolved play-in slot tokens.
        pred = pipeline.get_matchup_prediction(int(strong_team), int(weak_team))
        p_strong = float(pred.get("standard_prob", 0.0) or 0.0)
        out = int(strong_team) if p_strong >= 0.5 else int(weak_team)
        resolve_cache[ref_s] = out
        return out

    stage_slots = slots_season[slots_season["Slot"].astype(str).str.startswith(stage)].copy()
    stage_slots = stage_slots.sort_values(by=["Slot"])

    out: list[BracketRoundMatchup] = []

    for _, row in stage_slots.iterrows():
        slot_token = str(row["Slot"])
        strong_ref = str(row["StrongSeed"])
        weak_ref = str(row["WeakSeed"])

        team1_id = resolve_ref(strong_ref)
        team2_id = resolve_ref(weak_ref)

        # Only return fully resolved matchups.
        if team1_id is None or team2_id is None:
            continue

        pred = pipeline.get_matchup_prediction(int(team1_id), int(team2_id))
        standard_prob = float(pred.get("standard_prob", 0.0) or 0.0)
        upset_alert = bool(pred.get("upset_alert", False))

        seed1 = float(pipeline.seeds_map.get((season_i, int(team1_id)), 0.0) or 0.0)
        seed2 = float(pipeline.seeds_map.get((season_i, int(team2_id)), 0.0) or 0.0)
        ui_region1 = team_seed_token_to_ui_region.get(int(team1_id), "East")
        ui_region2 = team_seed_token_to_ui_region.get(int(team2_id), "East")

        gender_u = (gender or "M").upper().strip()

        out.append(
            BracketRoundMatchup(
                id=f"{int(team1_id)}-{int(team2_id)}",
                slot=slot_token,
                team1={
                    "teamId": int(team1_id),
                    "teamName": team_name_map.get(int(team1_id)),
                    "seed": seed1 if seed1 != 0.0 else None,
                    "seedStr": team_id_to_seed_str.get(int(team1_id)),
                    "region": ui_region1,
                    "gender": gender_u,
                },
                team2={
                    "teamId": int(team2_id),
                    "teamName": team_name_map.get(int(team2_id)),
                    "seed": seed2 if seed2 != 0.0 else None,
                    "seedStr": team_id_to_seed_str.get(int(team2_id)),
                    "region": ui_region2,
                    "gender": gender_u,
                },
                prob=round(standard_prob * 100.0, 2),
                upsetFlag=upset_alert,
            )
        )

    return BracketRoundMatchupsResponse(stage=stage, matchups=out)


@router.get("/upset-picks")
def get_upset_picks(request: Request, n: int = 12, gender: str = "M") -> UpsetPicksResponse:
    pipeline = _get_pipeline_for_gender(request, gender)
    season = int(getattr(pipeline, "season", 2026))

    if pipeline.chaos_model is None:
        raise HTTPException(status_code=500, detail="Chaos model not loaded.")

    slots_df = pipeline.slots_df
    seeds_df = pipeline.seeds_df

    slots_season = slots_df.loc[slots_df["Season"] == season].copy()
    first_round_slots = slots_season[slots_season["Slot"].str.startswith("R1")]

    if first_round_slots.empty:
        return UpsetPicksResponse(picks=[])

    seed_token_to_team = _get_seed_token_to_team_id(pipeline, season)

    # Build numerical seed map for choosing the underdog.
    seed_num_by_team: Dict[int, float] = {
        int(tid): float(seed)
        for (s, tid), seed in pipeline.seeds_map.items()
        if int(s) == season
    }

    feature_builder = pipeline._feature_builder_for_matchups()  # type: ignore[attr-defined]

    picks: List[Dict[str, Any]] = []
    for _, slot_row in first_round_slots.iterrows():
        strong_token = str(slot_row["StrongSeed"])
        weak_token = str(slot_row["WeakSeed"])

        if strong_token not in seed_token_to_team or weak_token not in seed_token_to_team:
            continue

        strong_team = seed_token_to_team[strong_token]
        weak_team = seed_token_to_team[weak_token]

        # Underdog has the worse (higher number) seed.
        strong_seed = seed_num_by_team.get(int(strong_team), 99.0)
        weak_seed = seed_num_by_team.get(int(weak_team), 99.0)

        favorite_team = int(strong_team) if strong_seed < weak_seed else int(weak_team)
        underdog_team = int(weak_team) if favorite_team == int(strong_team) else int(strong_team)

        feats = feature_builder(underdog_team, favorite_team, season)
        X = pd.DataFrame([feats])
        # Chaos model returns P(team1 wins) where team1 is underdog.
        p_upset = float(pipeline.chaos_model.predict_proba(X)[0])

        picks.append(
            {
                "underdog_team_id": int(underdog_team),
                "favorite_team_id": int(favorite_team),
                "underdog_seed": float(seed_num_by_team.get(int(underdog_team), np.nan)),
                "favorite_seed": float(seed_num_by_team.get(int(favorite_team), np.nan)),
                "chaos_upset_prob": p_upset,
                "slot_candidates": str(slot_row["Slot"]),
            }
        )

    picks_sorted = sorted(picks, key=lambda r: float(r["chaos_upset_prob"]), reverse=True)[: int(n)]
    return UpsetPicksResponse(picks=picks_sorted)


@router.post("/bracket/pick")
def bracket_pick(req: BracketPickRequest, request: Request, gender: str = "M") -> Dict[str, Any]:
    """
    Given a user-picked winner for `slot`, return the next matchup(s) where that slot
    feeds into the bracket.
    """
    pipeline = _get_pipeline_for_gender(request, gender)
    season = int(getattr(pipeline, "season", 2026))

    slot = str(req.slot)
    winner_team_id = int(req.winner_team_id)

    slots_season = pipeline.slots_df.loc[pipeline.slots_df["Season"] == season].copy()
    token_to_team = _get_seed_token_to_team_id(pipeline, season)

    # Next slots that depend on this slot as either StrongSeed or WeakSeed.
    next_strong = slots_season.loc[slots_season["StrongSeed"] == slot]
    next_weak = slots_season.loc[slots_season["WeakSeed"] == slot]

    next_slots = pd.concat([next_strong, next_weak]).drop_duplicates(subset=["Slot"])
    if next_slots.empty:
        return {"next": None, "message": "This slot does not feed into a later matchup."}

    out: List[Dict[str, Any]] = []
    for _, row in next_slots.iterrows():
        next_slot = str(row["Slot"])
        strong_ref = str(row["StrongSeed"])
        weak_ref = str(row["WeakSeed"])

        strong_team = winner_team_id if strong_ref == slot else None
        weak_team = winner_team_id if weak_ref == slot else None

        # If the other side is a seed token, we can resolve it.
        if strong_team is None and weak_ref == slot:
            if strong_ref in token_to_team:
                strong_team = token_to_team[strong_ref]
        if weak_team is None and strong_ref == slot:
            if weak_ref in token_to_team:
                weak_team = token_to_team[weak_ref]

        out.append(
            {
                "slot": next_slot,
                "strong_ref": strong_ref,
                "weak_ref": weak_ref,
                "strong_team_id": strong_team,
                "weak_team_id": weak_team,
            }
        )

    return {"next": out[0] if len(out) == 1 else out}

