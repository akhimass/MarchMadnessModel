from __future__ import annotations

from typing import Any, Dict, Iterable, Mapping, Optional, Tuple

import numpy as np
import pandas as pd


def _get_map_value(map_obj: Mapping, key: Any, default: float = 0.0) -> float:
    val = map_obj.get(key, default)
    try:
        return float(val)
    except (TypeError, ValueError):
        return float(default)


def _get_team_stat(
    team_stats: Mapping[Tuple[int, int], Mapping[str, Any]],
    season: int,
    team_id: int,
    key: str,
    default: float = 0.0,
) -> float:
    stats = team_stats.get((season, team_id), None)  # type: ignore[arg-type]
    if not stats:
        return default
    val = stats.get(key, default)
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _get_team_stat_anykey(
    team_stats: Mapping[Tuple[int, int], Mapping[str, Any]],
    season: int,
    team_id: int,
    keys: Iterable[str],
    default: float = 0.0,
) -> float:
    for k in keys:
        val = _get_team_stat(team_stats, season, team_id, k, default=np.nan)
        if not np.isnan(val):
            return float(val)
    return default


def _get_seed(
    seeds: Mapping[Tuple[int, int], Any], season: int, team_id: int, default: float = 0.0
) -> float:
    return _get_map_value(seeds, (season, team_id), default=default)


def _compute_implied_seeds_from_massey(
    season: int,
    massey_ratings: Mapping[int, Mapping[int, float]],
    seeds: Mapping[Tuple[int, int], Any],
    team_ids: Iterable[int],
) -> Dict[int, float]:
    """
    Fallback mapping from Massey rating -> implied seed number.

    If you later want to replace this with a historical Massey->seed map,
    do so by precomputing `massey_implied_seed` inside `team_stats` or by
    passing the proper historical map in a follow-up refactor.
    """

    season_massey = massey_ratings.get(season, {})
    teams = list(team_ids)
    teams = [int(t) for t in teams if t in season_massey]
    if not teams:
        return {}

    # Highest Massey rating should map to smallest seed number.
    teams_sorted = sorted(teams, key=lambda t: float(season_massey[t]), reverse=True)
    n = len(teams_sorted)
    # Split ranks into 16 bins.
    bin_size = max(n / 16.0, 1.0)

    implied: Dict[int, float] = {}
    for rank, tid in enumerate(teams_sorted):
        # rank in [0..n-1] -> seed in [1..16]
        seed_bin = 1 + int(rank / bin_size)
        implied[tid] = float(min(max(seed_bin, 1), 16))
    return implied


def create_matchup_features(
    team1_id: int,
    team2_id: int,
    season: int,
    massey_ratings: Mapping[int, Mapping[int, float]],
    team_stats: Mapping[Tuple[int, int], Mapping[str, Any]],
    seeds: Mapping[Tuple[int, int], Any],
    seed_win_rates: Mapping[Tuple[int, int], float],
    historical_tourney_wins: Mapping[int, float],
) -> Dict[str, float]:
    """
    Core matchup feature engineering for ML training.

    Returns a numeric feature vector for (team1 vs team2), where most features
    are *team1 - team2* differentials (or team1-relative for probability-type features).

    Notes on feature sourcing:
    - This function expects `team_stats[(season, team_id)]` to contain the keys
      used below (NetEff, net_TO_diff, etc.). Missing keys default to 0.0.
    - For `elo_diff` we look for `elo`, `elo_rating`, or `EloRating` keys in team_stats.
    - `massey_adj_seed_diff` is computed using a fallback Massey->implied-seed mapping
      unless `team_stats` contains `massey_implied_seed` (or `massey_adj_seed`).
    """

    team1_id = int(team1_id)
    team2_id = int(team2_id)
    season = int(season)

    # -----------------------
    # Seeds
    # -----------------------
    seed1 = _get_seed(seeds, season, team1_id)
    seed2 = _get_seed(seeds, season, team2_id)

    # -----------------------
    # Seed historical matchup win probability
    # -----------------------
    # `seed_win_rates[(seed_low, seed_high)]` is defined from the LOWER-seed perspective.
    # Convert to TEAM1 win probability so the feature stays team1-relative.
    seed_low = float(min(seed1, seed2))
    seed_high = float(max(seed1, seed2))
    p_lower = seed_win_rates.get((int(seed_low), int(seed_high)), np.nan)
    if np.isnan(p_lower):
        # Try reverse lookup just in case data was stored inconsistently.
        p_lower = seed_win_rates.get((int(seed_high), int(seed_low)), np.nan)
        if not np.isnan(p_lower):
            # If stored incorrectly as (high, low), assume it was still "lower-seed perspective"
            # (i.e., team with seed_low). Otherwise default later.
            pass
    if np.isnan(p_lower):
        p_lower = 0.5

    team1_is_lower = seed1 <= seed2
    seed_hist_win_prob = float(p_lower) if team1_is_lower else float(1.0 - p_lower)

    # -----------------------
    # Massey ratings
    # -----------------------
    season_massey = massey_ratings.get(season, {})
    massey1 = float(season_massey.get(team1_id, 0.0))
    massey2 = float(season_massey.get(team2_id, 0.0))
    massey_diff = massey1 - massey2

    # -----------------------
    # Massey adjusted seed diff (committee overseeding proxy)
    # -----------------------
    implied_seed1 = _get_team_stat_anykey(
        team_stats, season, team1_id, keys=["massey_implied_seed", "massey_adj_seed"], default=np.nan
    )
    implied_seed2 = _get_team_stat_anykey(
        team_stats, season, team2_id, keys=["massey_implied_seed", "massey_adj_seed"], default=np.nan
    )
    if np.isnan(implied_seed1) or np.isnan(implied_seed2):
        teams_in_season = {
            tid for (s, tid) in seeds.keys() if int(s) == season  # type: ignore[attr-defined]
        }
        implied_map = _compute_implied_seeds_from_massey(
            season=season,
            massey_ratings=massey_ratings,
            seeds=seeds,
            team_ids=teams_in_season if teams_in_season else season_massey.keys(),
        )
        implied_seed1 = float(implied_map.get(team1_id, seed1))
        implied_seed2 = float(implied_map.get(team2_id, seed2))

    massey_adj_seed_diff = (float(implied_seed1) - float(seed1)) - (
        float(implied_seed2) - float(seed2)
    )

    # -----------------------
    # Elo diff (optional)
    # -----------------------
    elo1 = _get_team_stat_anykey(team_stats, season, team1_id, ["elo_rating", "EloRating", "elo"], default=0.0)
    elo2 = _get_team_stat_anykey(team_stats, season, team2_id, ["elo_rating", "EloRating", "elo"], default=0.0)
    elo_diff = elo1 - elo2

    # -----------------------
    # Helper: extract team features from team_stats
    # -----------------------
    def t(key: str, default: float = 0.0) -> float:
        return float(
            team_stats.get((season, team1_id), {}).get(key, default)  # type: ignore[union-attr]
        )

    def u(key: str, default: float = 0.0) -> float:
        return float(
            team_stats.get((season, team2_id), {}).get(key, default)  # type: ignore[union-attr]
        )

    net_eff_diff = t("NetEff", 0.0) - u("NetEff", 0.0)
    net_to_diff = t("net_TO_diff", 0.0) - u("net_TO_diff", 0.0)
    net_reb_diff = t("net_reb_margin", 0.0) - u("net_reb_margin", 0.0)
    ft_rate_diff = t("FT_rate", 0.0) - u("FT_rate", 0.0)
    efg_diff = t("eFG_off", 0.0) - u("eFG_off", 0.0)
    pace_diff = t("Pace", 0.0) - u("Pace", 0.0)
    threep_diff = t("ThreePRate", 0.0) - u("ThreePRate", 0.0)
    ast_diff = t("AstRate", 0.0) - u("AstRate", 0.0)
    blk_diff = t("BlkRate", 0.0) - u("BlkRate", 0.0)
    svi_diff = t("SVI", 0.0) - u("SVI", 0.0)

    massey_momentum_diff = t("massey_momentum", 0.0) - u("massey_momentum", 0.0)
    tourney_prestige_diff = float(historical_tourney_wins.get(team1_id, 0.0)) - float(
        historical_tourney_wins.get(team2_id, 0.0)
    )

    # -----------------------
    # Compose output
    # -----------------------
    return {
        # Seed-based features
        "seed_diff": float(seed1 - seed2),
        "seed_hist_win_prob": float(seed_hist_win_prob),
        "seed1": float(seed1),
        "seed2": float(seed2),
        # Massey (dominant)
        "massey_diff": float(massey_diff),
        "massey_adj_seed_diff": float(massey_adj_seed_diff),
        "massey1": float(massey1),
        "massey2": float(massey2),
        # Optional strength features
        "elo_diff": float(elo_diff),
        "net_eff_diff": float(net_eff_diff),
        # KEY matchup stats
        "net_to_diff": float(net_to_diff),
        "net_reb_diff": float(net_reb_diff),
        "ft_rate_diff": float(ft_rate_diff),
        "efg_diff": float(efg_diff),
        "pace_diff": float(pace_diff),
        "threep_diff": float(threep_diff),
        "ast_diff": float(ast_diff),
        "blk_diff": float(blk_diff),
        "svi_diff": float(svi_diff),
        # Additional features
        "massey_momentum_diff": float(massey_momentum_diff),
        "tourney_prestige_diff": float(tourney_prestige_diff),
        # Included because some models prefer raw components
        "tourney_prestige_diff": float(tourney_prestige_diff),
        # (Keep tourney matchup features aligned with the spec key names)
        # NOTE: no explicit `threep` z-score stored here; we rely on team_stats scale.
    }


def _infer_matchup_teams(submission_df: pd.DataFrame) -> Tuple[str, str]:
    """
    Determine which columns hold (team1_id, team2_id) in `submission_df`.
    """
    candidates = [
        ("Team1", "Team2"),
        ("StrongTeamID", "WeakTeamID"),
        ("WTeamID", "LTeamID"),
    ]
    for a, b in candidates:
        if a in submission_df.columns and b in submission_df.columns:
            return a, b
    raise ValueError(
        "submission_df must include either (Team1, Team2) or (StrongTeamID, WeakTeamID) "
        "or (WTeamID, LTeamID) columns."
    )


def build_training_set(
    tourney_results: pd.DataFrame,
    massey_ratings: Mapping[int, Mapping[int, float]],
    team_stats: Mapping[Tuple[int, int], Mapping[str, Any]],
    seeds: Mapping[Tuple[int, int], Any],
    seed_win_rates: Mapping[Tuple[int, int], float],
    historical_tourney_wins: Mapping[int, float],
) -> pd.DataFrame:
    """
    Build a balanced training set from historical tournament results.

    Expects `tourney_results` to include:
      - `Season`
      - `WTeamID` and `LTeamID`

    For each matchup, we add:
      - the direct version: (team1=WTeamID, team2=LTeamID, label=1)
      - the mirrored version: (team1=LTeamID, team2=WTeamID, label=0)
    """

    required = {"Season", "WTeamID", "LTeamID"}
    missing = required - set(tourney_results.columns)
    if missing:
        raise ValueError(f"tourney_results missing required columns: {sorted(missing)}")

    rows: list[dict[str, Any]] = []
    for r in tourney_results.itertuples(index=False):
        season = int(getattr(r, "Season"))
        w = int(getattr(r, "WTeamID"))
        l = int(getattr(r, "LTeamID"))

        fwd = create_matchup_features(
            w,
            l,
            season,
            massey_ratings=massey_ratings,
            team_stats=team_stats,
            seeds=seeds,
            seed_win_rates=seed_win_rates,
            historical_tourney_wins=historical_tourney_wins,
        )
        fwd["label"] = 1
        rows.append(fwd)

        rev = create_matchup_features(
            l,
            w,
            season,
            massey_ratings=massey_ratings,
            team_stats=team_stats,
            seeds=seeds,
            seed_win_rates=seed_win_rates,
            historical_tourney_wins=historical_tourney_wins,
        )
        rev["label"] = 0
        rows.append(rev)

    return pd.DataFrame(rows)


def build_submission_set(
    submission_df: pd.DataFrame,
    season: int,
    massey_ratings: Mapping[int, Mapping[int, float]],
    team_stats: Mapping[Tuple[int, int], Mapping[str, Any]],
    seeds: Mapping[Tuple[int, int], Any],
    seed_win_rates: Mapping[Tuple[int, int], float],
    historical_tourney_wins: Mapping[int, float],
) -> pd.DataFrame:
    """
    Build a feature matrix for Kaggle submission matchups.

    Expects `submission_df` to include at least team IDs in one of these formats:
      - (Team1, Team2)
      - (StrongTeamID, WeakTeamID)
      - (WTeamID, LTeamID)

    If `Season` column is missing, `season` argument is used.
    """

    season_col = "Season" if "Season" in submission_df.columns else None
    team1_col, team2_col = _infer_matchup_teams(submission_df)

    feature_rows: list[dict[str, Any]] = []
    for r in submission_df.itertuples(index=False):
        d = r._asdict()
        s = int(d[season_col]) if season_col else int(season)
        t1 = int(d[team1_col])
        t2 = int(d[team2_col])

        features = create_matchup_features(
            t1,
            t2,
            s,
            massey_ratings=massey_ratings,
            team_stats=team_stats,
            seeds=seeds,
            seed_win_rates=seed_win_rates,
            historical_tourney_wins=historical_tourney_wins,
        )
        if "ID" in submission_df.columns:
            features["ID"] = d["ID"]
        feature_rows.append(features)

    return pd.DataFrame(feature_rows)


if __name__ == "__main__":
    # Minimal smoke test scaffold (not executed unless you provide the maps).
    print("matchup_builder.py loaded. Wire create_matchup_features with your computed maps.")

