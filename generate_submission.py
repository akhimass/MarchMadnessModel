from __future__ import annotations

import argparse
from pathlib import Path
from typing import List

import pandas as pd

from model.pipeline import MarchMadnessPipeline


def _run_one_gender(gender: str, data_dir: str | Path) -> pd.DataFrame:
    pipe = MarchMadnessPipeline(data_dir=data_dir, gender=gender)
    pipe.load_data()
    pipe.build_features()
    pipe.train()
    df = pipe.generate_submission()
    # Women submissions: Kaggle IDs for W teams are 3000-3999,
    # which correspond to IDs starting with `2026_3` in Stage2 templates.
    if gender.upper().strip() == "W":
        prefix = f"{pipe.season}_3"
        df = df[df["ID"].astype(str).str.startswith(prefix)].copy()
        # 100k simulations for women's bracket structure.
        # (Slots come from WNCAATourneySlots when gender='W'.)
        pipe.run_simulations(n=100_000)
    elif gender.upper().strip() == "M":
        # Men team IDs are 1000-1999, corresponding to IDs starting with `2026_1`.
        prefix = f"{pipe.season}_1"
        df = df[df["ID"].astype(str).str.startswith(prefix)].copy()

    df["Gender"] = gender
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate March Madness Kaggle submission.")
    parser.add_argument("--gender", type=str, default="M", help="M, W, or both")
    parser.add_argument("--output", type=str, default="submission.csv")
    parser.add_argument("--data-dir", type=str, default="./data", help="Directory containing CSVs")
    parser.add_argument(
        "--enrich",
        action="store_true",
        default=False,
        help="Apply injury/recency adjustments from data/cache/enrichment_2026.json. "
        "Run `python -m model.enrichment.run_all` first to generate the file.",
    )
    parser.add_argument(
        "--damping",
        type=float,
        default=0.5,
        help="Scale factor for enrichment adjustments (0.5=conservative, 1.0=full). Default: 0.5",
    )
    args = parser.parse_args()

    gender_arg = args.gender.upper().strip()
    out_path = Path(args.output)
    DATA_DIR = Path(args.data_dir)
    enrichment_path = DATA_DIR / "cache" / "enrichment_2026.json"

    if gender_arg == "BOTH":
        genders: List[str] = ["M", "W"]
    else:
        genders = [gender_arg]

    dfs: List[pd.DataFrame] = []
    for g in genders:
        df = _run_one_gender(g, args.data_dir)
        dfs.append(df)

    if not dfs:
        raise RuntimeError("No submissions were generated.")

    if len(dfs) == 1:
        # Kaggle format: ID,Pred (men only)
        submission_df = dfs[0].drop(columns=["Gender"], errors="ignore").copy()

        if args.enrich:
            if genders[0] == "W":
                print("\n[Enrichment] Skipping for gender=W (no women's enrichment source configured).")
            elif enrichment_path.exists():
                print(
                    f"\n[Enrichment] Applying injury + recency adjustments (damping={args.damping})..."
                )
                from model.enrichment.apply_enrichment import apply_enrichment, summarize_team_adjustments

                print("\n[Enrichment] Team adjustment summary:")
                summary = summarize_team_adjustments(enrichment_path, data_dir=DATA_DIR)
                # Only show teams with non-trivial adjustments
                significant = summary[
                    summary["Total Adj"].str.lstrip("+").astype(float).abs() >= 0.01
                ]
                if len(significant) > 0:
                    print(significant.to_string(index=False))
                else:
                    print("  No significant adjustments found (all < 0.01)")

                submission_df = apply_enrichment(
                    submission_df, enrichment_path, damping=args.damping
                )
                print("[Enrichment] Done. Submission updated.")
            else:
                print(
                    f"\n[Enrichment] WARNING: {enrichment_path} not found; skipping enrichment."
                )

        submission_df.to_csv(out_path, index=False)
        print(f"Wrote {out_path}")
        return

    # Combined output for both genders.
    out = pd.concat(dfs, ignore_index=True)

    if args.enrich:
        if enrichment_path.exists():
            print(
                f"\n[Enrichment] Applying injury + recency adjustments (damping={args.damping})..."
            )
            from model.enrichment.apply_enrichment import apply_enrichment, summarize_team_adjustments

            print("\n[Enrichment] Team adjustment summary:")
            summary = summarize_team_adjustments(enrichment_path, data_dir=DATA_DIR)
            significant = summary[
                summary["Total Adj"].str.lstrip("+").astype(float).abs() >= 0.01
            ]
            if len(significant) > 0:
                print(significant.to_string(index=False))
            else:
                print("  No significant adjustments found (all < 0.01)")

            # Apply enrichment to men's rows only; women's enrichment is not configured.
            mask_m = out["ID"].astype(str).str.startswith("2026_1")
            if mask_m.any():
                adjusted = apply_enrichment(
                    out.loc[mask_m, ["ID", "Pred"]].copy(),
                    enrichment_path,
                    damping=args.damping,
                    verbose=False,
                )
                out.loc[mask_m, "Pred"] = adjusted["Pred"].values.astype(float)
                print("[Enrichment] Done. Men's predictions updated. Women's left unchanged.")
            else:
                print("[Enrichment] No men's rows found in output; skipping enrichment.")
        else:
            print(
                f"\n[Enrichment] WARNING: {enrichment_path} not found; skipping enrichment."
            )

    # Kaggle-compatible output must be exactly ID,Pred.
    out_kaggle = out[["ID", "Pred"]].copy()
    out_kaggle.to_csv(out_path, index=False)
    print(f"Wrote combined Kaggle-format file to {out_path}")


if __name__ == "__main__":
    main()

