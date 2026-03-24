"""
Tournament game results for scoreboard, live bracket, and model accuracy.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
from fastapi import APIRouter

from model.config import DATA_DIR

router = APIRouter(prefix="/api", tags=["results"])

_REPO = Path(__file__).resolve().parents[2]


def _cache_path(season: int) -> Path:
    return Path(DATA_DIR) / "cache" / f"results_{season}.json"


def _compact_path(gender: str) -> Path:
    g = (gender or "M").upper().strip()
    fname = "MNCAATourneyCompactResults.csv" if g != "W" else "WNCAATourneyCompactResults.csv"
    for base in (Path(DATA_DIR), _REPO / "data"):
        p = base / fname
        if p.exists():
            return p
    raise FileNotFoundError(fname)


def _row_from_csv(r: Any, gender: str) -> Dict[str, Any]:
    return {
        "season": int(r["Season"]),
        "dayNum": int(r["DayNum"]),
        "wTeamId": int(r["WTeamID"]),
        "lTeamId": int(r["LTeamID"]),
        "wScore": int(r["WScore"]),
        "lScore": int(r["LScore"]),
        "gender": (gender or "M").upper().strip(),
        "round": None,
        "source": "csv",
    }


@router.get("/results/{season}")
def get_results(season: int, gender: str = "M") -> List[Dict[str, Any]]:
    """
    Completed tournament games. Loads `data/cache/results_{season}.json` first,
    then merges rows from MNCAATourneyCompactResults for that season.
    """
    season_i = int(season)
    out_map: Dict[str, Dict[str, Any]] = {}

    cache_file = _cache_path(season_i)
    if not cache_file.exists():
        alt = _REPO / "data" / "cache" / f"results_{season_i}.json"
        if alt.exists():
            cache_file = alt

    if cache_file.exists():
        try:
            raw = json.loads(cache_file.read_text())
            if isinstance(raw, list):
                for item in raw:
                    if not isinstance(item, dict):
                        continue
                    w = int(item.get("wTeamId", item.get("WTeamID", 0)))
                    l = int(item.get("lTeamId", item.get("LTeamID", 0)))
                    key = f"{w}-{l}-{item.get('dayNum', '')}"
                    out_map[key] = {
                        "season": int(item.get("season", season_i)),
                        "dayNum": int(item.get("dayNum", item.get("DayNum", 0))),
                        "wTeamId": w,
                        "lTeamId": l,
                        "wScore": int(item.get("wScore", item.get("WScore", 0))),
                        "lScore": int(item.get("lScore", item.get("LScore", 0))),
                        "gender": str(item.get("gender", gender)).upper().strip(),
                        "round": item.get("round"),
                        "region": item.get("region"),
                        "source": "cache",
                    }
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass

    try:
        csv_path = _compact_path(gender)
        df = pd.read_csv(csv_path)
        sub = df.loc[df["Season"] == season_i]
        for _, r in sub.iterrows():
            row = _row_from_csv(r, gender)
            key = f"{row['wTeamId']}-{row['lTeamId']}-{row['dayNum']}"
            if key not in out_map:
                out_map[key] = row
    except (OSError, FileNotFoundError):
        pass

    return sorted(out_map.values(), key=lambda x: (int(x.get("dayNum", 0)), int(x.get("wTeamId", 0))))


@router.post("/results/{season}")
def update_results(season: int, games: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Upsert cached results from live ESPN sync.
    Dedup key priority: gameId, then fallback composite.
    """
    season_i = int(season)
    cache_file = _cache_path(season_i)
    cache_file.parent.mkdir(parents=True, exist_ok=True)

    existing: List[Dict[str, Any]] = []
    if cache_file.exists():
        try:
            raw = json.loads(cache_file.read_text())
            if isinstance(raw, list):
                existing = [x for x in raw if isinstance(x, dict)]
        except (OSError, json.JSONDecodeError):
            existing = []

    merged: Dict[str, Dict[str, Any]] = {}

    def _key(row: Dict[str, Any], idx: int) -> str:
        gid = str(row.get("gameId", "")).strip()
        if gid:
            return f"gid:{gid}"
        w = row.get("wTeamId", row.get("WTeamID", ""))
        l = row.get("lTeamId", row.get("LTeamID", ""))
        d = row.get("dayNum", row.get("DayNum", ""))
        return f"wl:{w}-{l}-{d}-{idx}"

    for i, g in enumerate(existing):
        merged[_key(g, i)] = g
    for i, g in enumerate(games or []):
        if not isinstance(g, dict):
            continue
        k = _key(g, i)
        existing_entry = merged.get(k)
        # Don't overwrite a quality entry (dayNum > 0) with a placeholder (dayNum == 0).
        # syncResultsCache sends dayNum=0; original cache entries have correct dayNums 134-139.
        if existing_entry and int(existing_entry.get("dayNum", 0)) > 0 and int(g.get("dayNum", 0)) == 0:
            continue
        merged[k] = g

    out = list(merged.values())
    cache_file.write_text(json.dumps(out, indent=2))
    return {"saved": len(out), "path": str(cache_file)}

