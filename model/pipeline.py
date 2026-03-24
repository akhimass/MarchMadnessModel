from __future__ import annotations

import json
import math
import os
import pickle
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

import numpy as np
import pandas as pd

from model.config import DATA_DIR
from model.features.massey import (
    build_massey_all_seasons,
    build_massey_ratings,
    get_massey_adjusted_seed,
)
from model.features.elo import EloRatingSystem
from model.features.matchup_builder import (
    build_submission_set,
    build_training_set,
    create_matchup_features,
)
from model.features.svi import classify_svi, compute_svi
from model.features.team_stats import build_team_season_features
from model.simulation.monte_carlo import BracketSimulator


def _parse_seed_num(seed_token: str) -> int:
    # e.g. 'W01' -> 1, 'X16a' -> 16
    import re

    m = re.search(r"(\d{1,2})", str(seed_token))
    if not m:
        raise ValueError(f"Could not parse seed number from token: {seed_token}")
    return int(m.group(1))


def _ensure_path(p: str | Path) -> Path:
    return p if isinstance(p, Path) else Path(p)


class MarchMadnessPipeline:
    def __init__(self, data_dir: str | Path = "./data", gender: str = "M"):
        self.data_dir = _ensure_path(data_dir)
        self.gender = gender.upper().strip()
        if self.gender not in {"M", "W"}:
            raise ValueError("gender must be 'M' or 'W'")

        self.season = 2026

        # Loaded raw data
        self.detailed_df: Optional[pd.DataFrame] = None
        self.compact_df: Optional[pd.DataFrame] = None
        self.tourney_compact_df: Optional[pd.DataFrame] = None
        self.seeds_df: Optional[pd.DataFrame] = None
        self.slots_df: Optional[pd.DataFrame] = None
        self.teams_df: Optional[pd.DataFrame] = None

        # Derived feature maps (built in build_features)
        self.massey_ratings: Dict[int, Dict[int, float]] = {}
        self.seeds_map: Dict[Tuple[int, int], float] = {}
        self.seed_win_rates: Dict[Tuple[int, int], float] = {}
        self.historical_upset_rates: Dict[float, float] = {}
        self.historical_tourney_wins: Dict[int, float] = {}
        self.team_stats: Dict[Tuple[int, int], Dict[str, Any]] = {}
        self.team_features_by_season: Dict[int, pd.DataFrame] = {}

        # Optional ordinal-rank feature engine.
        self.ordinal_features: Optional[Any] = None
        self._ordinal_team_cache: Dict[Tuple[int, int], Dict[str, float]] = {}

        # Models
        self.standard_model: Any = None
        self.chaos_model: Any = None

    def _resolve_csv(self, filename: str) -> Path:
        """
        Resolve a CSV path, preferring `self.data_dir` (default: `./data`).
        """

        repo_root = Path(__file__).resolve().parents[1]

        # Candidate 1: inside configured data_dir
        base = self.data_dir if self.data_dir.is_absolute() else (repo_root / self.data_dir)
        p1 = base / filename

        # Candidate 2: at repo root (in case some files weren't moved yet)
        p2 = repo_root / filename

        # Candidate 3: current working directory
        p3 = Path(".").resolve() / filename

        for p in [p1, p2, p3]:
            if p.exists():
                return p

        raise FileNotFoundError(f"Could not find {filename}. Looked in: {p1}, {p2}, {p3}.")

    def load_data(self) -> None:
        """Load all CSVs for the selected gender; fail gracefully if optional files are missing."""
        prefix = "M" if self.gender == "M" else "W"

        # Essential inputs for the current pipeline.
        self.compact_df = pd.read_csv(self._resolve_csv(f"{prefix}RegularSeasonCompactResults.csv"))
        self.detailed_df = pd.read_csv(self._resolve_csv(f"{prefix}RegularSeasonDetailedResults.csv"))
        # NCAA tournament-specific filenames in the Kaggle dataset.
        self.seeds_df = pd.read_csv(self._resolve_csv(f"{prefix}NCAATourneySeeds.csv"))
        self.slots_df = pd.read_csv(self._resolve_csv(f"{prefix}NCAATourneySlots.csv"))
        self.tourney_compact_df = pd.read_csv(self._resolve_csv(f"{prefix}NCAATourneyCompactResults.csv"))
        self.teams_df = pd.read_csv(self._resolve_csv(f"{prefix}Teams.csv"))

    def build_features(self) -> None:
        """
        Run all feature engineering steps using the modules already added to this repo.

        This pipeline also builds Elo running ratings (DayNum<=132) and
        attaches `elo_rating` into `team_stats` so `elo_diff` works end-to-end.
        """
        if self.compact_df is None or self.detailed_df is None or self.tourney_compact_df is None:
            raise RuntimeError("Call load_data() first.")

        prefix = "M" if self.gender == "M" else "W"
        reference_daynum = 132
        window_days = 30
        cutoff_then = reference_daynum - window_days

        tourney_df = self.tourney_compact_df[self.tourney_compact_df["Season"] < self.season].copy()
        seasons_needed = sorted(set(tourney_df["Season"].unique()).union({self.season}))

        # Team four-factor features require `*RegularSeasonDetailedResults.csv`.
        # Some historical seasons may not exist in the detailed dataset for this workspace.
        detailed_seasons = set(self.detailed_df["Season"].unique())
        seasons_needed = [int(s) for s in seasons_needed if int(s) in detailed_seasons]

        # 1) Massey ratings across seasons (pre-tournament)
        self.massey_ratings = build_massey_all_seasons(self.compact_df)

        print("  Building Elo ratings...")
        from model.features.elo import EloRatingSystem

        self.elo_system = EloRatingSystem()
        self.elo_ratings_by_season = self.elo_system.build_all_seasons(self.compact_df)  # type: ignore[attr-defined]

        # 2) Seed numeric maps and seed-based historical lookup tables
        if self.seeds_df is None:
            raise RuntimeError("seeds_df missing; call load_data() first.")

        self.seeds_map = {}
        for season in sorted(self.seeds_df["Season"].unique()):
            df_season = self.seeds_df[self.seeds_df["Season"] == season]
            for _, r in df_season.iterrows():
                tid = int(r["TeamID"])
                seed_num = float(_parse_seed_num(str(r["Seed"])))
                self.seeds_map[(int(season), tid)] = seed_num

        # 2b) Massey-adjusted implied seeds for committee overseeding proxy.
        # We approximate a historical mapping by collecting each team's
        # pre-tourney Massey rating by its tournament seed.
        seed_to_massey_vals: Dict[int, list[float]] = {}
        for (s, tid), seed_num in self.seeds_map.items():
            s_int = int(s)
            if s_int >= self.season:
                # Use only historical seasons to infer the "committee mapping".
                continue
            massey_s = self.massey_ratings.get(s_int, {})
            if tid not in massey_s:
                continue
            seed_i = int(seed_num)
            seed_to_massey_vals.setdefault(seed_i, []).append(float(massey_s[tid]))

        historical_seed_massey_map: Dict[int, float] = {
            seed_i: float(np.mean(vals))
            for seed_i, vals in seed_to_massey_vals.items()
            if len(vals) > 0
        }

        # Seed win rates: probability the numerically *lower seed* (e.g. 1-seed) wins.
        # Stored as {(seed_low, seed_high): win_prob_for_seed_low}.
        pair_wins: Dict[Tuple[int, int], float] = {}
        pair_totals: Dict[Tuple[int, int], float] = {}

        # Upset rates by seed-gap magnitude for chaos IPW: probability underdog (higher seed number) wins.
        upset_by_gap_wins: Dict[float, float] = {}
        upset_by_gap_totals: Dict[float, float] = {}

        # Prestige: decay-weighted tourney wins.
        decay_lambda = 0.15
        prestige: Dict[int, float] = {}

        for r in tourney_df.itertuples(index=False):
            played_season = int(getattr(r, "Season"))
            w = int(getattr(r, "WTeamID"))
            l = int(getattr(r, "LTeamID"))

            # Prestige: winner gets decay-weighted win credit.
            weight = math.exp(-decay_lambda * (self.season - played_season))
            prestige[w] = prestige.get(w, 0.0) + float(weight)

            sw = self.seeds_map.get((played_season, w))
            sl = self.seeds_map.get((played_season, l))
            if sw is None or sl is None:
                continue

            sw_i = int(sw)
            sl_i = int(sl)
            seed_low = int(min(sw_i, sl_i))   # numerically smaller seed
            seed_high = int(max(sw_i, sl_i))

            # Which side corresponds to seed_low?
            winner_seed_num = sw_i
            seed_low_won = 1.0 if winner_seed_num == seed_low else 0.0
            key_pair = (seed_low, seed_high)
            pair_wins[key_pair] = pair_wins.get(key_pair, 0.0) + seed_low_won
            pair_totals[key_pair] = pair_totals.get(key_pair, 0.0) + 1.0

            # Chaos upset rate by seed gap magnitude.
            seed_gap_mag = float(abs(sw_i - sl_i))
            underdog_seed_num = max(sw_i, sl_i)  # worse seed number
            underdog_won = 1.0 if sw_i == underdog_seed_num else 0.0
            upset_by_gap_wins[seed_gap_mag] = upset_by_gap_wins.get(seed_gap_mag, 0.0) + underdog_won
            upset_by_gap_totals[seed_gap_mag] = upset_by_gap_totals.get(seed_gap_mag, 0.0) + 1.0

        # Finalize seed win rates with Laplace smoothing.
        self.seed_win_rates = {}
        for (seed_low, seed_high), wins in pair_wins.items():
            tot = pair_totals.get((seed_low, seed_high), 0.0)
            self.seed_win_rates[(int(seed_low), int(seed_high))] = float((wins + 1.0) / (tot + 2.0))

        # Finalize historical upset rates.
        self.historical_upset_rates = {}
        for gap, wins in upset_by_gap_wins.items():
            tot = upset_by_gap_totals.get(gap, 0.0)
            self.historical_upset_rates[float(gap)] = float((wins + 1.0) / (tot + 2.0))

        self.historical_tourney_wins = {int(k): float(v) for k, v in prestige.items()}

        # 3) Team stats + SVI + Massey momentum + Elo per needed season
        assert self.compact_df is not None and self.detailed_df is not None
        for season in seasons_needed:
            detailed_season = self.detailed_df.loc[self.detailed_df["Season"] == season].copy()
            compact_season = self.compact_df.loc[self.compact_df["Season"] == season].copy()

            detailed_season_raw = detailed_season.copy()
            compact_season_raw = compact_season.copy()

            # Use games up to reference_daynum for "pre-tournament" consistency.
            if "DayNum" in detailed_season.columns:
                detailed_season = detailed_season.loc[detailed_season["DayNum"] <= reference_daynum]
            if "DayNum" in compact_season.columns:
                compact_season = compact_season.loc[compact_season["DayNum"] <= reference_daynum]

            # Some historical seasons may not have regular-season rows below the
            # chosen DayNum cutoff in the dataset. Fall back to full season
            # data to avoid empty feature matrices.
            if detailed_season.empty or compact_season.empty:
                detailed_season = detailed_season_raw
                compact_season = compact_season_raw

            team_feats = build_team_season_features(detailed_season, compact_season, season)
            team_feats = compute_svi(team_feats, gender=self.gender)

            # Massey momentum (30-day change) at the pre-tournament cutoff.
            massey_now = self.massey_ratings.get(season, {})
            games_then = self.compact_df.loc[
                (self.compact_df["Season"] == season) & (self.compact_df["DayNum"] <= cutoff_then)
            ]
            massey_then = build_massey_ratings(games_then, season) if not games_then.empty else {}

            def _momentum(tid: int) -> float:
                return float(massey_now.get(int(tid), 0.0) - massey_then.get(int(tid), 0.0))

            team_feats["massey_momentum"] = team_feats["TeamID"].apply(_momentum).astype(float)

            # Attach Elo rating.
            team_feats["elo_rating"] = team_feats["TeamID"].apply(
                lambda tid: self.elo_system.get_rating(int(tid), int(season))
            ).astype(float)

            # Committee-style implied seed based on the historical Massey mapping.
            team_feats["massey_implied_seed"] = team_feats["TeamID"].apply(
                lambda tid: get_massey_adjusted_seed(
                    massey_now.get(int(tid), 0.0), historical_seed_massey_map
                )
                if historical_seed_massey_map
                else float(0.0)
            ).astype(float)

            self.team_features_by_season[int(season)] = team_feats

            # Build lookup map for matchup_builder:
            # team_stats[(season, team_id)] = {col: value}
            for _, row in team_feats.iterrows():
                tid = int(row["TeamID"])
                stats_dict = row.drop(labels=["TeamID", "Season"]).to_dict()
                # Also store plain `elo` so matchup_builder can compute elo_diff.
                stats_dict["elo"] = float(self.elo_system.get_rating(int(tid), int(season)))
                self.team_stats[(int(season), tid)] = stats_dict

        # 4) Ordinal-rank features (MMasseyOrdinals) — multi-million rows; optional skip on deploy.
        ordinals_path = DATA_DIR / "MMasseyOrdinals.csv"
        skip_ord = os.getenv("SKIP_MASSEY_ORDINALS_API", "").strip().lower() in ("1", "true", "yes", "on")
        if skip_ord:
            self.ordinal_features = None
            print("  SKIP_MASSEY_ORDINALS_API set — skipping MMasseyOrdinals load (faster API boot).")
        elif ordinals_path.exists():
            print("  Loading Massey Ordinals (50+ expert systems)...")
            from model.features.ordinals import MasseyOrdinalsFeatures

            ordinals_df = pd.read_csv(ordinals_path)
            self.ordinal_features = MasseyOrdinalsFeatures(ordinals_df)
            print(
                f"  Ordinals loaded: {len(ordinals_df)} rows, "
                f"systems: {len(ordinals_df['SystemName'].unique())}"
            )
        else:
            self.ordinal_features = None
            print("  WARNING: MMasseyOrdinals.csv not found, skipping ordinal features")

        # Variance profiler
        from model.features.variance import VarianceProfiler

        self.variance_profiler = VarianceProfiler()

        # Optional: load pre-computed ESPN/Claude enrichment adjustments (2026 only).
        self.load_enrichment()

    def load_enrichment(self) -> None:
        """
        Disable local injury/recency cache loading for runtime predictions.

        This keeps live model responses deterministic from core matchup features
        and avoids stale cache artifacts from influencing odds/predictor outputs.
        """
        self.injury_impacts = {}
        self.recency_updates = {}
        print("  Enrichment cache disabled for runtime (injury/recency set to neutral).")

    def train(self) -> None:
        """Train both standard and chaos models."""
        if self.tourney_compact_df is None:
            raise RuntimeError("Call load_data() first.")
        if not self.team_stats or not self.massey_ratings:
            raise RuntimeError("Call build_features() first.")

        # Lazy import so the pipeline can be imported even without sklearn installed.
        from model.training.chaos_model import ChaosModel
        from model.training.standard_model import MarchMadnessEnsemble

        tourney_df = self.tourney_compact_df[self.tourney_compact_df["Season"] < self.season].copy()
        rows: list[dict[str, Any]] = []
        for r in tourney_df.itertuples(index=False):
            season = int(getattr(r, "Season"))
            w = int(getattr(r, "WTeamID"))
            l = int(getattr(r, "LTeamID"))

            fwd = self._build_matchup_row(w, l, season)
            fwd["Season"] = season
            fwd["label"] = 1
            rows.append(fwd)

            rev = self._build_matchup_row(l, w, season)
            rev["Season"] = season
            rev["label"] = 0
            rows.append(rev)

        training_set = pd.DataFrame(rows)
        X = training_set.drop(columns=["label"]).fillna(0.0)
        y = training_set["label"].to_numpy(dtype=int)

        # Train standard ensemble.
        self.standard_model = MarchMadnessEnsemble(gender=self.gender)
        self.standard_model.fit(X, y)

        # Train chaos model (IPW ensemble).
        self.chaos_model = ChaosModel()
        self.chaos_model.fit(
            X=X,
            y=y,
            seed_gaps=X["seed_diff"].to_numpy(dtype=float),
            historical_upset_rates=self.historical_upset_rates,
        )

    def _build_matchup_row(self, t1: int, t2: int, season: int) -> Dict[str, float]:
        """
        Build one matchup feature row (t1 vs t2), including optional ordinal features.
        """
        row = create_matchup_features(
            team1_id=int(t1),
            team2_id=int(t2),
            season=int(season),
            massey_ratings=self.massey_ratings,
            team_stats=self.team_stats,
            seeds=self.seeds_map,
            seed_win_rates=self.seed_win_rates,
            historical_tourney_wins=self.historical_tourney_wins,
        )

        # Add ordinal rank features (expert systems) when available.
        if self.ordinal_features is not None and int(season) >= 2003:
            s1 = self.seeds_map.get((int(season), int(t1)), 8)
            s2 = self.seeds_map.get((int(season), int(t2)), 8)
            row.update(
                self.ordinal_features.get_matchup_features(
                    int(t1), int(t2), int(season), int(s1), int(s2)
                )
            )

        # Variance (uses compact results - available all seasons)
        if getattr(self, "variance_profiler", None):
            s1 = self.seeds_map.get((int(season), int(t1)), 8)
            s2 = self.seeds_map.get((int(season), int(t2)), 8)
            fav_id = int(t1) if float(s1) <= float(s2) else int(t2)
            dog_id = int(t2) if float(s1) <= float(s2) else int(t1)
            var_feats = self.variance_profiler.get_matchup_features(
                fav_id, dog_id, int(season), self.compact_df  # type: ignore[arg-type]
            )
            row.update(var_feats)

        # Enrichment (2026-only): injury/recency adjustments
        if int(season) == 2026:
            inj1 = (
                getattr(self, "injury_impacts", {})
                .get(str(int(t1)), {})
                .get("adjustment", 0.0)
            )
            inj2 = (
                getattr(self, "injury_impacts", {})
                .get(str(int(t2)), {})
                .get("adjustment", 0.0)
            )
            rec1_val = getattr(self, "recency_updates", {}).get(str(int(t1)))
            rec2_val = getattr(self, "recency_updates", {}).get(str(int(t2)))
            rec1 = rec1_val.get("adjustment", 0.0) if isinstance(rec1_val, dict) else 0.0
            rec2 = rec2_val.get("adjustment", 0.0) if isinstance(rec2_val, dict) else 0.0
            row["enrich_injury_diff"] = float(inj1) - float(inj2)
            row["enrich_recency_diff"] = float(rec1) - float(rec2)
        else:
            row["enrich_injury_diff"] = 0.0
            row["enrich_recency_diff"] = 0.0

        return {k: float(v) for k, v in row.items()}

    def _feature_builder_for_matchups(self) -> Callable[[int, int, int], Dict[str, float]]:
        def _builder(team1_id: int, team2_id: int, season: int) -> Dict[str, float]:
            return self._build_matchup_row(int(team1_id), int(team2_id), int(season))

        return _builder

    def generate_submission(self) -> pd.DataFrame:
        """Generate a Kaggle-style submission DataFrame for this pipeline's gender."""
        if self.standard_model is None:
            self.train()

        # The repo's Kaggle template may include both men and women IDs.
        # Filtering by gender-specific ID ranges is handled by the calling script.
        sample_path = self._resolve_csv("SampleSubmissionStage2.csv")

        sub = pd.read_csv(sample_path)
        # Parse ID: `Season_Team1_Team2`
        parts = sub["ID"].astype(str).str.split("_", expand=True)
        sub["Season"] = parts[0].astype(int)
        sub["Team1"] = parts[1].astype(int)
        sub["Team2"] = parts[2].astype(int)

        # Build the feature matrix, including optional ordinal features.
        feature_rows: list[dict[str, float]] = []
        for r in sub.itertuples(index=False):
            d = r._asdict()
            season_i = int(d["Season"])
            t1 = int(d["Team1"])
            t2 = int(d["Team2"])
            feature_rows.append(self._build_matchup_row(t1, t2, season_i))

        feature_df = pd.DataFrame(feature_rows).fillna(0.0)
        pred = self.standard_model.predict_proba(feature_df)
        out = pd.DataFrame({"ID": sub["ID"], "Pred": pred.astype(float)})
        return out

    def run_simulations(self, n: int = 100_000, outdir: str | Path = "./sim_results") -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Run standard + chaos Monte Carlo simulations and save both results to JSON."""
        if self.standard_model is None or self.chaos_model is None:
            self.train()

        if self.seeds_df is None or self.slots_df is None or self.teams_df is None:
            raise RuntimeError("Call load_data() first.")

        outdir = Path(outdir)
        outdir.mkdir(parents=True, exist_ok=True)

        simulator = BracketSimulator(
            seeds_df=self.seeds_df,
            slots_df=self.slots_df,
            model={"standard": self.standard_model, "chaos": self.chaos_model},
            season=self.season,
            feature_builder=self._feature_builder_for_matchups(),
            rng_seed=42,
            gender=self.gender,
            teams_df=self.teams_df,
        )

        standard_results = simulator.run_simulations(n=n, use_chaos=False)
        chaos_results = simulator.run_simulations(n=n, use_chaos=True)

        def _save(df: pd.DataFrame, name: str) -> None:
            path = outdir / f"{name}_{self.gender}_{self.season}.json"
            def conv(v: Any) -> Any:
                if isinstance(v, (np.floating, np.integer)):
                    return v.item()
                if pd.isna(v):
                    return None
                return v

            payload = df.to_dict(orient="records")
            payload = [{k: conv(v) for k, v in rec.items()} for rec in payload]
            path.write_text(json.dumps(payload))

        _save(standard_results, "standard")
        _save(chaos_results, "chaos")

        top10 = standard_results.head(10)[["TeamName", "TeamID", "Champ"]]
        print(f"Top 10 championship probabilities (standard) for {self.gender}{self.season}")
        for _, r in top10.iterrows():
            print(f"- {r['TeamName']} (TeamID={int(r['TeamID'])}): {float(r['Champ'])*100:.1f}%")

        return standard_results, chaos_results

    def get_ordinal_rank(self, team_id: int, system: str) -> Optional[int]:
        """
        National rank (1 = best) for one team in a Massey ordinal system column, pre-tournament snapshot.
        """
        of = getattr(self, "ordinal_features", None)
        if of is None:
            return None
        wide = getattr(of, "_wide", None)
        if wide is None or not isinstance(wide, pd.DataFrame):
            return None
        if system not in wide.columns:
            return None
        row = wide[(wide["Season"] == int(self.season)) & (wide["TeamID"] == int(team_id))]
        if row.empty:
            return None
        val = row.iloc[0][system]
        if pd.isna(val):
            return None
        return int(round(float(val)))

    def _seed_only_matchup_prediction(self, team1_id: int, team2_id: int) -> Dict[str, Any]:
        """Cheap bracket-style probability from seeds only — no ML, no build_features."""
        from model.seed_fallback import degraded_prob_team1_wins, team_seed_num

        if self.seeds_df is None:
            raise RuntimeError("seeds_df missing; cannot compute seed-only matchup.")
        season = int(self.season)
        p = degraded_prob_team1_wins(int(team1_id), int(team2_id), season, self.seeds_df)
        s1 = team_seed_num(self.seeds_df, season, int(team1_id))
        s2 = team_seed_num(self.seeds_df, season, int(team2_id))
        return {
            "standard_prob": p,
            "chaos_prob": p,
            "giant_killer_score": 0.0,
            "upset_alert": False,
            "model_breakdown": {},
            "seed_diff_hist": 0.5,
            "team1_stats": {},
            "team2_stats": {},
            "svi": {
                "team1": 0.0,
                "team2": 0.0,
                "category_team1": "neutral",
                "category_team2": "neutral",
            },
            "seeds": {"team1": s1, "team2": s2},
            "massey": {"team1": 0.0, "team2": 0.0},
            "degraded": True,
        }

    def get_matchup_prediction(self, team1_id: int, team2_id: int) -> Dict[str, Any]:
        """Full matchup prediction for ESPN-style UI."""
        if self.standard_model is None or self.chaos_model is None:
            return self._seed_only_matchup_prediction(team1_id, team2_id)
        if not self.team_stats:
            raise RuntimeError("Call build_features() first.")

        feats = self._build_matchup_row(int(team1_id), int(team2_id), int(self.season))

        X = pd.DataFrame([feats])
        standard_prob = float(self.standard_model.predict_proba(X)[0])
        chaos_prob = float(self.chaos_model.predict_proba(X)[0])

        breakdown = {}
        if hasattr(self.standard_model, "get_model_breakdown"):
            breakdown = self.standard_model.get_model_breakdown(X)

        t1_stats = self.team_stats.get((self.season, int(team1_id)), {})
        t2_stats = self.team_stats.get((self.season, int(team2_id)), {})

        t1_svi = float(t1_stats.get("SVI", 0.0))
        t2_svi = float(t2_stats.get("SVI", 0.0))

        giant_killer_score = float(chaos_prob - standard_prob)
        upset_alert = bool(giant_killer_score > 0.08)

        t1_seed = float(self.seeds_map.get((self.season, int(team1_id)), 0.0))
        t2_seed = float(self.seeds_map.get((self.season, int(team2_id)), 0.0))

        # Minimal “stats cards” for the UI.
        four_factor_keys = ["eFG_off", "eFG_def", "TO_rate_off", "TO_rate_def", "OR_rate", "DR_rate", "FT_rate", "FT_rate_def"]
        t1_card = {k: float(t1_stats.get(k, 0.0)) for k in four_factor_keys}
        t2_card = {k: float(t2_stats.get(k, 0.0)) for k in four_factor_keys}
        t1_card.update({"NetEff": float(t1_stats.get("NetEff", 0.0)), "Pace": float(t1_stats.get("Pace", 0.0))})
        t2_card.update({"NetEff": float(t2_stats.get("NetEff", 0.0)), "Pace": float(t2_stats.get("Pace", 0.0))})

        return {
            "standard_prob": standard_prob,
            "chaos_prob": chaos_prob,
            "giant_killer_score": giant_killer_score,
            "upset_alert": upset_alert,
            "model_breakdown": breakdown,
            "seed_diff_hist": float(feats.get("seed_hist_win_prob", 0.5)),
            "team1_stats": t1_card,
            "team2_stats": t2_card,
            "svi": {
                "team1": t1_svi,
                "team2": t2_svi,
                "category_team1": classify_svi(t1_svi),
                "category_team2": classify_svi(t2_svi),
            },
            "seeds": {"team1": t1_seed, "team2": t2_seed},
            "massey": {
                "team1": float(self.massey_ratings.get(self.season, {}).get(int(team1_id), 0.0)),
                "team2": float(self.massey_ratings.get(self.season, {}).get(int(team2_id), 0.0)),
            },
        }

