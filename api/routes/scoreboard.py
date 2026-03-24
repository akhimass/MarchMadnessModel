"""
Live NCAA scoreboard proxy for frontend consumption (no ESPN dependency).
"""
from __future__ import annotations

import html
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from api.lib.espn_kaggle_resolve import (
    NAME_BY_KAGGLE_ID,
    bracket_display_for_kaggle,
    kaggle_id_from_espn_team,
)

router = APIRouter(prefix="/api", tags=["scoreboard"])

# ── In-memory scoreboard cache ────────────────────────────────────────────────
# Keyed by "{gender}:{yyyymmdd}". Prevents N parallel frontend requests for the
# same date from each independently hammering the external NCAA / henrygd APIs.
_scoreboard_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_CACHE_TTL_LIVE: float = 20.0        # 20 s while games are in progress
_CACHE_TTL_FINAL: float = 120.0      # 2 min once all games are done
_CACHE_TTL_FALLBACK: float = 300.0   # 5 min for cache-fallback responses (static data)


def _cache_ttl(payload: Dict[str, Any]) -> float:
    source = payload.get("source", "")
    if source == "cache-fallback":
        return _CACHE_TTL_FALLBACK
    games = payload.get("games") or []
    if any(g.get("status") in ("live", "halftime") for g in games):
        return _CACHE_TTL_LIVE
    return _CACHE_TTL_FINAL


NCAA_M_SCOREBOARD = (
    "https://data.ncaa.com/casablanca/scoreboard/basketball-men/d1/{yyyy}/{mm}/{dd}/scoreboard.json"
)
NCAA_W_SCOREBOARD = (
    "https://data.ncaa.com/casablanca/scoreboard/basketball-women/d1/{yyyy}/{mm}/{dd}/scoreboard.json"
)
NCAA_API_BASE = os.getenv("NCAA_API_BASE", "https://ncaa-api.henrygd.me").rstrip("/")
REPO = Path(__file__).resolve().parents[2]

# Legacy synthetic placeholders in data/cache/results_2026.json → real 2026 bracket TeamIDs.
_MISSING_SYNTH = sorted(
    [
        1104,
        1106,
        1158,
        1201,
        1206,
        1207,
        1234,
        1302,
        1307,
        1310,
        1330,
        1340,
        1400,
        1401,
        1402,
        1403,
        1404,
        1406,
        1407,
        1501,
        1502,
        1503,
        1505,
        1506,
        1507,
        1601,
        1602,
        1603,
        1604,
        1605,
        1607,
    ]
)
SYNTHETIC_2026_TO_KAGGLE: Dict[int, int] = {}
for i in range(31):
    SYNTHETIC_2026_TO_KAGGLE[20101 + i] = _MISSING_SYNTH[i]
SYNTHETIC_2026_TO_KAGGLE[20132] = _MISSING_SYNTH[0]
SYNTHETIC_2026_TO_KAGGLE[20133] = _MISSING_SYNTH[1]
SYNTHETIC_2026_TO_KAGGLE[20134] = _MISSING_SYNTH[2]


def _canonical_cache_team_id(tid: int) -> int:
    if tid >= 20000:
        return int(SYNTHETIC_2026_TO_KAGGLE.get(tid, tid))
    return tid


def _normalize_dates(dates: Optional[str]) -> Optional[str]:
    """
    Accept YYYYMMDD or YYYY-MM-DD and normalize to YYYYMMDD.
    """
    if not dates:
        return None
    raw = str(dates).strip()
    if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
        return raw.replace("-", "")
    if len(raw) == 8 and raw.isdigit():
        return raw
    return None


def _today_et_yyyymmdd() -> str:
    return datetime.now(ZoneInfo("America/New_York")).strftime("%Y%m%d")


def _abbr(name: str) -> str:
    parts = str(name or "").replace(".", "").split()
    if not parts:
        return "TEAM"
    if len(parts) == 1:
        return parts[0][:4].upper()
    return "".join(p[0] for p in parts[:3]).upper()


def _fallback_games_from_cache(dates: Optional[str] = None) -> List[Dict[str, Any]]:
    date_to_daynums: Dict[str, List[int]] = {
        # First Four (dayNums 134–135)
        "20260318": [134],
        "20260319": [135],
        # Round of 64 (dayNums 136–137)
        "20260320": [136],
        "20260321": [137],
        # Round of 32 (dayNums 138–139)
        "20260322": [138],
        "20260323": [139],
    }
    daynums = date_to_daynums.get(dates or "", [])

    cache = REPO / "data" / "cache" / "results_2026.json"
    teams_csv = REPO / "data" / "MTeams.csv"
    if not cache.exists():
        return []

    try:
        rows = json.loads(cache.read_text())
    except Exception:
        return []

    name_by_id = dict(NAME_BY_KAGGLE_ID)
    # Keep Kaggle MTeams as fallback for non-custom IDs.
    if teams_csv.exists():
        try:
            teams_df = pd.read_csv(teams_csv)
            for _, rr in teams_df.iterrows():
                tid = int(rr["TeamID"])
                if tid not in name_by_id:
                    name_by_id[tid] = str(rr["TeamName"])
        except Exception:
            pass
    picked_rows: List[Dict[str, Any]] = []
    if daynums:
        picked_rows = [r for r in rows if int(r.get("dayNum", -1)) in daynums]
    else:
        # No date specified: show most recent completed games from cache.
        picked_rows = sorted(rows, key=lambda r: int(r.get("dayNum", 0)), reverse=True)[:24]

    out: List[Dict[str, Any]] = []
    for r in picked_rows:
        w_raw = int(r.get("wTeamId", 0))
        l_raw = int(r.get("lTeamId", 0))
        w = _canonical_cache_team_id(w_raw)
        l = _canonical_cache_team_id(l_raw)
        ws = int(r.get("wScore", 0))
        ls = int(r.get("lScore", 0))
        wn = name_by_id.get(w, f"Team {w}" if w < 20000 else f"Team {w_raw}")
        ln = name_by_id.get(l, f"Team {l}" if l < 20000 else f"Team {l_raw}")
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
                    "espnId": "",
                    "kaggleId": w if w < 20000 else None,
                    "name": wn,
                    "shortName": wn,
                    "abbreviation": _abbr(wn),
                    "score": ws,
                    "winner": True,
                    "logo": "",
                    "seed": 0,
                },
                "awayTeam": {
                    "espnId": "",
                    "kaggleId": l if l < 20000 else None,
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


def _fmt_ncaa_url(dates: Optional[str], gender: str = "M") -> Optional[str]:
    if not dates or len(dates) != 8:
        return None
    yyyy, mm, dd = dates[:4], dates[4:6], dates[6:8]
    g = (gender or "M").upper().strip()
    tpl = NCAA_W_SCOREBOARD if g == "W" else NCAA_M_SCOREBOARD
    return tpl.format(yyyy=yyyy, mm=mm, dd=dd)


def _fmt_henrygd_candidates(dates: Optional[str], gender: str = "M") -> List[str]:
    if not dates or len(dates) != 8:
        return []
    yyyy, mm, dd = dates[:4], dates[4:6], dates[6:8]
    sport = "basketball-women" if (gender or "M").upper().strip() == "W" else "basketball-men"
    # ncaa-api supports ncaa.com-like paths. Try scoreboard variants that commonly resolve.
    return [
        f"{NCAA_API_BASE}/scoreboard/{sport}/d1/{yyyy}/{mm}/{dd}/all-conf",
        f"{NCAA_API_BASE}/scoreboard/{sport}/d1/{yyyy}/{mm}/{dd}",
    ]


def _parse_ncaa_scoreboard(payload: Dict[str, Any], dates: Optional[str], gender: str = "M") -> List[Dict[str, Any]]:
    games: List[Dict[str, Any]] = []
    for item in payload.get("games") or []:
        game = item.get("game") or {}
        home = game.get("home") or {}
        away = game.get("away") or {}
        home_names = home.get("names") or {}
        away_names = away.get("names") or {}
        round_title = html.unescape(
            str((((game.get("championshipGame") or {}).get("round") or {}).get("title") or ""))
        )
        start_date = str(game.get("startDate") or "")
        start_time = str(game.get("startTime") or "")
        iso_start = ""
        if start_date and start_time:
            # "03/26/2026" + "7:10 PM ET" -> "2026-03-26T19:10:00-04:00"
            try:
                mm, dd, yyyy = start_date.split("/")
                t = start_time.replace(" ET", "")
                from datetime import datetime

                dt = datetime.strptime(f"{yyyy}-{mm}-{dd} {t}", "%Y-%m-%d %I:%M %p")
                iso_start = dt.strftime("%Y-%m-%dT%H:%M:%S-04:00")
            except Exception:
                iso_start = ""

        state = str(game.get("gameState") or "").lower()
        status = "scheduled"
        if state == "final":
            status = "final"
        elif state in {"live", "in"}:
            status = "live"
        elif state in {"half", "halftime"}:
            status = "halftime"

        home_score = int(home.get("score") or 0) if str(home.get("score") or "").strip() else 0
        away_score = int(away.get("score") or 0) if str(away.get("score") or "").strip() else 0
        hn = str(home_names.get("short") or home_names.get("full") or "")
        an = str(away_names.get("short") or away_names.get("full") or "")
        # Prefer full school name for resolver — NCAA `short` can be placeholders like "T1".
        hn_resolve = str(home_names.get("full") or home_names.get("short") or "")
        an_resolve = str(away_names.get("full") or away_names.get("short") or "")
        ha = str(home_names.get("char6") or "")
        aa = str(away_names.get("char6") or "")
        g = (gender or "M").upper().strip()
        hk = kaggle_id_from_espn_team(ha, hn_resolve) if g == "M" else None
        ak = kaggle_id_from_espn_team(aa, an_resolve) if g == "M" else None
        home_seed_raw = int(home.get("seed") or 0) if str(home.get("seed") or "").isdigit() else 0
        away_seed_raw = int(away.get("seed") or 0) if str(away.get("seed") or "").isdigit() else 0
        ha_disp, hs_disp = (
            bracket_display_for_kaggle(hk, ha, home_seed_raw) if g == "M" else (ha, home_seed_raw)
        )
        aa_disp, as_disp = (
            bracket_display_for_kaggle(ak, aa, away_seed_raw) if g == "M" else (aa, away_seed_raw)
        )
        games.append(
            {
                "gameId": str(game.get("gameID") or ""),
                "commenceTime": iso_start or (f"{dates[:4]}-{dates[4:6]}-{dates[6:8]}T19:00:00-04:00" if dates else ""),
                "status": status,
                "statusName": "",
                "period": int(game.get("currentPeriod") or 0) if str(game.get("currentPeriod") or "").isdigit() else 0,
                "clock": str(game.get("contestClock") or ""),
                "completed": status == "final",
                "homeTeam": {
                    "espnId": "",
                    "kaggleId": hk,
                    "name": hn,
                    "shortName": str(home_names.get("short") or ""),
                    "abbreviation": ha_disp,
                    "score": home_score,
                    "winner": bool(home.get("winner")),
                    "logo": "",
                    "seed": hs_disp,
                },
                "awayTeam": {
                    "espnId": "",
                    "kaggleId": ak,
                    "name": an,
                    "shortName": str(away_names.get("short") or ""),
                    "abbreviation": aa_disp,
                    "score": away_score,
                    "winner": bool(away.get("winner")),
                    "logo": "",
                    "seed": as_disp,
                },
                "broadcast": str(game.get("network") or ""),
                "venue": "",
                "roundLabel": round_title,
            }
        )
    return games


@router.get("/scoreboard/live")
async def get_live_scoreboard(
    dates: Optional[str] = Query(None, description="YYYYMMDD"),
    gender: str = Query("M", description="M or W"),
    allow_fallback: bool = Query(True, description="When false, do not use cache fallback"),
) -> JSONResponse:
    dates = _normalize_dates(dates) or _today_et_yyyymmdd()
    g = (gender or "M").upper().strip()

    # ── Serve from cache when still fresh ────────────────────────────────────
    cache_key = f"{g}:{dates}"
    now = time.monotonic()
    cached_entry = _scoreboard_cache.get(cache_key)
    if cached_entry is not None:
        ts, cached_payload = cached_entry
        ttl = _cache_ttl(cached_payload)
        if now - ts < ttl:
            return JSONResponse(
                content=cached_payload,
                headers={"X-Cache": "HIT", "Cache-Control": "public, max-age=15"},
            )

    debug: Dict[str, Any] = {"attempted": [], "used_fallback": False}

    # ── Primary: direct NCAA scoreboard JSON (2 s timeout) ───────────────────
    ncaa_url = _fmt_ncaa_url(dates, gender=g)
    if ncaa_url:
        debug["attempted"].append("ncaa-data")
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                nr = await client.get(ncaa_url)
            if nr.status_code == 200:
                parsed = _parse_ncaa_scoreboard(nr.json(), dates, gender=g)
                if parsed:
                    result: Dict[str, Any] = {
                        "games": parsed,
                        "date": dates or "",
                        "gender": g,
                        "source": "ncaa-data",
                        "debug": debug,
                    }
                    _scoreboard_cache[cache_key] = (now, result)
                    return JSONResponse(
                        content=result,
                        headers={"X-Cache": "MISS", "Cache-Control": "public, max-age=15"},
                    )
            else:
                debug["ncaa_status"] = nr.status_code
        except Exception as ne:
            debug["ncaa_error"] = str(ne)

    # ── Secondary: henrygd/ncaa-api proxy (2 s timeout) ─────────────────────
    henrygd_errors: List[str] = []
    for hu in _fmt_henrygd_candidates(dates, gender=g):
        debug["attempted"].append("henrygd")
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                hr = await client.get(hu)
            if hr.status_code != 200:
                henrygd_errors.append(f"{hu} status={hr.status_code}")
                continue
            payload = hr.json()
            raw = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else payload
            if isinstance(raw, dict):
                parsed = _parse_ncaa_scoreboard(raw, dates, gender=g)
                if parsed:
                    result = {
                        "games": parsed,
                        "date": dates or "",
                        "gender": g,
                        "source": "henrygd-ncaa-api",
                        "debug": debug,
                    }
                    _scoreboard_cache[cache_key] = (now, result)
                    return JSONResponse(
                        content=result,
                        headers={"X-Cache": "MISS", "Cache-Control": "public, max-age=15"},
                    )
        except Exception as he:
            henrygd_errors.append(f"{hu} error={he}")
    if henrygd_errors:
        debug["henrygd_errors"] = henrygd_errors

    # ── Fallback: local results cache ────────────────────────────────────────
    games: List[Dict[str, Any]] = []
    if g == "M" and bool(allow_fallback):
        debug["used_fallback"] = True
        games = _fallback_games_from_cache(dates)

    result = {
        "games": games,
        "date": str(dates or ""),
        "gender": g,
        "source": "cache-fallback" if g == "M" else "unavailable",
        "debug": debug,
    }
    _scoreboard_cache[cache_key] = (now, result)
    return JSONResponse(
        content=result,
        headers={"X-Cache": "MISS", "Cache-Control": "public, max-age=30"},
    )


@router.get("/scoreboard/audit")
async def get_scoreboard_audit(dates: Optional[str] = Query(None, description="YYYYMMDD")) -> Dict[str, Any]:
    """Minimal diagnostics to explain why scoreboard data source may fail."""
    data = await get_live_scoreboard(dates=dates, gender="M")
    return {
        "date": data.get("date"),
        "source": data.get("source"),
        "games": len(data.get("games") or []),
        "debug": data.get("debug") or {},
    }
