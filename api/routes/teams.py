from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd
from fastapi import APIRouter, HTTPException, Request

from api.routes.models.schemas import TeamStats


router = APIRouter(prefix="/api", tags=["teams"])


def _seed_token_to_name(pipeline: Any) -> Dict[int, str]:
    if getattr(pipeline, "teams_df", None) is None:
        return {}
    df = pipeline.teams_df
    if "TeamID" in df.columns and "TeamName" in df.columns:
        return {int(tid): str(name) for tid, name in zip(df["TeamID"], df["TeamName"])}
    return {}


@router.get("/teams/{season}")
def get_teams(season: int, request: Request, gender: str = "M") -> List[Dict[str, Any]]:
    """
    List of tournament teams with seeds for a given season.
    """
    g = (gender or "M").upper().strip()
    pipeline = getattr(request.app.state, "pipeline_w" if g == "W" else "pipeline_m", None)
    if pipeline is None:
        raise HTTPException(status_code=500, detail=f"Pipeline not loaded for gender={g}.")

    if getattr(pipeline, "seeds_df", None) is None:
        raise HTTPException(status_code=500, detail="Seeds dataframe not available.")

    seeds_df = pipeline.seeds_df
    teams_df = getattr(pipeline, "teams_df", None)

    season = int(season)
    s = seeds_df.loc[seeds_df["Season"] == season].copy()
    if s.empty:
        return []

    # Parse numeric seed from tokens like 'W01', 'X16a'.
    import re

    def seed_num(x: Any) -> float:
        m = re.search(r"(\d{1,2})", str(x))
        return float(m.group(1)) if m else 0.0

    s["SeedNum"] = s["Seed"].apply(seed_num).astype(float)

    team_name_map = {}
    if teams_df is not None and "TeamID" in teams_df.columns and "TeamName" in teams_df.columns:
        team_name_map = {int(tid): str(name) for tid, name in zip(teams_df["TeamID"], teams_df["TeamName"])}

    # Kaggle seed tokens use region letters: W/X/Y/Z. Map those to the UI labels.
    letter_to_region = {
        "W": "East",
        "X": "South",
        "Y": "West",
        "Z": "Midwest",
    }

    g = (gender or "M").upper().strip()
    out: List[Dict[str, Any]] = []
    for _, r in s.iterrows():
        tid = int(r["TeamID"])
        seed_token = str(r.get("Seed", ""))
        region_letter = seed_token[0] if seed_token else ""
        region = letter_to_region.get(region_letter, region_letter)
        out.append(
            {
                # Frontend-friendly camelCase.
                "teamId": tid,
                "teamName": team_name_map.get(tid),
                "seed": float(r["SeedNum"]),
                "seedStr": seed_token,
                "region": region,
                "gender": g,
            }
        )

    # Sort by seed ascending (1 best).
    out.sort(key=lambda d: float(d["seed"]))
    return out

