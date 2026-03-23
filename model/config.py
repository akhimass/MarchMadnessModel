import os
from pathlib import Path

# Default data directory (override via DATA_DIR env var).
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))

# Used throughout the pipeline for seasonal training/simulation.
CURRENT_SEASON = 2026

# Increment when the modeling approach / features change.
MODEL_VERSION = "v0"

# Feature list used to train the standard Kaggle ensemble.
# Kept in a central place so both training and inference can agree on
# which feature columns exist.
ORDINAL_FEATURES = [
    "ord_pom_rank_diff",
    "ord_sag_rank_diff",
    "ord_net_rank_diff",
    "ord_bpi_rank_diff",
    "ord_consensus_rank_diff",
    "ord_rank_sigma_diff",
    "ord_committee_bias_diff",
    "ord_pom_momentum_diff",
    "ord_human_vs_computer_diff",
]

# Core matchup features (must match `model/training/standard_model.py` expectations)
ALL_FEATURES = [
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
    *ORDINAL_FEATURES,
    # Variance differential / upset-variance features
    "var_margin_std_diff",
    "var_ceiling_diff",
    "var_floor_diff",
    "var_upset_ceiling_gap",
    "var_fav_std",
    "var_dog_std",
    # Enrichment (2026-only): Claude injury/recency adjustments
    "enrich_injury_diff",
    "enrich_recency_diff",
]
