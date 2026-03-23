from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import numpy as np
import pandas as pd


# Key computer systems used to build the ordinals feature set.
KEY_SYSTEMS: List[str] = ["POM", "SAG", "NET", "BPI", "MAS", "COL", "WOL", "RPI", "AP", "USA"]


class MasseyOrdinalsFeatures:
    """
    Ordinal-rank feature engineering using MMasseyOrdinals.csv.

    Source schema:
      Season, RankingDayNum, SystemName, TeamID, OrdinalRank

    This class:
      - builds a pre-tournament snapshot from `RankingDayNum <= 133`
      - builds an early snapshot from `RankingDayNum <= 100`
      - pivots into wide tables indexed by (Season, TeamID)
      - provides team-level features and matchup differential features
    """

    def __init__(self, ordinals_df: pd.DataFrame):
        self.ordinals = ordinals_df
        self._wide = None  # pre-tournament snapshot (DayNum<=133), pivoted
        self._wide_early = None  # early-season snapshot (DayNum<=100), pivoted
        self._build_lookup()

    def _build_lookup(self) -> None:
        required = {"Season", "RankingDayNum", "SystemName", "TeamID", "OrdinalRank"}
        missing = required - set(self.ordinals.columns)
        if missing:
            raise ValueError(f"ordinals_df missing columns: {sorted(missing)}")

        # Filter pre-tournament
        pre = self.ordinals[self.ordinals["RankingDayNum"] <= 133].copy()
        # Last rank per (Season, TeamID, SystemName)
        latest = (
            pre.sort_values("RankingDayNum")
            .groupby(["Season", "TeamID", "SystemName"])["OrdinalRank"]
            .last()
            .reset_index()
        )
        self._wide = latest.pivot_table(
            index=["Season", "TeamID"], columns="SystemName", values="OrdinalRank"
        ).reset_index()

        # Early snapshot for momentum
        early = self.ordinals[self.ordinals["RankingDayNum"] <= 100].copy()
        early_last = (
            early.sort_values("RankingDayNum")
            .groupby(["Season", "TeamID", "SystemName"])["OrdinalRank"]
            .last()
            .reset_index()
        )
        self._wide_early = early_last.pivot_table(
            index=["Season", "TeamID"], columns="SystemName", values="OrdinalRank"
        ).reset_index()

    def get_team_features(self, team_id: int, season: int, actual_seed: int) -> Dict[str, float]:
        DEFAULT = 180  # teams not in a system get median-ish rank
        KEY = ["POM", "SAG", "NET", "BPI", "MAS", "COL", "WOL", "RPI"]

        if self._wide is None or self._wide_early is None:
            raise RuntimeError("Lookup tables not built.")

        row = self._wide[(self._wide["Season"] == season) & (self._wide["TeamID"] == team_id)]
        early_row = self._wide_early[
            (self._wide_early["Season"] == season) & (self._wide_early["TeamID"] == team_id)
        ]

        def get_rank(df_row: pd.DataFrame, sys: str) -> float:
            if len(df_row) == 0 or sys not in df_row.columns:
                return float(DEFAULT)
            val = df_row[sys].values[0]
            return float(val) if not pd.isna(val) else float(DEFAULT)

        feats: Dict[str, float] = {}
        for sys in KEY:
            feats[f"{sys.lower()}_rank"] = float(get_rank(row, sys))

        # Consensus = average rank across key computer systems (exclude polls)
        comp_systems = ["POM", "SAG", "NET", "BPI", "MAS", "COL", "WOL"]
        ranks = [feats[f"{s.lower()}_rank"] for s in comp_systems]
        feats["consensus_rank"] = float(np.mean(ranks))

        # Rank disagreement: high std = different systems disagree = uncertainty
        feats["rank_sigma"] = float(np.std(ranks))

        # Committee bias: how much did committee over/under seed vs NET?
        # seed_implied = actual_seed * 4.3 (empirical conversion)
        seed_implied_rank = float(actual_seed) * 4.3
        net_rank = float(feats["net_rank"])
        # Positive = NET says team is WORSE than seed implies (overseeded => vulnerable)
        # Negative = NET says team is BETTER than seed implies (underseeded => dangerous)
        feats["committee_bias"] = float(net_rank - seed_implied_rank)

        # POM momentum: rank improvement from day 100 → 133
        # rank DECREASE = getting better (lower rank = better)
        early_pom = float(get_rank(early_row, "POM"))
        feats["pom_momentum"] = float(early_pom - feats["pom_rank"])
        # Note: this follows the prompt's sign convention (positive = improving).

        # Human vs computer: AP poll vs computer consensus
        # Negative = humans overrate vs computers (narrative bias = potential trap game)
        ap_rank = feats.get("ap_rank", float(DEFAULT))
        feats["human_vs_computer"] = float(ap_rank - feats["consensus_rank"])

        return feats

    def get_matchup_features(
        self, t1: int, t2: int, season: int, s1: int, s2: int
    ) -> Dict[str, float]:
        """
        All features as `t1 - t2` differentials. Suffix: `_diff`.
        """
        f1 = self.get_team_features(t1, season, s1)
        f2 = self.get_team_features(t2, season, s2)
        return {f"ord_{k}_diff": float(f1[k] - f2[k]) for k in f1}

    def available_seasons(self) -> List[int]:
        return sorted(self.ordinals["Season"].unique().tolist())

    def describe(self) -> None:
        systems = sorted(self.ordinals["SystemName"].unique())
        print(f"Seasons: {int(self.ordinals['Season'].min())}-{int(self.ordinals['Season'].max())}")
        print(f"Systems ({len(systems)}): {systems}")


if __name__ == "__main__":
    # __main__ test
    from pathlib import Path
    import os

    DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
    ordinals = pd.read_csv(DATA_DIR / "MMasseyOrdinals.csv")
    feat = MasseyOrdinalsFeatures(ordinals)
    feat.describe()

    # Duke 2026 (TeamID=1181, seed=1)
    d = feat.get_team_features(1181, 2026, 1)
    print("\nDuke 2026:")
    for k, v in sorted(d.items()):
        print(f"  {k:30s}: {float(v):.1f}")

