from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import numpy as np
import pandas as pd


class EloRatingSystem:
    """
    Running Elo rating system for NCAA matchups.

    The Elo is updated in DayNum order within each season, then snapshotted
    into `elo_by_season[season]` after processing the season.
    """

    def __init__(
        self, k: float = 20, home_advantage: float = 80, initial: float = 1500, decay: float = 0.5
    ):
        self.k = float(k)
        self.home_advantage = float(home_advantage)
        self.initial = float(initial)
        # fraction of (rating-1500) kept each offseason
        self.decay = float(decay)

        self._running: Dict[int, float] = {}
        self.elo_by_season: Dict[int, Dict[int, float]] = {}

    def _get(self, tid: int) -> float:
        return self._running.get(int(tid), self.initial)

    def _expected(self, ra: float, rb: float) -> float:
        return 1.0 / (1.0 + 10.0 ** ((rb - ra) / 400.0))

    def _mov_mult(self, winner_elo: float, loser_elo: float, score_diff: float) -> float:
        """
        Margin of victory multiplier (538-style approximation).

        Uses the absolute score margin and the pre-game Elo gap to dampen
        extreme multipliers when the favorite is expected to win.
        """
        elo_diff = float(winner_elo - loser_elo)
        return np.log(abs(float(score_diff)) + 1.0) * 2.2 / (elo_diff * 0.001 + 2.2)

    def process_season(self, season: int, season_games: pd.DataFrame) -> None:
        """
        Process all games for one season in DayNum order.

        - Before processing the first game of the season, apply an offseason
          decay toward mean for teams we've seen in prior seasons.
        - After processing all games, snapshot the current running ratings
          into `self.elo_by_season[season]`.
        """
        # Offseason decay toward mean before processing new season.
        self._running = {
            tid: self.initial + self.decay * (r - self.initial) for tid, r in self._running.items()
        }

        required = {"WTeamID", "LTeamID", "WScore", "LScore", "DayNum"}
        missing = required - set(season_games.columns)
        if missing:
            raise ValueError(f"season_games missing columns: {sorted(missing)}")

        # Some datasets include WLoc for home/away; default to neutral.
        has_loc = "WLoc" in season_games.columns

        for _, row in season_games.sort_values("DayNum").iterrows():
            wid, lid = int(row["WTeamID"]), int(row["LTeamID"])
            ws, ls = float(row["WScore"]), float(row["LScore"])
            wloc = row["WLoc"] if has_loc else "N"

            we = self._get(wid)
            le = self._get(lid)

            # Apply home advantage to the winner side.
            wa = we + (
                self.home_advantage
                if wloc == "H"
                else -self.home_advantage
                if wloc == "A"
                else 0.0
            )

            exp_w = self._expected(wa, le)
            score_diff = ws - ls
            mult = self._mov_mult(we, le, score_diff)
            k_eff = self.k * mult

            self._running[wid] = we + k_eff * (1.0 - exp_w)
            self._running[lid] = le - k_eff * (1.0 - exp_w)

        self.elo_by_season[int(season)] = dict(self._running)

    def build_all_seasons(self, compact_df: pd.DataFrame) -> Dict[int, Dict[int, float]]:
        """
        Build running Elo across all seasons in order.

        Only processes regular-season games (DayNum <= 132).
        """
        required = {"Season", "DayNum", "WTeamID", "LTeamID", "WScore", "LScore"}
        missing = required - set(compact_df.columns)
        if missing:
            raise ValueError(f"compact_df missing required columns: {sorted(missing)}")

        reg = compact_df[compact_df["DayNum"] <= 132].copy()
        for season in sorted(reg["Season"].unique()):
            season_games = reg[reg["Season"] == season]
            self.process_season(int(season), season_games)
        return self.elo_by_season

    def get_rating(self, team_id: int, season: int) -> float:
        return float(self.elo_by_season.get(int(season), {}).get(int(team_id), self.initial))

    def get_diff(self, team1_id: int, team2_id: int, season: int) -> float:
        return self.get_rating(team1_id, season) - self.get_rating(team2_id, season)


if __name__ == "__main__":
    # __main__ smoke test
    import os
    from pathlib import Path

    DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
    compact = pd.read_csv(DATA_DIR / "MRegularSeasonCompactResults.csv")

    elo = EloRatingSystem()
    elo.build_all_seasons(compact)

    ratings_2026 = elo.elo_by_season.get(2026, {})
    top10 = sorted(ratings_2026.items(), key=lambda x: -x[1])[:10]

    teams = pd.read_csv(DATA_DIR / "MTeams.csv").set_index("TeamID")["TeamName"].to_dict()
    print("Top 10 Elo ratings 2026:")
    for tid, r in top10:
        print(f"  {teams.get(int(tid), tid)}: {float(r):.1f}")

