from __future__ import annotations

from typing import Dict

import numpy as np
import pandas as pd


class VarianceProfiler:
    def compute(self, team_id: int, season: int, compact_df: pd.DataFrame) -> dict:
        """Compute score-margin variance profile for a team in a season."""
        games = compact_df[
            (compact_df["Season"] == season)
            & ((compact_df["WTeamID"] == team_id) | (compact_df["LTeamID"] == team_id))
        ]
        if len(games) < 5:
            return self._defaults()

        # Winner perspective margin; positive means the team won by that margin.
        margins = np.where(
            games["WTeamID"] == team_id,
            games["WScore"] - games["LScore"],
            games["LScore"] - games["WScore"],
        )

        return {
            "var_margin_std": float(np.std(margins)),
            "var_ceiling": float(np.percentile(margins, 90)),
            "var_floor": float(np.percentile(margins, 10)),
            "var_iqr": float(np.percentile(margins, 75) - np.percentile(margins, 25)),
            "var_close_game_rate": float((np.abs(margins) <= 5).mean()),
            "var_blowout_rate": float((margins > 20).mean()),
            "var_bad_loss_rate": float((margins < -10).mean()),
        }

    def get_matchup_features(
        self, fav_id: int, dog_id: int, season: int, compact_df: pd.DataFrame
    ) -> dict:
        """
        Returns features relevant to upset potential.

        Convention: fav = favorite (lower seed number), dog = underdog.
        """
        fav = self.compute(fav_id, season, compact_df)
        dog = self.compute(dog_id, season, compact_df)

        return {
            "var_margin_std_diff": fav["var_margin_std"] - dog["var_margin_std"],
            "var_ceiling_diff": fav["var_ceiling"] - dog["var_ceiling"],
            "var_floor_diff": fav["var_floor"] - dog["var_floor"],
            # KEY: can underdog's best game beat favorite's worst game?
            "var_upset_ceiling_gap": dog["var_ceiling"] - abs(fav["var_floor"]),
            "var_fav_std": fav["var_margin_std"],
            "var_dog_std": dog["var_margin_std"],
        }

    def _defaults(self) -> dict:
        return {
            "var_margin_std": 10.0,
            "var_ceiling": 15.0,
            "var_floor": -15.0,
            "var_iqr": 17.0,
            "var_close_game_rate": 0.3,
            "var_blowout_rate": 0.2,
            "var_bad_loss_rate": 0.1,
        }

