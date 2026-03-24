"""Seed-only win probability when ML models or build_features are not ready yet."""
from __future__ import annotations

import re
from typing import Any


def team_seed_num(seeds_df: Any, season: int, team_id: int) -> float:
    s = seeds_df.loc[(seeds_df["Season"] == int(season)) & (seeds_df["TeamID"] == int(team_id))]
    if s.empty:
        return 8.0
    m = re.search(r"(\d{1,2})", str(s.iloc[0]["Seed"]))
    return float(m.group(1)) if m else 8.0


def degraded_prob_team1_wins(team1_id: int, team2_id: int, season: int, seeds_df: Any) -> float:
    """
    P(team1 wins) using only tournament seed numbers (lower numeric seed = better team).
    Used when ensemble models are not loaded (e.g. Render still running build_features).
    """
    s1 = team_seed_num(seeds_df, season, team1_id)
    s2 = team_seed_num(seeds_df, season, team2_id)
    if s1 < s2:
        diff = s2 - s1
        return min(0.95, 0.52 + 0.045 * diff)
    if s2 < s1:
        diff = s1 - s2
        return max(0.05, 0.48 - 0.045 * diff)
    return 0.5
