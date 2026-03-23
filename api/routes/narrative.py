from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import re
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, HTTPException, Request

from api.routes.models.schemas import NarrativeResponse
from model.features.svi import classify_svi


router = APIRouter(prefix="/api", tags=["narrative"])

# Claude SDK can choke if the API key contains smart quotes / non-ASCII.
def _sanitize_api_key(key: str) -> str:
    k = str(key or "").strip()
    # Normalize common “smart quote” variants to plain quotes.
    k = k.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    # Strip any surrounding quotes.
    k = k.strip().strip('"').strip("'")
    # Remove remaining non-ASCII characters to avoid header encoding errors.
    k = "".join(ch for ch in k if ord(ch) < 128)
    return k

# In-memory cache: (team1_id, team2_id) -> generated narrative JSON.
_NARRATIVE_CACHE: Dict[Tuple[int, int], Dict[str, str]] = {}


def _get_pipeline(request: Request) -> Any:
    pipe = getattr(request.app.state, "pipeline", None)
    if pipe is None:
        raise HTTPException(status_code=500, detail="Pipeline not loaded.")
    return pipe


def _get_team_card(pipeline: Any, team_id: int, season: int) -> Dict[str, Any]:
    stats = pipeline.team_stats.get((season, int(team_id)), {}) or {}
    seed = float(pipeline.seeds_map.get((season, int(team_id)), 0.0))
    massey = float(pipeline.massey_ratings.get(season, {}).get(int(team_id), 0.0))
    svi = float(stats.get("SVI", 0.0))
    cat = classify_svi(svi)
    name = None
    teams_df = getattr(pipeline, "teams_df", None)
    if teams_df is not None and "TeamID" in teams_df.columns and "TeamName" in teams_df.columns:
        match = teams_df.loc[teams_df["TeamID"] == int(team_id)]
        if not match.empty:
            name = str(match["TeamName"].iloc[0])

    return {
        "TeamID": int(team_id),
        "TeamName": name,
        "Seed": seed if seed != 0.0 else None,
        "Games": stats.get("Games", None),
        "Wins": stats.get("Wins", None),
        "massey_rating": massey,
        "NetEff": float(stats.get("NetEff", 0.0)),
        "eFG_off": float(stats.get("eFG_off", 0.0)),
        "eFG_def": float(stats.get("eFG_def", 0.0)),
        "TO_rate_off": float(stats.get("TO_rate_off", 0.0)),
        "TO_rate_def": float(stats.get("TO_rate_def", 0.0)),
        "OR_rate": float(stats.get("OR_rate", 0.0)),
        "DR_rate": float(stats.get("DR_rate", 0.0)),
        "FT_rate": float(stats.get("FT_rate", 0.0)),
        "ThreePRate": float(stats.get("ThreePRate", 0.0)),
        "net_TO_diff": float(stats.get("net_TO_diff", 0.0)),
        "net_reb_margin": float(stats.get("net_reb_margin", 0.0)),
        "SVI": svi,
        "SVI_category": cat,
    }


def _compute_record_from_games_wins(games: Optional[float], wins: Optional[float]) -> str:
    if games is None or wins is None:
        return ""
    try:
        g = int(games)
        w = int(wins)
        return f"{w}-{g - w}"
    except Exception:
        return ""


def _load_conference_map(pipeline: Any) -> Dict[Tuple[int, int], str]:
    """
    Load { (season, team_id) -> ConfAbbrev } lazily from MTeamConferences.csv / WTeamConferences.csv.
    """
    cache = getattr(pipeline, "_conf_map_cache", None)
    if cache is not None:
        return cache

    gender = getattr(pipeline, "gender", "M")
    prefix = "M" if str(gender).upper() == "M" else "W"

    repo_root = Path(__file__).resolve().parents[2]  # MarchMadnessModel/
    conf_path = repo_root / f"{prefix}TeamConferences.csv"

    conf_map: Dict[Tuple[int, int], str] = {}
    try:
        import pandas as pd

        if conf_path.exists():
            df = pd.read_csv(conf_path)
            for _, r in df.iterrows():
                conf_map[(int(r["Season"]), int(r["TeamID"]))] = str(r["ConfAbbrev"])
    except Exception:
        conf_map = {}

    pipeline._conf_map_cache = conf_map
    return conf_map


def _get_massey_ranks(pipeline: Any, season: int) -> Dict[int, int]:
    """
    Compute Massey ranks within the season (1 = best).
    """
    cache = getattr(pipeline, "_massey_rank_cache", None)
    if cache is None:
        cache = {}
        pipeline._massey_rank_cache = cache
    if season in cache:
        return cache[season]

    massey_by_team = pipeline.massey_ratings.get(season, {})
    massey_sorted = sorted(massey_by_team.items(), key=lambda kv: float(kv[1]), reverse=True)
    ranks = {int(tid): idx + 1 for idx, (tid, _) in enumerate(massey_sorted)}
    cache[season] = ranks
    return ranks


def _pick_vulnerability_note(team1: Dict[str, Any], team2: Dict[str, Any]) -> str:
    """
    Choose the key matchup vulnerability note: turnovers, rebounding, or FT reliance.
    """
    s1 = team1.get("stats", {})
    s2 = team2.get("stats", {})

    to_gap = abs(float(s1.get("net_TO_diff", 0.0)) - float(s2.get("net_TO_diff", 0.0)))
    reb_gap = abs(float(s1.get("net_reb_margin", 0.0)) - float(s2.get("net_reb_margin", 0.0)))
    ft_gap = abs(float(s1.get("FT_rate", 0.0)) - float(s2.get("FT_rate", 0.0)))

    if to_gap >= reb_gap and to_gap >= ft_gap:
        vulnerable = team1["name"] if float(s1.get("net_TO_diff", 0.0)) < float(s2.get("net_TO_diff", 0.0)) else team2["name"]
        return f"{vulnerable} can be dragged into turnover trouble."

    if reb_gap >= to_gap and reb_gap >= ft_gap:
        vulnerable = team1["name"] if float(s1.get("net_reb_margin", 0.0)) < float(s2.get("net_reb_margin", 0.0)) else team2["name"]
        return f"{vulnerable} may struggle to own the rebounding margins."

    vulnerable = team1["name"] if float(s1.get("FT_rate", 0.0)) > float(s2.get("FT_rate", 0.0)) else team2["name"]
    return f"{vulnerable} leans on free throws, which raises structural risk."


def _parse_json_dict(text: str) -> Dict[str, str]:
    """
    Extract and parse a JSON object from a Claude response.
    """
    text = text.strip()
    # Try direct parse first.
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return {str(k): str(v) for k, v in obj.items()}
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Claude response did not contain a JSON object.")

    obj = json.loads(text[start : end + 1])
    if not isinstance(obj, dict):
        raise ValueError("Claude JSON object was not a dict.")
    return {str(k): str(v) for k, v in obj.items()}


async def generate_matchup_narrative(
    team1: dict,
    # {name, seed, record, conference, massey, svi, stats}
    team2: dict,
    prediction: dict,
    # {standard_prob, model_breakdown, upset_alert}
) -> dict:
    """
    Generate Akhi-style matchup narratives using Claude, with in-memory caching.
    """

    team1_id = int(team1.get("team_id", 0) or 0)
    team2_id = int(team2.get("team_id", 0) or 0)

    if team1_id and team2_id:
        cache_key = (team1_id, team2_id)
        cached = _NARRATIVE_CACHE.get(cache_key)
        if cached is not None:
            return cached
    else:
        cache_key = None

    def _fallback_out() -> dict:
        # Deterministic fallback matching the requested style.
        key_factor = (
            "turnovers"
            if "turnover" in vulnerability_note.lower()
            else ("rebounding" if "rebounding" in vulnerability_note.lower() else "free throws")
        )
        return {
            "team1_narrative": (
                f"The {team1_name} excel at net efficiency, ranking in the top 20 in Net Efficiency. "
                f"However, they struggle at {key_factor} variance, where they rank in the bottom 50% of all teams."
            ),
            "team2_narrative": (
                f"The {team2_name} excel at opponent shot quality, ranking in the top 20 in shooting efficiency. "
                f"However, they struggle at {key_factor} volatility, where they rank in the bottom 50% of all teams."
            ),
            "matchup_key": f"This game hinges on {key_factor}: who wins the possession-level margins and turns them into high-quality looks.",
        }

    system_prompt = """You are an analyst for Akhi's March Madness Analyzer generating bracket predictor content.
Write concise, punchy 2-3 sentence team profiles in exactly this style:
'The [TeamName] excel at [strength], ranking in the top 20 in [metric].
However, they struggle at [weakness], where they rank in the bottom 50% of all teams.'

Then write a 1-sentence matchup insight highlighting the key statistical
factor that determines this game (turnovers, rebounding, or FT reliance).
Keep it data-driven but accessible. No fluff."""

    vulnerability_note = _pick_vulnerability_note(team1, team2)
    win_prob = float(prediction.get("standard_prob", 0.5))

    # Stats shorthand
    s1 = team1.get("stats", {})
    s2 = team2.get("stats", {})

    seed1 = float(team1.get("seed", 0.0) or 0.0)
    seed2 = float(team2.get("seed", 0.0) or 0.0)
    team1_name = str(team1.get("name", "Team 1"))
    team2_name = str(team2.get("name", "Team 2"))

    record1 = str(team1.get("record", "") or "")
    record2 = str(team2.get("record", "") or "")
    conf1 = str(team1.get("conference", "") or "")
    conf2 = str(team2.get("conference", "") or "")

    massey1 = float(team1.get("massey", 0.0) or 0.0)
    massey2 = float(team2.get("massey", 0.0) or 0.0)
    massey_rank1 = int(team1.get("massey_rank", 0) or 0)
    massey_rank2 = int(team2.get("massey_rank", 0) or 0)

    svi1 = float(team1.get("svi", 0.0) or 0.0)
    svi2 = float(team2.get("svi", 0.0) or 0.0)
    svi_class1 = str(team1.get("svi_class", "") or "")
    svi_class2 = str(team2.get("svi_class", "") or "")

    net_eff1 = float(s1.get("NetEff", 0.0) or 0.0)
    net_eff2 = float(s2.get("NetEff", 0.0) or 0.0)

    efg1 = float(s1.get("eFG_off", 0.0) or 0.0)
    efg_def1 = float(s1.get("eFG_def", 0.0) or 0.0)
    efg2 = float(s2.get("eFG_off", 0.0) or 0.0)
    efg_def2 = float(s2.get("eFG_def", 0.0) or 0.0)

    to_rate1 = float(s1.get("TO_rate_off", 0.0) or 0.0)
    to_forced1 = float(s1.get("TO_rate_def", 0.0) or 0.0)
    to_rate2 = float(s2.get("TO_rate_off", 0.0) or 0.0)
    to_forced2 = float(s2.get("TO_rate_def", 0.0) or 0.0)

    or_rate1 = float(s1.get("OR_rate", 0.0) or 0.0)
    dr_rate1 = float(s1.get("DR_rate", 0.0) or 0.0)
    or_rate2 = float(s2.get("OR_rate", 0.0) or 0.0)
    dr_rate2 = float(s2.get("DR_rate", 0.0) or 0.0)

    ft_rate1 = float(s1.get("FT_rate", 0.0) or 0.0)
    ft_rate2 = float(s2.get("FT_rate", 0.0) or 0.0)

    user_prompt = f"""
Matchup: #{seed1} {team1_name} ({record1}, {conf1}) vs #{seed2} {team2_name} ({record2}, {conf2})

{team1_name} stats:
- Massey Rating: {massey1:.1f} (National Rank #{massey_rank1})
- SVI: {svi1:.3f} ({svi_class1})
- Net Efficiency: {net_eff1:.1f} pts/100 poss
- eFG%: {efg1:.1%} off, {efg_def1:.1%} def
- Turnover Rate: {to_rate1:.1%} (forced {to_forced1:.1%})
- Rebounding: OR {or_rate1:.1%}, DR {dr_rate1:.1%}
- FT Rate: {ft_rate1:.3f} (structural risk if high)

{team2_name} stats:
- Massey Rating: {massey2:.1f} (National Rank #{massey_rank2})
- SVI: {svi2:.3f} ({svi_class2})
- Net Efficiency: {net_eff2:.1f} pts/100 poss
- eFG%: {efg2:.1%} off, {efg_def2:.1%} def
- Turnover Rate: {to_rate2:.1%} (forced {to_forced2:.1%})
- Rebounding: OR {or_rate2:.1%}, DR {dr_rate2:.1%}
- FT Rate: {ft_rate2:.3f} (structural risk if high)

Win probability: {team1_name} {win_prob:.0%}
Key vulnerability: {vulnerability_note}

Write:
1. {team1_name} team profile (2-3 sentences)
2. {team2_name} team profile (2-3 sentences)  
3. Key matchup factor (1 sentence)
Return as JSON: {{"team1_narrative": "...", "team2_narrative": "...", "matchup_key": "..."}}
"""

    api_key = _sanitize_api_key(os.getenv("ANTHROPIC_API_KEY", ""))
    if not api_key:
        out = _fallback_out()
        if cache_key is not None:
            _NARRATIVE_CACHE[cache_key] = out
        return out

    try:
        from anthropic import AsyncAnthropic
    except Exception as e:
        out = _fallback_out()
        if cache_key is not None:
            _NARRATIVE_CACHE[cache_key] = out
        return out

    client = AsyncAnthropic(api_key=api_key)
    try:
        msg = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0.7,
        )

        text = msg.content[0].text if msg.content else ""
        parsed = _parse_json_dict(text)
    except Exception:
        # If Anthropic is unavailable / rejects the request (e.g. low credit balance),
        # return deterministic fallback instead of 500ing the whole endpoint.
        parsed = _fallback_out()

    if cache_key is not None:
        _NARRATIVE_CACHE[cache_key] = parsed
    return parsed


def _betting_angle(
    team1_name: str,
    team2_name: str,
    standard_prob: float,
    implied_prob: Optional[float],
    american_odds: Optional[int],
) -> str:
    edge_pct = None
    if implied_prob is not None:
        edge_pct = (standard_prob - implied_prob) * 100.0
    odds_bit = f"American odds {american_odds:+d}" if american_odds is not None else "listed odds"
    impl_bit = f"{implied_prob * 100:.1f}%" if implied_prob is not None else "the market"
    edge_bit = f"{edge_pct:+.1f} pts vs implied" if edge_pct is not None else "edge vs market"
    return (
        f"Betting angle: Our model gives {team1_name} a {standard_prob * 100:.1f}% win probability vs "
        f"market implied {impl_bit} ({odds_bit}). "
        f"This {edge_bit} — compare to {team2_name}'s profile and volatility before sizing."
    )


@router.get("/narrative/{team1_id}/{team2_id}")
async def get_narratives(
    team1_id: int,
    team2_id: int,
    request: Request,
    gender: str | None = None,
    context: Optional[str] = None,
    our_prob: Optional[float] = None,
    odds: Optional[int] = None,
) -> NarrativeResponse:
    # If gender isn't provided, infer from Kaggle team ID ranges:
    # W teams are typically 3000-3999; M teams are 1000-1999.
    if gender is None:
        inferred = "W" if max(int(team1_id), int(team2_id)) >= 3000 else "M"
        gender = inferred
    g = (gender or "M").upper().strip()
    if g == "W":
        pipeline = getattr(request.app.state, "pipeline_w", None)
    else:
        pipeline = getattr(request.app.state, "pipeline_m", None)
    if pipeline is None:
        raise HTTPException(status_code=500, detail=f"Pipeline not loaded for gender={g}.")
    season = int(getattr(pipeline, "season", 2026))

    # Build team payloads for Claude prompt.
    conf_map = _load_conference_map(pipeline)
    massey_rank_map = _get_massey_ranks(pipeline, season)

    t1_card = _get_team_card(pipeline, int(team1_id), season)
    t2_card = _get_team_card(pipeline, int(team2_id), season)

    team1_payload = {
        "team_id": int(team1_id),
        "name": t1_card.get("TeamName") or f"Team {team1_id}",
        "seed": float(t1_card.get("Seed") or 0.0),
        "record": _compute_record_from_games_wins(t1_card.get("Games"), t1_card.get("Wins")),
        "conference": conf_map.get((season, int(team1_id)), ""),
        "massey": float(t1_card.get("massey_rating") or 0.0),
        "massey_rank": int(massey_rank_map.get(int(team1_id), 0) or 0),
        "svi": float(t1_card.get("SVI") or 0.0),
        "svi_class": str(t1_card.get("SVI_category") or ""),
        "stats": {
            "NetEff": float(t1_card.get("NetEff") or 0.0),
            "eFG_off": float(t1_card.get("eFG_off") or 0.0),
            "eFG_def": float(t1_card.get("eFG_def") or 0.0),
            "TO_rate_off": float(t1_card.get("TO_rate_off") or 0.0),
            "TO_rate_def": float(t1_card.get("TO_rate_def") or 0.0),
            "OR_rate": float(t1_card.get("OR_rate") or 0.0),
            "DR_rate": float(t1_card.get("DR_rate") or 0.0),
            "FT_rate": float(t1_card.get("FT_rate") or 0.0),
            "net_TO_diff": float(t1_card.get("net_TO_diff") or 0.0),
            "net_reb_margin": float(t1_card.get("net_reb_margin") or 0.0),
        },
    }

    team2_payload = {
        "team_id": int(team2_id),
        "name": t2_card.get("TeamName") or f"Team {team2_id}",
        "seed": float(t2_card.get("Seed") or 0.0),
        "record": _compute_record_from_games_wins(t2_card.get("Games"), t2_card.get("Wins")),
        "conference": conf_map.get((season, int(team2_id)), ""),
        "massey": float(t2_card.get("massey_rating") or 0.0),
        "massey_rank": int(massey_rank_map.get(int(team2_id), 0) or 0),
        "svi": float(t2_card.get("SVI") or 0.0),
        "svi_class": str(t2_card.get("SVI_category") or ""),
        "stats": {
            "NetEff": float(t2_card.get("NetEff") or 0.0),
            "eFG_off": float(t2_card.get("eFG_off") or 0.0),
            "eFG_def": float(t2_card.get("eFG_def") or 0.0),
            "TO_rate_off": float(t2_card.get("TO_rate_off") or 0.0),
            "TO_rate_def": float(t2_card.get("TO_rate_def") or 0.0),
            "OR_rate": float(t2_card.get("OR_rate") or 0.0),
            "DR_rate": float(t2_card.get("DR_rate") or 0.0),
            "FT_rate": float(t2_card.get("FT_rate") or 0.0),
            "net_TO_diff": float(t2_card.get("net_TO_diff") or 0.0),
            "net_reb_margin": float(t2_card.get("net_reb_margin") or 0.0),
        },
    }

    matchup = pipeline.get_matchup_prediction(int(team1_id), int(team2_id))
    prediction_payload = {
        "standard_prob": float(matchup.get("standard_prob", 0.5)),
        "model_breakdown": matchup.get("model_breakdown", {}),
        "upset_alert": bool(matchup.get("upset_alert", False)),
    }

    generated = await generate_matchup_narrative(team1_payload, team2_payload, prediction_payload)

    betting_narrative: Optional[str] = None
    if (context or "").lower().strip() == "betting":
        std = float(our_prob) if our_prob is not None else float(prediction_payload.get("standard_prob", 0.5))
        implied = None
        if odds is not None:
            o = int(odds)
            if o > 0:
                implied = 100 / (o + 100)
            elif o < 0:
                implied = abs(o) / (abs(o) + 100)
        betting_narrative = _betting_angle(
            str(team1_payload["name"]),
            str(team2_payload["name"]),
            std,
            implied,
            int(odds) if odds is not None else None,
        )

    return NarrativeResponse(
        team1_narrative=generated.get("team1_narrative", team1_payload["name"]),
        team2_narrative=generated.get("team2_narrative", team2_payload["name"]),
        matchup_narrative=generated.get("matchup_key", ""),
        betting_narrative=betting_narrative,
    )

