"""
Proxy ESPN scoreboard JSON to avoid browser CORS.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api", tags=["scoreboard"])

ESPN_M = (
    "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
)
ESPN_W = (
    "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard"
)
REPO = Path(__file__).resolve().parents[2]


def _parse_status(status: Dict[str, Any]) -> str:
    t = (status.get("type") or {}).get("name") or ""
    if t == "STATUS_FINAL":
        return "final"
    if t == "STATUS_IN_PROGRESS":
        return "live"
    if t == "STATUS_HALFTIME":
        return "halftime"
    if t == "STATUS_END_PERIOD":
        return "live"
    return "scheduled"


def _team_payload(comp: Dict[str, Any]) -> Dict[str, Any]:
    team = comp.get("team") or {}
    tid = team.get("id")
    return {
        "espnId": str(tid) if tid is not None else "",
        "name": str(team.get("displayName") or ""),
        "shortName": str(team.get("shortDisplayName") or ""),
        "abbreviation": str(team.get("abbreviation") or ""),
        "score": int(comp.get("score") or 0),
        "winner": bool(comp.get("winner")),
        "logo": str(team.get("logo") or ""),
        "seed": int((comp.get("curatedRank") or {}).get("current") or 0),
    }


def _abbr(name: str) -> str:
    parts = str(name or "").replace(".", "").split()
    if not parts:
        return "TEAM"
    if len(parts) == 1:
        return parts[0][:4].upper()
    return "".join(p[0] for p in parts[:3]).upper()


def _fallback_games_from_cache(dates: Optional[str] = None) -> List[Dict[str, Any]]:
    date_to_daynums: Dict[str, List[int]] = {
        "20260319": [136],
        "20260320": [137],
        "20260321": [138],
        "20260322": [139],
    }
    daynums = date_to_daynums.get(dates or "", [])

    cache = REPO / "data" / "cache" / "results_2026.json"
    teams_csv = REPO / "data" / "MTeams.csv"
    if not cache.exists() or not teams_csv.exists():
        return []

    try:
        rows = json.loads(cache.read_text())
        teams_df = pd.read_csv(teams_csv)
    except Exception:
        return []

    name_by_id = {int(r["TeamID"]): str(r["TeamName"]) for _, r in teams_df.iterrows()}
    picked_rows: List[Dict[str, Any]] = []
    if daynums:
        picked_rows = [r for r in rows if int(r.get("dayNum", -1)) in daynums]
    else:
        # No date specified: show most recent completed games from cache.
        picked_rows = sorted(rows, key=lambda r: int(r.get("dayNum", 0)), reverse=True)[:24]

    out: List[Dict[str, Any]] = []
    for r in picked_rows:
        w = int(r.get("wTeamId", 0))
        l = int(r.get("lTeamId", 0))
        ws = int(r.get("wScore", 0))
        ls = int(r.get("lScore", 0))
        wn = name_by_id.get(w, f"Team {w}")
        ln = name_by_id.get(l, f"Team {l}")
        out.append(
            {
                "gameId": str(r.get("gameId") or f"cache-{w}-{l}-{r.get('dayNum')}"),
                "commenceTime": (
                    f"{dates[:4]}-{dates[4:6]}-{dates[6:8]}T23:00:00Z"
                    if dates and len(dates) == 8
                    else "2026-03-22T23:00:00Z"
                ),
                "status": "final",
                "statusName": "STATUS_FINAL",
                "period": 2,
                "clock": "0:00",
                "completed": True,
                "homeTeam": {
                    "espnId": str(w),
                    "name": wn,
                    "shortName": wn,
                    "abbreviation": _abbr(wn),
                    "score": ws,
                    "winner": True,
                    "logo": "",
                    "seed": 0,
                },
                "awayTeam": {
                    "espnId": str(l),
                    "name": ln,
                    "shortName": ln,
                    "abbreviation": _abbr(ln),
                    "score": ls,
                    "winner": False,
                    "logo": "",
                    "seed": 0,
                },
                "broadcast": "",
                "venue": "",
            }
        )
    return out


@router.get("/scoreboard/live")
async def get_live_scoreboard(
    dates: Optional[str] = Query(None, description="YYYYMMDD"),
    gender: str = Query("M", description="M or W"),
) -> Dict[str, Any]:
    params: Dict[str, str] = {"groups": "50", "limit": "400"}
    if dates:
        params["dates"] = dates

    g = (gender or "M").upper().strip()
    url = ESPN_W if g == "W" else ESPN_M
    # For historical completed days, prefer cache directly (fast + deterministic).
    if g == "M" and dates and dates <= "20260323":
        return {
            "games": _fallback_games_from_cache(dates),
            "date": dates,
            "gender": g,
            "source": "cache-historical",
        }

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(url, params=params)
    except httpx.RequestError as e:
        if g == "M":
            return {
                "games": _fallback_games_from_cache(dates),
                "date": dates or "",
                "gender": g,
                "source": "cache-fallback",
            }
        raise HTTPException(status_code=502, detail=f"ESPN request failed: {e}") from e

    if r.status_code != 200:
        if g == "M":
            return {
                "games": _fallback_games_from_cache(dates),
                "date": dates or "",
                "gender": g,
                "source": "cache-fallback",
            }
        raise HTTPException(status_code=r.status_code, detail="ESPN API error")

    data = r.json()
    games: List[Dict[str, Any]] = []

    for event in data.get("events") or []:
        comps = (event.get("competitions") or [])
        if not comps:
            continue
        comp = comps[0]
        competitors = comp.get("competitors") or []
        home = next((c for c in competitors if c.get("homeAway") == "home"), None)
        away = next((c for c in competitors if c.get("homeAway") == "away"), None)
        if not home or not away:
            if len(competitors) >= 2:
                away, home = competitors[0], competitors[1]
            else:
                continue

        status = event.get("status") or {}
        stype = (status.get("type") or {})
        games.append(
            {
                "gameId": str(event.get("id") or ""),
                "commenceTime": str(event.get("date") or ""),
                "status": _parse_status(status),
                "statusName": str(stype.get("name") or ""),
                "period": int(status.get("period") or 0),
                "clock": str(status.get("displayClock") or ""),
                "completed": bool(stype.get("completed")),
                "homeTeam": _team_payload(home),
                "awayTeam": _team_payload(away),
                "broadcast": "",
                "venue": str((comp.get("venue") or {}).get("fullName") or ""),
            }
        )

    if not games and g == "M":
        games = _fallback_games_from_cache(dates)

    day_info = data.get("day") or {}
    return {
        "games": games,
        "date": str(day_info.get("date") or dates or ""),
        "gender": g,
    }
