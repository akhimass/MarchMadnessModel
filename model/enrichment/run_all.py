"""
CLI: python -m model.enrichment.run_all

Live pipeline:
1. CoversInjuryScraper (Playwright) → real injury data for tournament teams
2. ClaudeInjuryScorer → impact scoring using the real injury list (NOT making up injuries)
3. RecencyNewsFetcher (Claude + web search) → recency for top seeds
4. Saves data/cache/enrichment_2026.json

Cache:
- injuries scrape is cached inside CoversInjuryScraper with TTL (default 4 hours)
- recency is cached inside RecencyNewsFetcher (recency_2026.json)

Force refresh:
  python -m model.enrichment.run_all --force
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
CACHE_DIR = Path("./data/cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def seed_num(s: str) -> int:
    m = re.search(r"\d+", str(s))
    return int(m.group()) if m else 8


def run(force: bool = False) -> None:
    import pandas as pd

    from model.enrichment.claude_injury_scorer import ClaudeInjuryScorer
    from model.enrichment.covers_scraper import CoversInjuryScraper, normalize_team_name
    from model.enrichment.recency_news import RecencyNewsFetcher

    # Load tournament teams (men-only pipeline in this project).
    seeds_df = pd.read_csv(DATA_DIR / "MNCAATourneySeeds.csv")
    teams_df = pd.read_csv(DATA_DIR / "MTeams.csv")
    conf_df = pd.read_csv(DATA_DIR / "MTeamConferences.csv")

    s26 = seeds_df[seeds_df["Season"] == 2026].merge(teams_df, on="TeamID")
    conf_map = conf_df[conf_df["Season"] == 2026].set_index("TeamID")["ConfAbbrev"].to_dict()

    tournament_teams: list[tuple[int, str, int, str]] = [
        (int(r["TeamID"]), r["TeamName"], seed_num(r["Seed"]), conf_map.get(int(r["TeamID"]), "Unknown"))
        for _, r in s26.iterrows()
    ]

    results: dict = {
        "injuries": {},
        "recency": {},
        "metadata": {
            "scraped_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "source": "covers.com",
            "teams_in_tournament": len(tournament_teams),
        },
    }

    # Step 1: Scrape covers.com.
    print("\n" + "=" * 55)
    print("  STEP 1: covers.com live injury scrape (Playwright)")
    print("=" * 55)

    scraper = CoversInjuryScraper(CACHE_DIR, ttl_hours=4.0)
    raw_data = scraper.fetch(force=force)

    if not raw_data:
        print("  ERROR: No data from covers.com scrape. Aborting.")
        return

    # Step 2: Claude scores injury impact.
    print("\n" + "=" * 55)
    print("  STEP 2: Claude injury impact scoring")
    print("=" * 55)

    scorer = ClaudeInjuryScorer()

    for team_id, team_name, seed, conference in tournament_teams:
        covers_name = normalize_team_name(team_name)
        raw_injuries = scraper.get_team_injuries(covers_name, raw_data)

        # Also try original name if normalized didn't match.
        if not raw_injuries and covers_name != team_name:
            raw_injuries = scraper.get_team_injuries(team_name, raw_data)

        impact = scorer.score_injuries(team_name, seed, raw_injuries)
        results["injuries"][str(team_id)] = {
            "raw_injuries": raw_injuries,
            "covers_name_used": covers_name,
            **impact,
        }

        if raw_injuries:
            icon = "🚨" if impact.get("severity") in ("high", "critical") else "⚠️"
            print(
                f"  {icon} {team_name} (#{seed}): "
                f"{len(raw_injuries)} injury record(s) | "
                f"adj={impact.get('adjustment', 0.0):+.3f} [{impact.get('severity','?')}]"
            )
            for inj in raw_injuries:
                if "Out" in inj.get("status", "") and "Redshirt" not in inj.get("status", ""):
                    print(f"       🔴 {inj.get('player')} ({inj.get('pos')}): {inj.get('status')}")

    # Step 3: Claude web search recency for top seeds only.
    print("\n" + "=" * 55)
    print("  STEP 3: Claude web search recency (top seeds)")
    print("=" * 55)

    fetcher = RecencyNewsFetcher(CACHE_DIR / "recency_2026.json")
    top_seeds = [t for t in tournament_teams if t[2] <= 8]  # seeds 1-8 only

    print(f"  Fetching recency for {len(top_seeds)} teams (seeds 1-8)")

    for team_id, team_name, seed, conference in top_seeds:
        key = str(team_id)
        if key in fetcher._cache and not force:
            continue

        print(f"  🔍 {team_name} (#{seed})...", end=" ", flush=True)
        result = fetcher.get_team_recency(team_id, team_name, seed, conference)
        adj = float(result.get("adjustment", 0.0))
        sym = "🔥" if adj > 0.02 else ("⚠️" if adj < -0.02 else "—")
        print(f"{sym} {adj:+.2f} [{result.get('trend','?')}] ({result.get('conf_tourney','?')})")
        time.sleep(1.2)

    # Default for low seeds.
    for team_id, team_name, seed, conf in tournament_teams:
        if str(team_id) not in fetcher._cache:
            fetcher._cache[str(team_id)] = {
                "adjustment": 0.0,
                "trend": "unknown",
                "conf_tourney": "unknown",
                "confidence": "low",
                "reasoning": f"Seed {seed} — recency not fetched (seeds 9+)",
            }

    results["recency"] = fetcher._cache
    fetcher._save_cache()

    # Save combined output.
    out = CACHE_DIR / "enrichment_2026.json"
    out.write_text(json.dumps(results, indent=2))

    # Summary.
    inj_high = sum(
        1
        for v in results["injuries"].values()
        if isinstance(v, dict) and v.get("severity") in ("high", "critical")
    )
    inj_any = sum(1 for v in results["injuries"].values() if isinstance(v, dict) and v.get("raw_injuries"))
    rec_pos = sum(
        1
        for v in results["recency"].values()
        if isinstance(v, dict) and float(v.get("adjustment", 0.0)) > 0.02
    )
    rec_neg = sum(
        1
        for v in results["recency"].values()
        if isinstance(v, dict) and float(v.get("adjustment", 0.0)) < -0.02
    )

    print(f"\n{'=' * 55}")
    print("  ENRICHMENT COMPLETE")
    print(f"{'=' * 55}")
    print(f"  Teams with any injury:          {inj_any}/{len(tournament_teams)}")
    print(f"  High/critical impact flags:   {inj_high}")
    print(f"  Positive recency (peaking):   {rec_pos}")
    print(f"  Negative recency (declining): {rec_neg}")
    print(f"  Output: {out}")
    print(f"\n  Next: python generate_submission.py --gender both --enrich")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build enrichment_2026.json from live injury + recency data.")
    parser.add_argument(
        "--force",
        action="store_true",
        default=False,
        help="Force fresh scrape of covers injuries and recency lookups (ignore caches).",
    )
    args = parser.parse_args()
    run(force=args.force)

