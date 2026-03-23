from __future__ import annotations

from pathlib import Path
from typing import Dict

import numpy as np
import pandas as pd

from model.features.team_stats import build_team_season_features, normalize_features
from model.config import DATA_DIR, CURRENT_SEASON


def compute_svi(team_features_df: pd.DataFrame, gender: str = "M") -> pd.DataFrame:
    """
    Compute the Stat Vulnerability Index (SVI).

    SVI identifies teams that are fundamentally unsound despite good records.
    Per the GLMM findings, turnovers, rebounds, and FT reliance drive upsets,
    controlling for overall team strength (Massey rating).

    Formula (men):
        SVI = (w_to * net_TO_z) + (w_reb * net_reb_z) + (w_ft * ft_penalty_z) + (w_3p * threep_z)

    where:
      - net_TO_z: z-scored net turnover differential (higher is better)
      - net_reb_z: z-scored net rebounding margin (higher is better)
      - ft_penalty_z: applied only when FT_rate_z > 0, otherwise 0
                    ft_penalty = -1 * FT_rate_z * w_ft
      - threep_z: small positive bump for 3P efficiency (z-scored)

    We use these approximate weights:
      - w_to = 0.45
      - w_reb = 0.30
      - w_ft = 0.20
      - w_3p = 0.05

    Women:
      - women's SVI uses only `net_blk_z` as the primary component.
    """

    if "Season" not in team_features_df.columns or "TeamID" not in team_features_df.columns:
        raise ValueError("team_features_df must include `Season` and `TeamID` columns.")

    gender = gender.upper().strip()
    if gender not in {"M", "W"}:
        raise ValueError("gender must be one of: 'M' or 'W'.")

    # Compute z-scores internally; return the original feature scale + `SVI`.
    zdf = normalize_features(team_features_df)
    df = team_features_df.copy()

    if gender == "M":
        required = {"net_TO_diff", "net_reb_margin", "FT_rate", "ThreePRate"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"team_features_df missing required columns for M SVI: {sorted(missing)}")

        w_to = 0.45
        w_reb = 0.30
        w_ft = 0.20
        w_3p = 0.05

        net_TO_z = zdf["net_TO_diff"].to_numpy(dtype=float)
        net_reb_z = zdf["net_reb_margin"].to_numpy(dtype=float)
        ft_rate_z = zdf["FT_rate"].to_numpy(dtype=float)
        threep_z = zdf["ThreePRate"].to_numpy(dtype=float)

        # FT reliance is bad only when FT_rate_z > 0; otherwise the penalty is 0.
        # `ft_penalty_z` is z-scored and already has the negative direction.
        ft_penalty_z = np.where(ft_rate_z > 0.0, -1.0 * ft_rate_z, 0.0)

        svi = w_to * net_TO_z + w_reb * net_reb_z + w_ft * ft_penalty_z + w_3p * threep_z
        df["SVI"] = svi
        return df

    # Women: only net_blk_z
    required = {"net_blk"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"team_features_df missing required columns for W SVI: {sorted(missing)}")

    df["SVI"] = zdf["net_blk"].to_numpy(dtype=float)
    return df


def classify_svi(svi_score: float) -> str:
    """
    Classify SVI risk category.
    """

    x = float(svi_score)
    if x > 0.3:
        return "True Contender"
    if 0.0 < x <= 0.3:
        return "Statistically Stable"
    if -0.15 < x <= 0.0:
        return "Elevated Risk"
    if -0.3 < x <= -0.15:
        return "Critical Risk"
    return "Paper Tiger"


def get_svi_report(
    team_id: int, season: int, team_features_df: pd.DataFrame
) -> Dict[str, float | str | int | bool]:
    """
    Build a full SVI breakdown report for one team+season.

    Returns a dict containing:
      - raw SVI score + classification
      - z-scores for the contributing components
      - each component's contribution
    """

    team_id = int(team_id)
    season = int(season)

    zdf = normalize_features(team_features_df)
    row = zdf.loc[(zdf["TeamID"] == team_id) & (zdf["Season"] == season)]
    if row.empty:
        raise ValueError(f"No team_features row found for TeamID={team_id}, Season={season}.")

    r = row.iloc[0]

    # Men weights (the report is Men-specific since the signature doesn't include gender).
    w_to = 0.45
    w_reb = 0.30
    w_ft = 0.20
    w_3p = 0.05

    net_TO_z = float(r["net_TO_diff"])
    net_reb_z = float(r["net_reb_margin"])
    ft_rate_z = float(r["FT_rate"])
    threep_z = float(r["ThreePRate"])

    to_contrib = w_to * net_TO_z
    reb_contrib = w_reb * net_reb_z
    threep_contrib = w_3p * threep_z

    ft_applied = ft_rate_z > 0.0
    ft_penalty_z = (-1.0 * ft_rate_z) if ft_applied else 0.0
    ft_penalty_contrib = w_ft * ft_penalty_z

    svi = to_contrib + reb_contrib + ft_penalty_contrib + threep_contrib
    category = classify_svi(svi)

    return {
        "TeamID": team_id,
        "Season": season,
        "SVI": float(svi),
        "category": category,
        "net_TO_z": net_TO_z,
        "net_reb_z": net_reb_z,
        "ft_rate_z": ft_rate_z,
        "threep_z": threep_z,
        "to_contrib": float(to_contrib),
        "reb_contrib": float(reb_contrib),
        "ft_penalty_contrib": float(ft_penalty_contrib),
        "ft_applied": bool(ft_applied),
        "threep_contrib": float(threep_contrib),
    }


if __name__ == "__main__":
    # Test block (smoke check): Duke/Iowa St/Kansas SVI.
    # The goal is to reproduce the article's relative findings.
    season = CURRENT_SEASON

    # Preferred location is DATA_DIR, but this repo may have CSVs in the
    # parent workspace folder depending on how data was downloaded.
    candidate_data_dirs = [DATA_DIR]
    # model/features/svi.py -> parents[2] = /.../MarchMadnessModel
    repo_root = Path(__file__).resolve().parents[2]
    candidate_data_dirs.append(repo_root)

    detailed_path = None
    compact_path = None
    for d in candidate_data_dirs:
        p_det = d / "MRegularSeasonDetailedResults.csv"
        p_comp = d / "MRegularSeasonCompactResults.csv"
        if p_det.exists() and p_comp.exists():
            detailed_path = p_det
            compact_path = p_comp
            break

    if detailed_path is None or compact_path is None:
        raise FileNotFoundError(
            f"Could not find MRegularSeasonDetailedResults.csv and MRegularSeasonCompactResults.csv in "
            f"{[str(p) for p in candidate_data_dirs]}."
        )

    detailed = pd.read_csv(detailed_path)
    compact = pd.read_csv(compact_path)

    team_feats = build_team_season_features(detailed, compact, season=season)
    svi_df = compute_svi(team_feats, gender="M")

    # IDs inferred from `MTeams.csv`:
    # Duke=1181, Iowa St=1235, Kansas=1242
    teams = [
        ("Duke", 1181, 0.305),
        ("Iowa St", 1235, 0.470),
        ("Kansas", 1242, -0.397),
    ]

    print(f"SVI (men) comparison for Season={season}")
    for name, tid, expected in teams:
        r = svi_df.loc[(svi_df["TeamID"] == tid) & (svi_df["Season"] == season)]
        if r.empty:
            print(f"- {name}: missing TeamID={tid}")
            continue
        svi = float(r.iloc[0]["SVI"])
        diff = svi - expected
        print(f"- {name} (TeamID={tid}): SVI={svi:+.3f}, expected={expected:+.3f}, diff={diff:+.3f}")

