"""
Post-hoc enrichment adjustment for Kaggle submission.

Takes a base submission CSV (from ML model) and applies injury/recency
adjustments on top. This is architecturally cleaner than training on enrichment
features because historical games have no injury data.

Usage:
  from model.enrichment.apply_enrichment import apply_enrichment
  adjusted_df = apply_enrichment(base_df, "data/cache/enrichment_2026.json", damping=0.5)
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd


def _load_enrichment(enrichment_path: str | Path) -> dict:
    p = Path(enrichment_path)
    if not p.exists():
        print(f"  WARNING: {p} not found. No enrichment applied.")
        return {"injuries": {}, "recency": {}}
    return json.loads(p.read_text())


def apply_enrichment(
    submission_df: pd.DataFrame,
    enrichment_path: str | Path = "data/cache/enrichment_2026.json",
    damping: float = 0.5,
    verbose: bool = True,
) -> pd.DataFrame:
    """
    Apply injury + recency adjustments to a base submission DataFrame.

    Args:
        submission_df: DataFrame with columns [ID, Pred]
        enrichment_path: path to enrichment_2026.json from run_all.py
        damping: scale factor on adjustments (0.5 = conservative, 1.0 = full trust)
        verbose: print summary stats

    Returns:
        DataFrame with adjusted Pred values, clipped to [0.025, 0.975]
    """
    data = _load_enrichment(enrichment_path)
    injuries = data.get("injuries", {})
    recency = data.get("recency", {})

    def get_adj(team_id_str: str) -> float:
        """Get total adjustment for a team (injury + recency)."""
        inj = injuries.get(team_id_str, {}).get("adjustment", 0.0)
        rec_data = recency.get(team_id_str, {})
        rec = rec_data.get("adjustment", 0.0) if isinstance(rec_data, dict) else 0.0
        return float(inj) + float(rec)

    def parse_ids(id_str: str) -> tuple[str, str]:
        """2026_1181_1234 → ('1181', '1234')"""
        parts = str(id_str).split("_")
        return parts[1], parts[2]

    df = submission_df.copy()
    adjustments: list[float] = []

    for _, row in df.iterrows():
        t1_str, t2_str = parse_ids(row["ID"])
        adj1 = get_adj(t1_str)  # team1 adjustment (positive = team1 is better)
        adj2 = get_adj(t2_str)  # team2 adjustment
        # Net: how much better is team1 relative to team2 due to current events
        net_adj = (adj1 - adj2) * damping
        adjustments.append(net_adj)

    df["base_pred"] = df["Pred"].copy()
    df["enrichment_adj"] = adjustments
    df["Pred"] = np.clip(df["Pred"] + df["enrichment_adj"], 0.025, 0.975)

    if verbose:
        n_changed = (df["enrichment_adj"].abs() > 0.001).sum()
        max_change = df["enrichment_adj"].abs().max()
        print(f"  Enrichment applied: {n_changed} matchups adjusted")
        print(f"  Max adjustment: {max_change:.4f} ({max_change*100:.1f} percentage points)")
        print(f"  Damping factor: {damping}")
        big_changes = df.nlargest(5, "enrichment_adj")[["ID", "base_pred", "Pred", "enrichment_adj"]]
        if len(big_changes) > 0:
            print("  Top 5 upward adjustments:")
            print(big_changes.to_string(index=False))

    # Drop helper columns before returning
    return df[["ID", "Pred"]]


def summarize_team_adjustments(
    enrichment_path: str | Path = "data/cache/enrichment_2026.json",
    data_dir: str | Path = "./data",
) -> pd.DataFrame:
    """
    Print a human-readable table of all team adjustments.
    Useful for sanity-checking before submitting.
    """
    data = _load_enrichment(enrichment_path)
    injuries = data.get("injuries", {})
    recency = data.get("recency", {})

    teams_df = pd.read_csv(Path(data_dir) / "MTeams.csv")
    seeds_df = pd.read_csv(Path(data_dir) / "MNCAATourneySeeds.csv")
    s26 = seeds_df[seeds_df["Season"] == 2026].merge(teams_df, on="TeamID")
    team_name_map = dict(zip(s26["TeamID"].astype(str), s26["TeamName"]))

    rows: list[dict[str, str]] = []
    all_ids = set(injuries.keys()) | set(recency.keys())
    for tid in sorted(all_ids):
        inj = injuries.get(tid, {})
        rec_data = recency.get(tid, {})
        rec = rec_data if isinstance(rec_data, dict) else {}
        inj_adj = float(inj.get("adjustment", 0))
        rec_adj = float(rec.get("adjustment", 0))
        total = inj_adj + rec_adj
        rows.append(
            {
                "Team": team_name_map.get(tid, f"ID {tid}"),
                "Injury Adj": f"{inj_adj:+.3f}",
                "Recency Adj": f"{rec_adj:+.3f}",
                "Total Adj": f"{total:+.3f}",
                "Injury Note": inj.get("key_player_out") or inj.get("severity", "none"),
                "Trend": rec.get("trend", "unknown"),
            }
        )

    if not rows:
        return pd.DataFrame(
            columns=["Team", "Injury Adj", "Recency Adj", "Total Adj", "Injury Note", "Trend"]
        )

    result_df = pd.DataFrame(rows).sort_values("Total Adj")
    return result_df

