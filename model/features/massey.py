from __future__ import annotations

import os
from typing import Dict

import numpy as np
import pandas as pd


def build_massey_ratings(games_df: pd.DataFrame, season: int) -> Dict[int, float]:
    """
    Build Massey Ratings for a single season.

    Massey Ratings solve a linear system that fits *all* games simultaneously.
    For each game i between winner w and loser l:

        rating[w] - rating[l] = (WScore_i - LScore_i)

    With many games, the system is typically over/under-determined, so we solve
    for ratings using least squares:

        min_r ||A r - b||^2

    Because ratings are only defined up to an additive constant, the system
    is singular unless we add a constraint. We add:

        sum_t rating[t] = 0

    Parameters
    ----------
    games_df:
        DataFrame with columns: [Season, DayNum, WTeamID, LTeamID, WScore, LScore]
    season:
        Season year to filter on.

    Returns
    -------
    Dict[int, float]
        Mapping {team_id: massey_score}.
    """

    season_games = games_df.loc[games_df["Season"] == season]
    if season_games.empty:
        raise ValueError(f"No games found for Season={season}.")

    team_ids = pd.unique(
        np.concatenate([season_games["WTeamID"].to_numpy(), season_games["LTeamID"].to_numpy()])
    )
    team_ids = team_ids.astype(int, copy=False)

    team_to_idx = {int(team_id): idx for idx, team_id in enumerate(team_ids)}
    n_teams = len(team_ids)
    n_games = len(season_games)

    # One row per game + one constraint row to make the system identifiable.
    A = np.zeros((n_games + 1, n_teams), dtype=float)
    b = np.zeros((n_games + 1,), dtype=float)

    for i, row in enumerate(season_games.itertuples(index=False)):
        w_team = int(getattr(row, "WTeamID"))
        l_team = int(getattr(row, "LTeamID"))
        score_diff = float(getattr(row, "WScore") - getattr(row, "LScore"))

        A[i, team_to_idx[w_team]] = 1.0
        A[i, team_to_idx[l_team]] = -1.0
        b[i] = score_diff

    # Constraint: sum of all ratings is 0.
    A[-1, :] = 1.0
    b[-1] = 0.0

    x, *_ = np.linalg.lstsq(A, b, rcond=None)

    return {int(team_ids[j]): float(x[j]) for j in range(n_teams)}


def build_massey_all_seasons(games_df: pd.DataFrame) -> Dict[int, Dict[int, float]]:
    """
    Build Massey ratings for each season in `games_df`.

    This function returns the *pre-tournament* Massey ratings for each season,
    computed using only games with `DayNum <= 132`.

    Parameters
    ----------
    games_df:
        DataFrame with columns: [Season, DayNum, WTeamID, LTeamID, WScore, LScore]

    Returns
    -------
    Dict[int, Dict[int, float]]
        {season: {team_id: massey_score}}.
    """

    required_cols = {"Season", "DayNum", "WTeamID", "LTeamID", "WScore", "LScore"}
    missing = required_cols - set(games_df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    seasons = sorted(pd.unique(games_df["Season"].to_numpy()).astype(int))
    out: Dict[int, Dict[int, float]] = {}

    pre_tourney_df = games_df.loc[games_df["DayNum"] <= 132]
    for season in seasons:
        season_df = pre_tourney_df.loc[pre_tourney_df["Season"] == season]
        if season_df.empty:
            continue
        out[int(season)] = build_massey_ratings(season_df, int(season))

    return out


def get_massey_adjusted_seed(
    massey_rating: float, historical_seed_massey_map: Dict[int, float]
) -> float:
    """
    Convert a Massey rating into a "committee-style" adjusted seed.

    The input `historical_seed_massey_map` should contain the typical Massey
    rating associated with each seed number in historical seasons.

    We return the seed whose historical rating is closest (L1 distance) to
    the provided `massey_rating`.
    """

    best_seed = None
    best_dist = float("inf")

    for seed, seed_massey in historical_seed_massey_map.items():
        # Support maps like {seed: mean_rating} or {seed: [mean, ...]}.
        if isinstance(seed_massey, (list, tuple, np.ndarray)):
            seed_massey_val = float(np.mean(seed_massey))
        else:
            seed_massey_val = float(seed_massey)

        dist = abs(float(massey_rating) - seed_massey_val)
        if dist < best_dist:
            best_dist = dist
            best_seed = int(seed)

    if best_seed is None:
        raise ValueError("historical_seed_massey_map was empty.")

    return float(best_seed)


def compute_massey_momentum(
    games_df: pd.DataFrame,
    team_id: int,
    season: int,
    reference_daynum: int,
    window_days: int = 30,
) -> float:
    """
    Compute Massey "momentum" as rating change over a recent time window.

    Momentum is defined as:

        momentum = rating_now(team) - rating_then(team)

    where:
      - rating_then(team) is the team's Massey rating computed using games with
        DayNum <= (reference_daynum - window_days)
      - rating_now(team) is the team's Massey rating computed using games with
        DayNum <= reference_daynum
    """

    cutoff_then = int(reference_daynum) - int(window_days)
    if cutoff_then < 0:
        cutoff_then = 0

    df_then = games_df.loc[
        (games_df["Season"] == season) & (games_df["DayNum"] <= cutoff_then)
    ]
    df_now = games_df.loc[(games_df["Season"] == season) & (games_df["DayNum"] <= reference_daynum)]

    if df_then.empty or df_now.empty:
        raise ValueError(
            "Not enough games to compute momentum for the requested window/cutoff."
        )

    ratings_then = build_massey_ratings(df_then, season)
    ratings_now = build_massey_ratings(df_now, season)

    team_id_int = int(team_id)
    if team_id_int not in ratings_then or team_id_int not in ratings_now:
        raise ValueError(f"Team {team_id_int} not found in computed ratings.")

    return float(ratings_now[team_id_int] - ratings_then[team_id_int])


if __name__ == "__main__":
    # Simple smoke test:
    # Load regular-season games and print top 10 Massey ratings for 2026.
    DATA_DIR = "./data"
    SEASON = 2026

    csv_path = os.path.join(DATA_DIR, "MRegularSeasonCompactResults.csv")
    if not os.path.exists(csv_path):
        raise FileNotFoundError(
            f"Missing file: {csv_path}. Put Kaggle CSVs into {DATA_DIR}/."
        )

    games = pd.read_csv(csv_path)
    massey = build_massey_ratings(games, SEASON)
    top10 = sorted(massey.items(), key=lambda kv: kv[1], reverse=True)[:10]

    print(f"Top 10 Massey Ratings ({SEASON})")
    for team_id, rating in top10:
        print(f"{team_id}\t{rating:.3f}")

