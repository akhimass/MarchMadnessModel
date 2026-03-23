from __future__ import annotations

import pickle
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from model.config import ALL_FEATURES

from sklearn.base import BaseEstimator
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss
from sklearn.model_selection import StratifiedKFold
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


FEATURE_COLS: List[str] = [
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


def _select_feature_matrix(X: Any, feature_cols: List[str]) -> np.ndarray:
    if isinstance(X, pd.DataFrame):
        missing = [c for c in feature_cols if c not in X.columns]
        if missing:
            raise ValueError(f"X is missing required feature columns: {missing}")
        return X[feature_cols].to_numpy(dtype=float)
    # Assume it is already a matrix in correct column order.
    X_arr = np.asarray(X)
    if X_arr.ndim != 2 or X_arr.shape[1] != len(feature_cols):
        raise ValueError(
            f"X must be a DataFrame with feature columns or a 2D array with "
            f"{len(feature_cols)} columns. Got shape={X_arr.shape}."
        )
    return X_arr.astype(float)


def _upset_mask_from_features(X: Any, seed_diff_col: str = "seed_diff") -> np.ndarray:
    """
    Define "upset" as: team1 wins despite being the lower-seed.

    This matches the typical bracket definition used in modeling:
    lower seed => worse seed number => seed_diff > 0.
    """

    if isinstance(X, pd.DataFrame):
        if seed_diff_col not in X.columns:
            # Fall back: no upset info.
            return np.zeros((len(X),), dtype=bool)
        return X[seed_diff_col].to_numpy(dtype=float) > 0
    # If X is a matrix we can't reliably locate seed_diff.
    # Caller should pass a DataFrame for upset-specific metrics.
    return np.zeros((len(X),), dtype=bool)


@dataclass
class CrossValReport:
    log_loss: float
    accuracy: float
    upset_detection: float
    brier: float


class MarchMadnessEnsemble:
    """
    Kaggle submission model — weighted ensemble of four calibrated classifiers.

    "Quant" level architecture (approx. Analyst Ladder target):
      - Weighted ensemble: LR (20%), GBM (40%), MLP (25%), RF (15%)
      - Probability clipping for stable submission behavior
    """

    def __init__(self, gender: str = "M", feature_cols: Optional[List[str]] = None):
        self.gender = gender.upper().strip()
        if self.gender not in {"M", "W"}:
            raise ValueError("gender must be 'M' or 'W'")

        self.feature_cols = feature_cols or FEATURE_COLS.copy()

        # Base models:
        self.lr: Pipeline = Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "clf",
                    LogisticRegression(
                        C=0.1, max_iter=2000, random_state=42, solver="lbfgs"
                    ),
                ),
            ]
        )

        self.gbm: GradientBoostingClassifier = GradientBoostingClassifier(
            n_estimators=500,
            learning_rate=0.03,
            max_depth=4,
            subsample=0.75,
            min_samples_leaf=8,
            random_state=42,
        )

        self.mlp: Pipeline = Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "clf",
                    MLPClassifier(
                        hidden_layer_sizes=(256, 128, 64, 32),
                        activation="relu",
                        alpha=0.01,
                        learning_rate="adaptive",
                        max_iter=1000,
                        random_state=42,
                        early_stopping=True,
                        validation_fraction=0.15,
                    ),
                ),
            ]
        )

        self.rf: RandomForestClassifier = RandomForestClassifier(
            n_estimators=400, max_depth=8, min_samples_leaf=8, random_state=42
        )

        # Quant weights.
        self.weights: Dict[str, float] = {"lr": 0.20, "gbm": 0.40, "mlp": 0.25, "rf": 0.15}

        self._fitted = False
        self.cv_report: Optional[CrossValReport] = None

    def fit(self, X: Any, y: Any) -> "MarchMadnessEnsemble":
        """
        Run a stratified cross-validation report first, then fit all models on full data.
        """

        X_sel = X  # keep X for upset metrics if needed
        y_arr = np.asarray(y).astype(int)

        # Dynamically include ordinal features only if they are present in X.
        # This keeps training/inference robust when earlier seasons don't have
        # ordinal columns filled.
        if isinstance(X_sel, pd.DataFrame):
            self.feature_cols = [c for c in ALL_FEATURES if c in X_sel.columns]

        # Cross-validate for visibility (optional but useful early).
        try:
            seasons = None
            if isinstance(X_sel, pd.DataFrame) and "Season" in X_sel.columns:
                seasons = X_sel["Season"].to_numpy()
            else:
                seasons = np.zeros_like(y_arr, dtype=int)

            self.cv_report = self.cross_validate(X_sel, y_arr, seasons=seasons, n_splits=3)
        except Exception:
            # Don't fail training if metrics can't be computed due to missing columns.
            self.cv_report = None

        X_mat = _select_feature_matrix(X_sel, self.feature_cols)

        # Fit each model on full data.
        self.lr.fit(X_mat, y_arr)
        self.gbm.fit(X_mat, y_arr)
        self.mlp.fit(X_mat, y_arr)
        self.rf.fit(X_mat, y_arr)

        self._fitted = True
        return self

    def _predict_each(self, X_mat: np.ndarray) -> Dict[str, np.ndarray]:
        """
        Return proba for the positive class (label=1).
        """

        lr_p = self.lr.predict_proba(X_mat)[:, 1]
        gbm_p = self.gbm.predict_proba(X_mat)[:, 1]
        mlp_p = self.mlp.predict_proba(X_mat)[:, 1]
        rf_p = self.rf.predict_proba(X_mat)[:, 1]
        return {"lr": lr_p, "gbm": gbm_p, "mlp": mlp_p, "rf": rf_p}

    def predict_proba(self, X: Any) -> np.ndarray:
        """
        Weighted ensemble probability for label=1 (team1 wins).
        """

        if not self._fitted:
            raise RuntimeError("Model is not fitted. Call fit() first.")

        X_mat = _select_feature_matrix(X, self.feature_cols)
        parts = self._predict_each(X_mat)

        proba = (
            self.weights["lr"] * parts["lr"]
            + self.weights["gbm"] * parts["gbm"]
            + self.weights["mlp"] * parts["mlp"]
            + self.weights["rf"] * parts["rf"]
        )

        # Kaggle stability: avoid extreme 0/1 probabilities.
        return np.clip(proba, 0.025, 0.975)

    def cross_validate(
        self, X: Any, y: np.ndarray, seasons: np.ndarray, n_splits: int = 3
    ) -> CrossValReport:
        """
        Stratified CV by *season upset rate* buckets.

        Upset definition used for bucketing/metrics:
          upset is y=1 when seed_diff > 0 (i.e., underdog wins).

        Bucket seasons into high/medium/low upset-rate groups, then for each fold:
          - test = 1 bucket
          - train = remaining buckets (2 buckets when using 3 folds)
        """

        y_arr = np.asarray(y).astype(int).reshape(-1)
        seasons_arr = np.asarray(seasons).astype(int).reshape(-1)
        if seasons_arr.shape[0] != y_arr.shape[0]:
            raise ValueError("seasons must have same length as y.")

        if not isinstance(X, pd.DataFrame):
            raise ValueError("Season-stratified cross_validate requires X to be a DataFrame.")

        if "seed_diff" not in X.columns:
            raise ValueError("cross_validate requires 'seed_diff' column in X for upset bucketing.")

        X_df = X
        X_mat = _select_feature_matrix(X_df, self.feature_cols)

        # Actual upset events: team1 won AND team1 was the underdog (worse seed number).
        upset_mask = X_df["seed_diff"].to_numpy(dtype=float) > 0
        upset_events = upset_mask & (y_arr == 1)

        season_df = pd.DataFrame({"Season": seasons_arr, "upset_event": upset_events})
        season_rates = (
            season_df.groupby("Season")["upset_event"].mean().reset_index(name="upset_rate")
        )

        unique_seasons = season_rates["Season"].to_numpy()
        n_bins = int(min(3, len(unique_seasons))) if len(unique_seasons) > 0 else 1
        if n_bins <= 1:
            row_bucket = np.zeros_like(seasons_arr, dtype=int)
        else:
            try:
                season_rates["season_bin"] = pd.qcut(
                    season_rates["upset_rate"], q=n_bins, labels=False, duplicates="drop"
                ).astype(int)
            except Exception:
                # Fallback: rank-based buckets.
                ranks = season_rates["upset_rate"].rank(method="average", pct=True)
                season_rates["season_bin"] = np.minimum((ranks * n_bins).astype(int), n_bins - 1)

            rate_map = dict(zip(season_rates["Season"].to_numpy(), season_rates["season_bin"].to_numpy()))
            row_bucket = np.array([rate_map.get(int(s), 0) for s in seasons_arr], dtype=int)

        fold_buckets = sorted(set(row_bucket.tolist()))
        # Respect the requested n_splits, but don't exceed available buckets.
        fold_buckets = fold_buckets[: min(n_splits, len(fold_buckets))]

        log_losses: List[float] = []
        accuracies: List[float] = []
        briers: List[float] = []
        upset_recalls: List[float] = []

        for bucket in fold_buckets:
            test_idx = np.where(row_bucket == bucket)[0]
            train_idx = np.where(row_bucket != bucket)[0]
            if len(test_idx) == 0 or len(train_idx) == 0:
                continue

            X_tr, X_va = X_mat[train_idx], X_mat[test_idx]
            y_tr, y_va = y_arr[train_idx], y_arr[test_idx]

            # Fit on train buckets, validate on the held-out bucket.
            lr_cv = self.lr
            gbm_cv = self.gbm
            mlp_cv = self.mlp
            rf_cv = self.rf

            lr_cv.fit(X_tr, y_tr)
            gbm_cv.fit(X_tr, y_tr)
            mlp_cv.fit(X_tr, y_tr)
            rf_cv.fit(X_tr, y_tr)

            parts_va = {
                "lr": lr_cv.predict_proba(X_va)[:, 1],
                "gbm": gbm_cv.predict_proba(X_va)[:, 1],
                "mlp": mlp_cv.predict_proba(X_va)[:, 1],
                "rf": rf_cv.predict_proba(X_va)[:, 1],
            }

            proba_va = (
                self.weights["lr"] * parts_va["lr"]
                + self.weights["gbm"] * parts_va["gbm"]
                + self.weights["mlp"] * parts_va["mlp"]
                + self.weights["rf"] * parts_va["rf"]
            )
            proba_va = np.clip(proba_va, 1e-6, 1 - 1e-6)

            log_losses.append(log_loss(y_va, proba_va))
            pred = (proba_va >= 0.5).astype(int)
            accuracies.append(accuracy_score(y_va, pred))
            briers.append(brier_score_loss(y_va, proba_va))

            # Upset recall: TP / (TP + FN), where actual positive is upset_event.
            upset_events_va = upset_events[test_idx]
            if upset_events_va.sum() == 0:
                upset_recalls.append(0.0)
            else:
                predicted_upsets_va = proba_va >= 0.5
                tp = int(((predicted_upsets_va & upset_events_va).sum()))
                upset_recalls.append(float(tp) / float(upset_events_va.sum()))

        return CrossValReport(
            log_loss=float(np.mean(log_losses)) if log_losses else 0.0,
            accuracy=float(np.mean(accuracies)) if accuracies else 0.0,
            upset_detection=float(np.mean(upset_recalls)) if upset_recalls else 0.0,
            brier=float(np.mean(briers)) if briers else 0.0,
        )

    def get_model_breakdown(self, X_single_row: Any) -> Dict[str, Any]:
        """
        Return each sub-model's prediction separately for ESPN-style display.

        Input: either a 1-row DataFrame or a 1D array with length=len(feature_cols).
        """

        X_mat = _select_feature_matrix(X_single_row, self.feature_cols)
        if X_mat.ndim == 2 and X_mat.shape[0] != 1:
            # If multiple rows, still return vectorized breakdown, but keep a consistent API.
            pass

        parts = self._predict_each(X_mat)
        # Ensure scalar floats when input is a single row.
        def as_scalar(a: np.ndarray) -> float:
            return float(a[0]) if a.ndim == 1 or a.shape[0] else float(a)

        out: Dict[str, Any] = {
            "Decision Tree (GBM)": as_scalar(parts["gbm"]),
            "Power Ratings (LR)": as_scalar(parts["lr"]),
            "Similar Games (RF)": as_scalar(parts["rf"]),
            "Simulation (MLP)": as_scalar(parts["mlp"]),
        }
        ensemble = (
            self.weights["lr"] * parts["lr"]
            + self.weights["gbm"] * parts["gbm"]
            + self.weights["mlp"] * parts["mlp"]
            + self.weights["rf"] * parts["rf"]
        )
        out["Ensemble"] = as_scalar(ensemble)
        return out

    def save(self, path: str) -> None:
        bundle = {
            "gender": self.gender,
            "feature_cols": self.feature_cols,
            "weights": self.weights,
            "lr": self.lr,
            "gbm": self.gbm,
            "mlp": self.mlp,
            "rf": self.rf,
            "_fitted": self._fitted,
            "cv_report": self.cv_report,
        }
        with open(path, "wb") as f:
            pickle.dump(bundle, f)

    @classmethod
    def load(cls, path: str) -> "MarchMadnessEnsemble":
        with open(path, "rb") as f:
            bundle = pickle.load(f)

        model = cls(gender=bundle.get("gender", "M"), feature_cols=bundle.get("feature_cols", FEATURE_COLS))
        model.weights = bundle.get("weights", model.weights)
        model.lr = bundle["lr"]
        model.gbm = bundle["gbm"]
        model.mlp = bundle["mlp"]
        model.rf = bundle["rf"]
        model._fitted = bundle.get("_fitted", True)
        model.cv_report = bundle.get("cv_report", None)
        return model


if __name__ == "__main__":
    print("standard_model.py loaded. Implement training pipeline next.")

