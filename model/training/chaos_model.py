from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, Mapping, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from scipy.interpolate import UnivariateSpline
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression


DEFAULT_FEATURE_COLS: list[str] = [
    "massey_diff",
    "massey_adj_seed_diff",
    "seed_diff",
    "seed_hist_win_prob",
    "elo_diff",
    "net_eff_diff",
    "net_to_diff",
    "net_reb_diff",
    "ft_rate_diff",
    "efg_diff",
    "pace_diff",
    "threep_diff",
    "ast_diff",
    "blk_diff",
    "svi_diff",
    "massey_momentum_diff",
    "tourney_prestige_diff",
    "seed1",
    "seed2",
]


def _winsorize(x: np.ndarray, p_low: float = 0.01, p_high: float = 0.99) -> np.ndarray:
    lo = np.nanpercentile(x, p_low * 100.0)
    hi = np.nanpercentile(x, p_high * 100.0)
    return np.clip(x, lo, hi)


def _ensemble_proba(gbm_p: np.ndarray, lr_p: np.ndarray, gbm_weight: float = 0.60) -> np.ndarray:
    return gbm_weight * gbm_p + (1.0 - gbm_weight) * lr_p


@dataclass
class ChaosIPs:
    ipw_weights: np.ndarray
    upset_rate_smooth: np.ndarray


class ChaosModel:
    """
    "Upset Hunter" (Giant Killer) model.

    Purpose: identify structurally vulnerable favorites and dangerous
    underdogs. Not intended for realistic win probabilities.

    Training uses Inverse Probability Weighting (IPW):
      - rare upsets carry high weight (~4.48x)
      - chalk results carry low weight (~0.54x)
    """

    def __init__(
        self,
        feature_cols: Optional[Sequence[str]] = None,
        gbm_params: Optional[Dict[str, Any]] = None,
        lr_params: Optional[Dict[str, Any]] = None,
    ):
        self.feature_cols = list(feature_cols) if feature_cols is not None else DEFAULT_FEATURE_COLS

        # Simple, stable defaults.
        gbm_params = gbm_params or {
            "n_estimators": 500,
            "learning_rate": 0.03,
            "max_depth": 4,
            "subsample": 0.75,
            "min_samples_leaf": 8,
            "random_state": 42,
        }
        lr_params = lr_params or {"C": 0.1, "max_iter": 2000, "random_state": 42}

        self.gbm = GradientBoostingClassifier(**gbm_params)
        self.lr = LogisticRegression(**lr_params, solver="lbfgs")

        self._fitted = False

    def save(self, path: str) -> None:
        import pickle

        bundle = {
            "feature_cols": self.feature_cols,
            "weights": None,
            "gbm": self.gbm,
            "lr": self.lr,
            "_fitted": self._fitted,
        }
        with open(path, "wb") as f:
            pickle.dump(bundle, f)

    @classmethod
    def load(cls, path: str) -> "ChaosModel":
        import pickle

        with open(path, "rb") as f:
            bundle = pickle.load(f)

        model = cls(feature_cols=bundle.get("feature_cols", DEFAULT_FEATURE_COLS))
        model.gbm = bundle["gbm"]
        model.lr = bundle["lr"]
        model._fitted = bundle.get("_fitted", True)
        return model

    def _make_upset_rate_spline(
        self, historical_upset_rates: Mapping[float, float], seed_gaps: np.ndarray
    ) -> np.ndarray:
        """
        Build a smoothed historical upset-rate curve using scipy spline.

        `historical_upset_rates` is expected to map:
          seed_gap -> empirical upset_rate in (0,1)
        """
        xs = np.array(sorted(historical_upset_rates.keys()), dtype=float)
        ys = np.array([historical_upset_rates[x] for x in xs], dtype=float)

        # Guardrails.
        ys = np.clip(ys, 1e-6, 1.0 - 1e-6)

        # If too few points for a spline, fallback to piecewise-constant/linear-ish.
        if len(xs) < 3:
            # Nearest neighbor fallback.
            idx = np.abs(xs.reshape(-1, 1) - seed_gaps.reshape(1, -1)).argmin(axis=0)
            return ys[idx]

        # UnivariateSpline with mild smoothing (s depends on how noisy the empirical rates are).
        # We do not try to be overly clever; we just need a stable curve.
        # s is "sum of squared residuals"; smaller => closer to points.
        s = 0.001 * len(xs)
        spline = UnivariateSpline(xs, ys, s=s)

        # Evaluate; clamp to (eps, 1-eps) for numerical stability.
        out = spline(seed_gaps)
        return np.clip(out, 1e-6, 1.0 - 1e-6)

    def compute_ipw_weights(
        self,
        y: Sequence[int],
        seed_gaps: Sequence[float],
        historical_upset_rates: Mapping[float, float],
    ) -> ChaosIPs:
        """
        Compute Inverse Probability Weighting (IPW) weights.

        For each game:
        - Get smoothed historical upset rate for this seed gap (scipy spline)
        - If actual upset (y=1):  weight = 0.5 / upset_rate_smooth
        - If chalk (y=0):        weight = 0.5 / (1 - upset_rate_smooth)
        - Winsorize at 1st/99th percentile
        - Normalize to mean=1.0
        """

        y_arr = np.asarray(y).astype(int)
        if y_arr.ndim != 1:
            y_arr = y_arr.reshape(-1)

        seed_gap_arr = np.asarray(seed_gaps, dtype=float)
        if seed_gap_arr.shape[0] != y_arr.shape[0]:
            raise ValueError("seed_gaps and y must have the same length.")

        # We assume `seed_gaps` is a signed seed differential from the matchup
        # perspective used by the training labels:
        #   - seed_gap > 0 => team1 is the underdog (worse seed number)
        #   - seed_gap < 0 => team1 is the favorite (better seed number)
        # Actual upset occurs when team1 is the underdog *and* team1 wins.
        upset_mask = (y_arr == 1) & (seed_gap_arr > 0)

        gap_mag = np.abs(seed_gap_arr)
        upset_rate_smooth = self._make_upset_rate_spline(
            historical_upset_rates, gap_mag
        )

        upset_weight = 0.5 / upset_rate_smooth
        chalk_weight = 0.5 / (1.0 - upset_rate_smooth)
        ipw = np.where(upset_mask, upset_weight, chalk_weight)

        ipw = _winsorize(ipw, 0.01, 0.99)

        mean = float(np.mean(ipw))
        if mean == 0.0:
            # Extremely unlikely; avoid divide-by-zero.
            ipw = np.ones_like(ipw, dtype=float)
        else:
            ipw = ipw / mean

        return ChaosIPs(ipw_weights=ipw.astype(float), upset_rate_smooth=upset_rate_smooth.astype(float))

    def fit(
        self,
        X: Any,
        y: Sequence[int],
        seed_gaps: Sequence[float],
        historical_upset_rates: Mapping[float, float],
    ) -> "ChaosModel":
        """
        Fit the Upset Hunter:
          - Compute IPW weights
          - Fit GBM with sample_weight
          - Fit LR with sample_weight
          - Ensemble: 60% GBM + 40% LR
        """

        # IPW training requires the seed differential with the same sign
        # convention as `matchup_builder.create_matchup_features()`:
        #   seed_diff = seed1 - seed2
        #   seed_diff > 0 => team1 has the worse (higher-number) seed (underdog)
        #   y==1 => team1 won, so an actual upset is (y==1) & (seed_diff>0).
        if isinstance(X, pd.DataFrame):
            assert (
                "seed_diff" in X.columns
            ), "seed_diff column required for IPW"
            # Re-derive seed gaps from the training rows to ensure alignment.
            seed_gaps = X["seed_diff"].to_numpy(dtype=float)

        # Select feature matrix
        if isinstance(X, pd.DataFrame):
            missing = [c for c in self.feature_cols if c not in X.columns]
            if missing:
                raise ValueError(f"X missing required feature columns for ChaosModel: {missing}")
            X_mat = X[self.feature_cols].to_numpy(dtype=float)
        else:
            X_mat = np.asarray(X, dtype=float)

        y_arr = np.asarray(y).astype(int).reshape(-1)
        seed_gaps_arr = np.asarray(seed_gaps, dtype=float).reshape(-1)
        if seed_gaps_arr.shape[0] != y_arr.shape[0]:
            raise ValueError(
                "seed_gaps length must match y length for IPW."
            )

        ipw_info = self.compute_ipw_weights(
            y=y_arr, seed_gaps=seed_gaps_arr, historical_upset_rates=historical_upset_rates
        )
        ipw_weights = ipw_info.ipw_weights

        self.gbm.fit(X_mat, y_arr, sample_weight=ipw_weights)
        self.lr.fit(X_mat, y_arr, sample_weight=ipw_weights)

        self._fitted = True
        return self

    def predict_proba(self, X: Any) -> np.ndarray:
        """
        Return model probability for `label=1` as trained.

        In the Upset Hunter setup, `label=1` is the same outcome target as the
        standard model (team1 wins), but the model is trained with IPW sample
        weights that emphasize upset patterns.
        """

        if not self._fitted:
            raise RuntimeError("ChaosModel not fitted. Call fit() first.")

        if isinstance(X, pd.DataFrame):
            X_mat = X[self.feature_cols].to_numpy(dtype=float)
        else:
            X_mat = np.asarray(X, dtype=float)

        gbm_p = self.gbm.predict_proba(X_mat)[:, 1]
        lr_p = self.lr.predict_proba(X_mat)[:, 1]
        return _ensemble_proba(gbm_p=gbm_p, lr_p=lr_p, gbm_weight=0.60)

    def get_upset_probability(self, X_underdog: Any) -> float:
        """
        Win probability for the underdog in the chaos universe.
        """

        p = self.predict_proba(X_underdog)
        return float(p.reshape(-1)[0])

    def get_giant_killer_score(self, standard_prob: float, chaos_prob: float) -> float:
        """
        Giant Killer score = chaos_prob - standard_prob.

        Positive => chaos model sees MORE upset potential than the standard model.
        """

        return float(chaos_prob) - float(standard_prob)

    def get_bracket_busters(self, matchups_df: pd.DataFrame, n: int = 12) -> pd.DataFrame:
        """
        Top N most likely first-round upsets in the chaos universe.

        Expects `matchups_df` to include at least:
          - feature columns needed by this model
        Optionally, it can include identifiers like:
          - Team1/Team2 or StrongTeamID/WeakTeamID or WTeamID/LTeamID
        These are carried through when present.
        """

        p = self.predict_proba(matchups_df)
        out = matchups_df.copy()
        out["chaos_upset_prob"] = p
        out = out.sort_values("chaos_upset_prob", ascending=False).head(int(n))

        # Keep output compact: return all columns if caller wants; else add a small view.
        return out

    def _infer_team_seed_prob_columns(self, simulation_results: pd.DataFrame) -> Tuple[str, str, str]:
        """
        Best-effort inference of columns for the cinderella/chaos indices.
        """
        cols = set(simulation_results.columns)

        # Team seed and win prob are the main requirements.
        team_col = "team_id" if "team_id" in cols else ("TeamID" if "TeamID" in cols else "Team")
        opp_seed_col = None
        for c in ["opponent_seed", "OpponentSeed", "opp_seed", "OppSeed", "seed_opp", "OpponentSeedNum", "OppSeedNum"]:
            if c in cols:
                opp_seed_col = c
                break
        if opp_seed_col is None:
            # Some sims store "opponent" with "opp_seed" in a nested format; fall back.
            raise ValueError("simulation_results must include an opponent seed column.")

        win_prob_col = None
        for c in ["win_prob", "WinProb", "winProb", "prob", "win_probability"]:
            if c in cols:
                win_prob_col = c
                break
        if win_prob_col is None:
            # Or store per-row model prob under chaos_upset_prob
            if "chaos_upset_prob" in cols:
                win_prob_col = "chaos_upset_prob"
            elif "winProbability" in cols:
                win_prob_col = "winProbability"
            else:
                raise ValueError("simulation_results must include a win probability column (e.g., WinProb).")

        return team_col, opp_seed_col, win_prob_col

    def get_cinderella_index(self, simulation_results: pd.DataFrame) -> pd.DataFrame:
        """
        Quality-weighted expected wins:

            sum of ((17 - opponent_seed) / 8.5) * win_prob

        Interpretation:
          - beating a 1-seed multiplies ~1.88
          - beating an 8.5-seed multiplies ~1.0
          - beating a 16-seed multiplies ~0.12
        """

        if simulation_results.empty:
            return pd.DataFrame(columns=["TeamID", "cinderella_index"])

        team_col, opp_seed_col, win_prob_col = self._infer_team_seed_prob_columns(simulation_results)

        sim = simulation_results.copy()
        sim["quality_multiplier"] = (17.0 - sim[opp_seed_col].astype(float)) / 8.5
        sim["weighted_expected_wins"] = sim["quality_multiplier"] * sim[win_prob_col].astype(float)

        # Aggregate per team.
        # If team_col is 'Team' or 'team_id', normalize the output column to TeamID.
        sim_team = sim.rename(columns={team_col: "TeamID"})
        out = (
            sim_team.groupby("TeamID", as_index=False)["weighted_expected_wins"]
            .sum()
            .rename(columns={"weighted_expected_wins": "cinderella_index"})
        )
        return out

    def get_regional_chaos_index(self, simulation_results: pd.DataFrame) -> Dict[str, float]:
        """
        Sum of expected wins for seeds 6-16 in each region.

        Expects:
          - a region column like 'Region' or 'region'
          - opponent seed and win probability columns (same inference as cinderella).
        """

        if simulation_results.empty:
            return {}

        cols = set(simulation_results.columns)
        region_col = None
        for c in ["Region", "region", "REGION"]:
            if c in cols:
                region_col = c
                break
        if region_col is None:
            raise ValueError("simulation_results must include a region column (e.g., 'Region').")

        _, opp_seed_col, win_prob_col = self._infer_team_seed_prob_columns(simulation_results)

        sim = simulation_results.copy()
        sim["opp_seed_num"] = sim[opp_seed_col].astype(float)
        sim["win_prob_num"] = sim[win_prob_col].astype(float)

        # Filter: only count expected upset wins against seeds 6-16.
        filtered = sim[(sim["opp_seed_num"] >= 6.0) & (sim["opp_seed_num"] <= 16.0)]
        if filtered.empty:
            return {str(r): 0.0 for r in sim[region_col].unique()}

        out = filtered.groupby(region_col)["win_prob_num"].sum().to_dict()
        return {str(k): float(v) for k, v in out.items()}


if __name__ == "__main__":
    print("chaos_model.py loaded. Next: wire in training-set creation + bracket simulation.")

