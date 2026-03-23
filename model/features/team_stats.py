from __future__ import annotations

from typing import List

import numpy as np
import pandas as pd

from model.config import DATA_DIR, CURRENT_SEASON


def _safe_div(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    """
    Elementwise safe division that returns 0 when denominator is 0.
    """

    return np.divide(num, den, out=np.zeros_like(num, dtype=float), where=den != 0)


def build_team_season_features(
    detailed_df: pd.DataFrame, compact_df: pd.DataFrame, season: int
) -> pd.DataFrame:
    """
    Comprehensive team feature engineering for a single season.

    This builds one row per team for the given `season` by combining:
      - Basic win/loss-derived stats from compact results
      - Four factors, efficiency, and advanced rates from detailed results
      - A few net differentials useful for matchup feature creation

    Parameters
    ----------
    detailed_df:
        `MRegularSeasonDetailedResults.csv` (or `WRegularSeasonDetailedResults.csv`)
        with standard NCAA columns where `W*` are winner stats and `L*` are loser stats.
    compact_df:
        `MRegularSeasonCompactResults.csv` (or `WRegularSeasonCompactResults.csv`).
        (Compact results contain only scores; wins/games are derived here.)
    season:
        Season year to filter on.

    Returns
    -------
    pd.DataFrame
        Columns:
          BASIC STATS:
            TeamID, Season, Games, Wins, WinPct, AvgPF, AvgPA, AvgMargin
          FOUR FACTORS:
            eFG_off, eFG_def, TO_rate_off, TO_rate_def, OR_rate, DR_rate,
            FT_rate, FT_rate_def
          EFFICIENCY:
            OffEff, DefEff, NetEff, Pace
          ADVANCED:
            AstRate, BlkRate, StlRate, ThreePRate, ThreePARate
          NET DIFFERENTIALS (team minus opponent, for matchup features):
            net_TO_diff, net_reb_margin, net_blk
    """

    # ---------------------------
    # Validate inputs
    # ---------------------------
    required_detailed = {
        "Season",
        "WTeamID",
        "WScore",
        "LTeamID",
        "LScore",
        "WFGM",
        "WFGA",
        "WFGM3",
        "WFGA3",
        "WFTM",
        "WFTA",
        "WOR",
        "WDR",
        "WAst",
        "WTO",
        "WStl",
        "WBlk",
        "LFGM",
        "LFGA",
        "LFGM3",
        "LFGA3",
        "LFTM",
        "LFTA",
        "LOR",
        "LDR",
        "LAst",
        "LTO",
        "LStl",
        "LBlk",
    }
    missing_detailed = required_detailed - set(detailed_df.columns)
    if missing_detailed:
        raise ValueError(f"detailed_df missing columns: {sorted(missing_detailed)}")

    required_compact = {"Season", "WTeamID", "WScore", "LTeamID", "LScore"}
    missing_compact = required_compact - set(compact_df.columns)
    if missing_compact:
        raise ValueError(f"compact_df missing columns: {sorted(missing_compact)}")

    # ---------------------------
    # BASIC STATS from compact
    # ---------------------------
    detailed_season = detailed_df.loc[detailed_df["Season"] == season].copy()
    compact_season = compact_df.loc[compact_df["Season"] == season].copy()

    if detailed_season.empty:
        raise ValueError(f"No detailed games found for season={season}.")
    if compact_season.empty:
        raise ValueError(f"No compact games found for season={season}.")

    # Convert each compact game row into two team-game rows.
    win_rows = compact_season[["Season", "WTeamID", "WScore", "LScore"]].rename(
        columns={"WTeamID": "TeamID", "WScore": "PF", "LScore": "PA"}
    )
    win_rows["Win"] = 1

    loss_rows = compact_season[["Season", "LTeamID", "LScore", "WScore"]].rename(
        columns={"LTeamID": "TeamID", "LScore": "PF", "WScore": "PA"}
    )
    loss_rows["Win"] = 0

    team_games_basic = pd.concat([win_rows, loss_rows], ignore_index=True)
    basic = (
        team_games_basic.groupby(["Season", "TeamID"], as_index=False)
        .agg(
            Games=("PF", "size"),
            Wins=("Win", "sum"),
            AvgPF=("PF", "mean"),
            AvgPA=("PA", "mean"),
        )
        .copy()
    )
    basic["WinPct"] = basic["Wins"] / basic["Games"]
    basic["AvgMargin"] = basic["AvgPF"] - basic["AvgPA"]

    # ---------------------------
    # FOUR FACTORS / EFFICIENCY / ADVANCED from detailed
    # ---------------------------
    # Build a two-rows-per-game team-perspective table:
    #   - Row A: team is the winner (offense=W*, defense=opponent=L*)
    #   - Row B: team is the loser  (offense=L*, defense=opponent=W*)
    def _winner_perspective(df: pd.DataFrame) -> pd.DataFrame:
        team = pd.DataFrame(
            {
                "Season": df["Season"],
                "TeamID": df["WTeamID"].astype(int),
                # Offense (team)
                "Off_points": df["WScore"],
                "Off_fgm": df["WFGM"],
                "Off_fga": df["WFGA"],
                "Off_fgm3": df["WFGM3"],
                "Off_fga3": df["WFGA3"],
                "Off_ftm": df["WFTM"],
                "Off_fta": df["WFTA"],
                "Off_or": df["WOR"],
                "Off_dr": df["WDR"],
                "Off_tov": df["WTO"],
                "Off_ast": df["WAst"],
                "Off_stl": df["WStl"],
                "Off_blk": df["WBlk"],
                # Defense (opponent offense against this team)
                "Opp_points": df["LScore"],
                "Opp_fgm": df["LFGM"],
                "Opp_fga": df["LFGA"],
                "Opp_fgm3": df["LFGM3"],
                "Opp_fga3": df["LFGA3"],
                "Opp_ftm": df["LFTM"],
                "Opp_fta": df["LFTA"],
                "Opp_or": df["LOR"],
                "Opp_dr": df["LDR"],
                "Opp_tov": df["LTO"],
                "Opp_blk": df["LBlk"],
            }
        )

        # Four factors and derived numerators/denominators.
        team["eFG_off_num"] = team["Off_fgm"] + 0.5 * team["Off_fgm3"]
        team["eFG_off_den"] = team["Off_fga"]

        team["eFG_def_num"] = team["Opp_fgm"] + 0.5 * team["Opp_fgm3"]
        team["eFG_def_den"] = team["Opp_fga"]

        team["TO_rate_off_num"] = team["Off_tov"]
        team["TO_rate_off_den"] = team["Off_fga"] + 0.44 * team["Off_fta"] + team["Off_tov"]

        team["TO_rate_def_num"] = team["Opp_tov"]
        team["TO_rate_def_den"] = team["Opp_fga"] + 0.44 * team["Opp_fta"] + team["Opp_tov"]

        team["OR_num"] = team["Off_or"]
        team["OR_den"] = team["Off_or"] + team["Opp_dr"]

        team["DR_num"] = team["Off_dr"]
        team["DR_den"] = team["Off_dr"] + team["Opp_or"]

        team["FT_rate_num"] = team["Off_ftm"]
        team["FT_rate_den"] = team["Off_fga"]

        team["FT_rate_def_num"] = team["Opp_ftm"]
        team["FT_rate_def_den"] = team["Opp_fga"]

        # Possessions + efficiency.
        team["Off_possessions"] = (
            team["Off_fga"] - team["Off_or"] + team["Off_tov"] + 0.44 * team["Off_fta"]
        )
        team["Opp_possessions"] = (
            team["Opp_fga"] - team["Opp_or"] + team["Opp_tov"] + 0.44 * team["Opp_fta"]
        )

        team["OffEff_num"] = team["Off_points"] * 100.0
        team["OffEff_den"] = team["Off_possessions"]
        team["DefEff_num"] = team["Opp_points"] * 100.0
        team["DefEff_den"] = team["Opp_possessions"]

        team["Pace"] = (team["Off_possessions"] + team["Opp_possessions"]) / 2.0

        # Advanced.
        team["AstRate_num"] = team["Off_ast"]
        team["AstRate_den"] = team["Off_fgm"]

        # Blocks are defensive; denominator is opponent FGA.
        team["BlkRate_num"] = team["Off_blk"]
        team["BlkRate_den"] = team["Opp_fga"]

        team["StlRate_num"] = team["Off_stl"]
        team["StlRate_den"] = team["Opp_possessions"]

        team["ThreePRate_num"] = team["Off_fgm3"]
        team["ThreePRate_den"] = team["Off_fga3"]

        team["ThreePARate_num"] = team["Off_fga3"]
        team["ThreePARate_den"] = team["Off_fga"]

        # For net_blk: opponent's blocks per *our* FGA.
        team["opp_BlkRate_num"] = team["Opp_blk"]
        team["opp_BlkRate_den"] = team["Off_fga"]

        return team

    def _loser_perspective(df: pd.DataFrame) -> pd.DataFrame:
        team = pd.DataFrame(
            {
                "Season": df["Season"],
                "TeamID": df["LTeamID"].astype(int),
                # Offense (team)
                "Off_points": df["LScore"],
                "Off_fgm": df["LFGM"],
                "Off_fga": df["LFGA"],
                "Off_fgm3": df["LFGM3"],
                "Off_fga3": df["LFGA3"],
                "Off_ftm": df["LFTM"],
                "Off_fta": df["LFTA"],
                "Off_or": df["LOR"],
                "Off_dr": df["LDR"],
                "Off_tov": df["LTO"],
                "Off_ast": df["LAst"],
                "Off_stl": df["LStl"],
                "Off_blk": df["LBlk"],
                # Defense (opponent offense against this team)
                "Opp_points": df["WScore"],
                "Opp_fgm": df["WFGM"],
                "Opp_fga": df["WFGA"],
                "Opp_fgm3": df["WFGM3"],
                "Opp_fga3": df["WFGA3"],
                "Opp_ftm": df["WFTM"],
                "Opp_fta": df["WFTA"],
                "Opp_or": df["WOR"],
                "Opp_dr": df["WDR"],
                "Opp_tov": df["WTO"],
                "Opp_blk": df["WBlk"],
            }
        )

        team["eFG_off_num"] = team["Off_fgm"] + 0.5 * team["Off_fgm3"]
        team["eFG_off_den"] = team["Off_fga"]

        team["eFG_def_num"] = team["Opp_fgm"] + 0.5 * team["Opp_fgm3"]
        team["eFG_def_den"] = team["Opp_fga"]

        team["TO_rate_off_num"] = team["Off_tov"]
        team["TO_rate_off_den"] = team["Off_fga"] + 0.44 * team["Off_fta"] + team["Off_tov"]

        team["TO_rate_def_num"] = team["Opp_tov"]
        team["TO_rate_def_den"] = team["Opp_fga"] + 0.44 * team["Opp_fta"] + team["Opp_tov"]

        team["OR_num"] = team["Off_or"]
        team["OR_den"] = team["Off_or"] + team["Opp_dr"]

        team["DR_num"] = team["Off_dr"]
        team["DR_den"] = team["Off_dr"] + team["Opp_or"]

        team["FT_rate_num"] = team["Off_ftm"]
        team["FT_rate_den"] = team["Off_fga"]

        team["FT_rate_def_num"] = team["Opp_ftm"]
        team["FT_rate_def_den"] = team["Opp_fga"]

        team["Off_possessions"] = (
            team["Off_fga"] - team["Off_or"] + team["Off_tov"] + 0.44 * team["Off_fta"]
        )
        team["Opp_possessions"] = (
            team["Opp_fga"] - team["Opp_or"] + team["Opp_tov"] + 0.44 * team["Opp_fta"]
        )

        team["OffEff_num"] = team["Off_points"] * 100.0
        team["OffEff_den"] = team["Off_possessions"]
        team["DefEff_num"] = team["Opp_points"] * 100.0
        team["DefEff_den"] = team["Opp_possessions"]

        team["Pace"] = (team["Off_possessions"] + team["Opp_possessions"]) / 2.0

        team["AstRate_num"] = team["Off_ast"]
        team["AstRate_den"] = team["Off_fgm"]

        team["BlkRate_num"] = team["Off_blk"]
        team["BlkRate_den"] = team["Opp_fga"]

        team["StlRate_num"] = team["Off_stl"]
        team["StlRate_den"] = team["Opp_possessions"]

        team["ThreePRate_num"] = team["Off_fgm3"]
        team["ThreePRate_den"] = team["Off_fga3"]

        team["ThreePARate_num"] = team["Off_fga3"]
        team["ThreePARate_den"] = team["Off_fga"]

        team["opp_BlkRate_num"] = team["Opp_blk"]
        team["opp_BlkRate_den"] = team["Off_fga"]

        return team

    team_games = pd.concat(
        [_winner_perspective(detailed_season), _loser_perspective(detailed_season)],
        ignore_index=True,
    )

    # Aggregate per team per season: sum numerators/denominators for stable rates.
    g = team_games.groupby(["Season", "TeamID"], as_index=False)
    sums = g.agg(
        eFG_off_num=("eFG_off_num", "sum"),
        eFG_off_den=("eFG_off_den", "sum"),
        eFG_def_num=("eFG_def_num", "sum"),
        eFG_def_den=("eFG_def_den", "sum"),
        TO_rate_off_num=("TO_rate_off_num", "sum"),
        TO_rate_off_den=("TO_rate_off_den", "sum"),
        TO_rate_def_num=("TO_rate_def_num", "sum"),
        TO_rate_def_den=("TO_rate_def_den", "sum"),
        OR_num=("OR_num", "sum"),
        OR_den=("OR_den", "sum"),
        DR_num=("DR_num", "sum"),
        DR_den=("DR_den", "sum"),
        FT_rate_num=("FT_rate_num", "sum"),
        FT_rate_den=("FT_rate_den", "sum"),
        FT_rate_def_num=("FT_rate_def_num", "sum"),
        FT_rate_def_den=("FT_rate_def_den", "sum"),
        OffEff_num=("OffEff_num", "sum"),
        OffEff_den=("OffEff_den", "sum"),
        DefEff_num=("DefEff_num", "sum"),
        DefEff_den=("DefEff_den", "sum"),
        Pace=("Pace", "mean"),
        AstRate_num=("AstRate_num", "sum"),
        AstRate_den=("AstRate_den", "sum"),
        BlkRate_num=("BlkRate_num", "sum"),
        BlkRate_den=("BlkRate_den", "sum"),
        StlRate_num=("StlRate_num", "sum"),
        StlRate_den=("StlRate_den", "sum"),
        ThreePRate_num=("ThreePRate_num", "sum"),
        ThreePRate_den=("ThreePRate_den", "sum"),
        ThreePARate_num=("ThreePARate_num", "sum"),
        ThreePARate_den=("ThreePARate_den", "sum"),
        opp_BlkRate_num=("opp_BlkRate_num", "sum"),
        opp_BlkRate_den=("opp_BlkRate_den", "sum"),
    )

    # Build ratios and differentials.
    sums["eFG_off"] = _safe_div(sums["eFG_off_num"].to_numpy(), sums["eFG_off_den"].to_numpy())
    sums["eFG_def"] = _safe_div(sums["eFG_def_num"].to_numpy(), sums["eFG_def_den"].to_numpy())
    sums["TO_rate_off"] = _safe_div(
        sums["TO_rate_off_num"].to_numpy(), sums["TO_rate_off_den"].to_numpy()
    )
    sums["TO_rate_def"] = _safe_div(
        sums["TO_rate_def_num"].to_numpy(), sums["TO_rate_def_den"].to_numpy()
    )
    sums["OR_rate"] = _safe_div(sums["OR_num"].to_numpy(), sums["OR_den"].to_numpy())
    sums["DR_rate"] = _safe_div(sums["DR_num"].to_numpy(), sums["DR_den"].to_numpy())
    sums["FT_rate"] = _safe_div(sums["FT_rate_num"].to_numpy(), sums["FT_rate_den"].to_numpy())
    sums["FT_rate_def"] = _safe_div(
        sums["FT_rate_def_num"].to_numpy(), sums["FT_rate_def_den"].to_numpy()
    )

    sums["OffEff"] = _safe_div(sums["OffEff_num"].to_numpy(), sums["OffEff_den"].to_numpy())
    sums["DefEff"] = _safe_div(sums["DefEff_num"].to_numpy(), sums["DefEff_den"].to_numpy())
    sums["NetEff"] = sums["OffEff"] - sums["DefEff"]

    sums["AstRate"] = _safe_div(sums["AstRate_num"].to_numpy(), sums["AstRate_den"].to_numpy())
    sums["BlkRate"] = _safe_div(sums["BlkRate_num"].to_numpy(), sums["BlkRate_den"].to_numpy())
    sums["StlRate"] = _safe_div(sums["StlRate_num"].to_numpy(), sums["StlRate_den"].to_numpy())
    sums["ThreePRate"] = _safe_div(
        sums["ThreePRate_num"].to_numpy(), sums["ThreePRate_den"].to_numpy()
    )
    sums["ThreePARate"] = _safe_div(
        sums["ThreePARate_num"].to_numpy(), sums["ThreePARate_den"].to_numpy()
    )

    sums["opp_BlkRate"] = _safe_div(
        sums["opp_BlkRate_num"].to_numpy(), sums["opp_BlkRate_den"].to_numpy()
    )
    sums["net_TO_diff"] = sums["TO_rate_def"] - sums["TO_rate_off"]
    sums["net_reb_margin"] = (sums["OR_rate"] + sums["DR_rate"]) / 2.0
    sums["net_blk"] = sums["BlkRate"] - sums["opp_BlkRate"]

    # Cleanup intermediate columns.
    keep_cols = [
        "Season",
        "TeamID",
        "eFG_off",
        "eFG_def",
        "TO_rate_off",
        "TO_rate_def",
        "OR_rate",
        "DR_rate",
        "FT_rate",
        "FT_rate_def",
        "OffEff",
        "DefEff",
        "NetEff",
        "Pace",
        "AstRate",
        "BlkRate",
        "StlRate",
        "ThreePRate",
        "ThreePARate",
        "net_TO_diff",
        "net_reb_margin",
        "net_blk",
    ]
    advanced = sums[keep_cols].copy()

    # Merge basic + advanced. Use left join to keep all basic teams.
    out = basic.merge(advanced, on=["Season", "TeamID"], how="left")
    return out


def normalize_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Z-score each numeric feature column within a season.

    The z-scores are used later in SVI computation.

    Notes
    -----
    - Identifier columns `TeamID` and `Season` are not normalized.
    - If a feature has 0 variance within a season, z-scores are set to 0.
    """

    if "Season" not in df.columns or "TeamID" not in df.columns:
        raise ValueError("df must include at least `Season` and `TeamID` columns.")

    feature_cols: List[str] = [c for c in df.columns if c not in {"TeamID", "Season"}]
    out = df.copy()

    means = out.groupby("Season")[feature_cols].transform("mean")

    # pandas' transform doesn't accept ddof=0 directly, so we compute it via a lambda.
    stds = out.groupby("Season")[feature_cols].transform(lambda x: x.std(ddof=0))

    z = (out[feature_cols] - means) / stds.replace(0, np.nan)
    out[feature_cols] = z.fillna(0.0)
    return out


if __name__ == "__main__":
    # Smoke test: rank teams by net efficiency for the selected season.
    season = CURRENT_SEASON

    detailed_path = DATA_DIR / "MRegularSeasonDetailedResults.csv"
    compact_path = DATA_DIR / "MRegularSeasonCompactResults.csv"

    if not detailed_path.exists():
        raise FileNotFoundError(
            f"Missing file: {detailed_path}. Put Kaggle CSVs into {DATA_DIR}/."
        )
    if not compact_path.exists():
        raise FileNotFoundError(
            f"Missing file: {compact_path}. Put Kaggle CSVs into {DATA_DIR}/."
        )

    detailed = pd.read_csv(detailed_path)
    compact = pd.read_csv(compact_path)

    feats = build_team_season_features(detailed, compact, season=season)
    top5 = feats.sort_values("NetEff", ascending=False).head(5)
    bot5 = feats.sort_values("NetEff", ascending=True).head(5)

    print(f"Top 5 NetEff teams ({season})")
    for _, r in top5.iterrows():
        print(f"{int(r['TeamID'])}\t{float(r['NetEff']):.4f}")

    print(f"\nBottom 5 NetEff teams ({season})")
    for _, r in bot5.iterrows():
        print(f"{int(r['TeamID'])}\t{float(r['NetEff']):.4f}")

