import json
import os
import re
import time
from pathlib import Path


GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


RESULTS = {"pass": 0, "warn": 0, "fail": 0}


def ok(msg: str) -> None:
    RESULTS["pass"] += 1
    print(f"{GREEN}  ✅ PASS  {msg}{RESET}")


def warn(msg: str) -> None:
    RESULTS["warn"] += 1
    print(f"{YELLOW}  ⚠️  WARN  {msg}{RESET}")


def fail(msg: str) -> None:
    RESULTS["fail"] += 1
    print(f"{RED}  ❌ FAIL  {msg}{RESET}")


def section(title: str) -> None:
    print(f"{BOLD}{CYAN}\n════════════════════════════════════════════\n{title}\n════════════════════════════════════════════{RESET}")


def _sanitize_api_key(raw: str) -> str:
    k = (raw or "").strip()
    if not k:
        return ""

    # Strip surrounding quotes (including common “smart quotes”).
    QUOTE_CHARS = {"'", '"', "‘", "’", "“", "”", "`"}
    if len(k) >= 2 and k[0] in QUOTE_CHARS and k[-1] in QUOTE_CHARS:
        k = k[1:-1].strip()

    # If any non-ascii remain, drop them (Claude client ultimately needs ascii-safe key).
    if any(ord(c) > 127 for c in k):
        k_ascii = "".join(c for c in k if ord(c) <= 127)
        return k_ascii
    return k


# Load .env if available (optional).
try:
    from dotenv import load_dotenv  # type: ignore

    env_path = Path(__file__).with_name(".env")
    if env_path.exists():
        # Avoid python-dotenv stack introspection edge cases by providing explicit path.
        load_dotenv(dotenv_path=env_path, override=False)
except Exception:
    # dotenv is optional; do not crash.
    pass


API_KEY = _sanitize_api_key(os.getenv("ANTHROPIC_API_KEY", ""))
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
CACHE_DIR = Path("./data/cache")


def _strip_json_fences(raw_text: str) -> str:
    raw = re.sub(r"```(?:json)?", "", raw_text).strip().strip("`")
    return raw


def _parse_json_or_fail(raw_text: str, context: str) -> tuple[bool, dict | None]:
    try:
        parsed = json.loads(_strip_json_fences(raw_text))
        if not isinstance(parsed, dict):
            fail(f"{context}: JSON was not an object.")
            return False, None
        return True, parsed
    except Exception as e:
        fail(f"{context}: Invalid JSON returned ({type(e).__name__}: {e})")
        return False, None


def _anthropic_client():
    import anthropic  # noqa: F401

    return anthropic.Anthropic(api_key=API_KEY)


def _call_claude(model: str, prompt: str, max_tokens: int) -> tuple[str, str]:
    """
    Returns (raw_text, model_name)
    """
    import anthropic

    client = anthropic.Anthropic(api_key=API_KEY)
    t0 = time.time()
    msg = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    latency = time.time() - t0
    text = msg.content[0].text.strip()
    return text, getattr(msg, "model", model)


def check_0_covers_live_scrape_verification() -> None:
    section("0 · COVERS.COM LIVE SCRAPE VERIFICATION")

    try:
        from model.enrichment.covers_scraper import CoversInjuryScraper

        scraper = CoversInjuryScraper(CACHE_DIR, ttl_hours=0)  # always fresh

        print("  Launching Playwright (headless Chromium)...")
        t0 = time.time()
        data = scraper.fetch(force=True)
        elapsed = time.time() - t0

        if len(data) >= 50:
            ok(f"Scraped {len(data)} teams in {elapsed:.1f}s")
        else:
            fail(f"Only {len(data)} teams returned (expected 80+)")

        # Show key tournament teams (spot-check for name mapping / DOM parsing issues).
        KEY_TEAMS = {
            "Duke": "C. Foster (Foot)",
            "North Carolina": "C. Wilson (Thumb)",
            "Michigan": "L. Cason (Knee)",
            "Alabama": "A. Holloway (Personal)",
            "BYU": "R. Saunders (Knee)",
            "Texas Tech": "J. Toppin (ACL)",
            "Gonzaga": "B. Huff (Knee)",
            "UCLA": "C. Bilodeau (Knee)",
        }

        print("\n  Key tournament teams — injury verification:")
        all_found = True
        for team, expected in KEY_TEAMS.items():
            injuries = data.get(team, []) or []
            has_injuries = len(injuries) > 0
            icon = "✅" if has_injuries else "❌"
            print(
                f"  {icon} {team}: {len(injuries)} injuries | "
                f"expected: {expected} | {'Found' if has_injuries else 'NOT FOUND'}"
            )

            if has_injuries:
                for inj in injuries[:2]:
                    print(f"       {inj.get('player')} ({inj.get('pos')}): {inj.get('status')}")

            if not has_injuries:
                all_found = False

        if all_found:
            ok("All key tournament teams found in covers.com data")
        else:
            warn("Some teams not found — check COVERS_NAME_MAP in covers_scraper.py")

    except ImportError as e:
        fail(f"Import error: {type(e).__name__}: {e}")
        fail("Run: pip install playwright && playwright install chromium")
    except Exception as e:
        fail(f"Scrape failed: {type(e).__name__}: {e}")


def check_1_api_key_format() -> None:
    section("1 · API KEY")
    if API_KEY == "":
        fail("ANTHROPIC_API_KEY not set — add it to .env")
        return

    if not API_KEY.startswith("sk-ant-"):
        warn("Key present but unexpected format (expected prefix sk-ant-)")

    if len(API_KEY) < 80:
        warn("Key looks short, may be truncated")

    # Show first 12 chars + last 4 chars
    if len(API_KEY) >= 16:
        shown = f"{API_KEY[:12]}...{API_KEY[-4:]}"
    else:
        shown = f"{API_KEY[:12]}..."
    ok(f"Key present: {shown}")


def check_2_claude_reachability() -> None:
    section("2 · CLAUDE API REACHABILITY")
    try:
        import anthropic  # noqa: F401
    except ImportError as e:
        fail(f"pip install anthropic ({type(e).__name__}: {e})")
        return

    if not API_KEY:
        warn("ANTHROPIC_API_KEY missing — skipping live API ping")
        return

    import anthropic

    try:
        client = anthropic.Anthropic(api_key=API_KEY)
        t0 = time.time()
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=10,
            messages=[{"role": "user", "content": "Reply with only the word: ALIVE"}],
        )
        latency = time.time() - t0
        text = msg.content[0].text.strip()
        ok(f"API call succeeded in {latency:.2f}s — response: '{text}'")
        if "claude-sonnet" in getattr(msg, "model", ""):
            ok(f"Model confirmed: {msg.model}")
        else:
            warn(f"Unexpected model: {getattr(msg, 'model', '?')}")
    except anthropic.AuthenticationError:
        fail("Invalid API key — check .env")
    except anthropic.RateLimitError as e:
        warn(f"Rate limited — wait and retry ({e})")
    except Exception as e:
        fail(f"{type(e).__name__}: {e}")


def check_3_injury_parser_json_quality() -> None:
    section("3 · INJURY PARSER — JSON QUALITY")
    if not API_KEY:
        warn("ANTHROPIC_API_KEY missing — skipping injury parser tests")
        return

    try:
        import anthropic  # noqa: F401
    except ImportError as e:
        fail(f"pip install anthropic ({type(e).__name__}: {e})")
        return

    import anthropic

    client = anthropic.Anthropic(api_key=API_KEY)

    tests = [
        ("A", "Duke", 1, "- Cooper Flagg (SF): Out — ankle sprain", (-0.15, -0.05), ["high", "critical"]),
        ("B", "Iowa State", 2, "(none reported)", (-0.02, 0.01), ["none", "low"]),
        ("C", "Kansas", 4, "- Hunter Dickinson (C): Questionable — knee", (-0.10, 0.0), ["low", "medium", "high"]),
    ]

    for label, team, seed, injuries, (lo, hi), allowed_sev in tests:
        prompt = f"""NCAA March Madness 2026 injury impact analysis.
Team: {team} (#{seed} seed)
Injury report: {injuries}

Return ONLY valid JSON:
{{"adjustment": -0.07, "severity": "high", "key_player_out": "Name or null", "reasoning": "One sentence.", "confidence": "high|medium|low"}}

adjustment range: star out=-0.10 to -0.15 | key starter=-0.05 to -0.10 | questionable=half | none=0.0
"""
        try:
            msg = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            raw_text = msg.content[0].text.strip()
        except Exception as e:
            fail(f"[{label}] {team} — Claude call failed ({type(e).__name__}: {e})")
            continue

        print(f"    [\u200b{label}] {team} — star OUT")
        print(f"        Raw response: '{raw_text}'")

        ok_json, parsed = _parse_json_or_fail(raw_text, f"[{label}] {team}")
        if not ok_json or parsed is None:
            # _parse_json_or_fail already printed fail
            continue

        print(f"        Parsed JSON: {parsed}")

        # Validation
        adj = parsed.get("adjustment", None)
        if adj is None:
            fail(f"[{label}] {team}: 'adjustment' key missing")
            continue

        try:
            adj_f = float(adj)
        except Exception:
            fail(f"[{label}] {team}: 'adjustment' is not a float")
            continue

        sev = parsed.get("severity", None)
        if sev is None:
            fail(f"[{label}] {team}: 'severity' key missing")
            continue

        reasoning = parsed.get("reasoning", "")
        reasoning_empty = (reasoning is None) or (isinstance(reasoning, str) and reasoning.strip() == "")

        in_range = (adj_f >= lo) and (adj_f <= hi)
        sev_ok = sev in allowed_sev

        if not in_range:
            fail(f"[{label}] {team}: adjustment out of expected range ({adj_f:.3f} not in [{lo}, {hi}])")
            continue
        if not sev_ok:
            fail(f"[{label}] {team}: severity '{sev}' not in expected set {allowed_sev}")
            continue

        if reasoning_empty:
            warn(f"[{label}] {team}: PASS other checks but 'reasoning' missing/empty")
        else:
            ok(f"[{label}] {team}: adjustment={adj_f:.3f} severity={sev}")


def check_4_recency_gap_json_quality() -> None:
    section("4 · RECENCY GAP FILLER — JSON QUALITY")
    if not API_KEY:
        warn("ANTHROPIC_API_KEY missing — skipping recency filler tests")
        return

    try:
        import anthropic  # noqa: F401
    except ImportError as e:
        fail(f"pip install anthropic ({type(e).__name__}: {e})")
        return

    import anthropic

    client = anthropic.Anthropic(api_key=API_KEY)

    tests = [
        ("A", "Florida", 1, "SEC", "24-5", (0.0, 0.06), ["peaking", "stable"]),
        ("B", "Kansas", 4, "Big 12", "19-11", (-0.10, 0.01), ["declining", "stable", "unknown"]),
    ]

    for label, team, seed, conf, record, (lo, hi), allowed_trend in tests:
        prompt = f"""NCAA 2025-26 season — {team} (#{seed} seed, {conf})
Record as of Feb 4, 2026: {record}

Based on your knowledge through March 2026:
Return ONLY valid JSON:
{{"post_cutoff_record": "W-L or unknown", "conf_tourney": "champion|runner_up|semifinal|quarterfinal|first_round|unknown", "trend": "peaking|stable|declining|unknown", "adjustment": 0.02, "confidence": "high|medium|low", "reasoning": "One or two sentences."}}

adjustment: -0.10 (injuries/losing streak) to +0.06 (won conf, hot). Use 0.0 if uncertain.
"""
        try:
            msg = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=250,
                messages=[{"role": "user", "content": prompt}],
            )
            raw_text = msg.content[0].text.strip()
        except Exception as e:
            fail(f"[{label}] {team} — Claude call failed ({type(e).__name__}: {e})")
            continue

        print(f"    [\u200b{label}] {team}")
        print(f"        Raw response: '{raw_text}'")

        ok_json, parsed = _parse_json_or_fail(raw_text, f"[{label}] {team}")
        if not ok_json or parsed is None:
            continue

        print(f"        Parsed JSON: {parsed}")

        adj = parsed.get("adjustment", None)
        if adj is None:
            fail(f"[{label}] {team}: 'adjustment' key missing")
            continue

        try:
            adj_f = float(adj)
        except Exception:
            fail(f"[{label}] {team}: 'adjustment' is not a float")
            continue

        trend = parsed.get("trend", None)
        if trend is None:
            fail(f"[{label}] {team}: 'trend' key missing")
            continue

        reasoning = parsed.get("reasoning", "")
        reasoning_empty = (reasoning is None) or (isinstance(reasoning, str) and reasoning.strip() == "")

        in_range = (adj_f >= lo) and (adj_f <= hi)
        trend_ok = trend in allowed_trend

        if not in_range:
            fail(f"[{label}] {team}: adjustment out of expected range ({adj_f:.3f} not in [{lo}, {hi}])")
            continue
        if not trend_ok:
            # Trend labels are inherently uncertain. Treat mismatches as warnings,
            # but keep adjustment-range validation strict.
            warn(
                f"[{label}] {team}: trend '{trend}' not in expected set {allowed_trend}"
            )

        if reasoning_empty:
            warn(f"[{label}] {team}: PASS other checks but 'reasoning' missing/empty")
        else:
            ok(f"[{label}] {team}: adjustment={adj_f:.3f} trend={trend}")


def check_5_espn_api_reachability() -> None:
    section("5 · ESPN API REACHABILITY")
    try:
        import httpx  # noqa: F401
    except ImportError as e:
        fail(f"pip install httpx ({type(e).__name__}: {e})")
        return

    import httpx

    try:
        r = httpx.get(
            "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams",
            params={"limit": 5},
            timeout=10,
        )
        teams = r.json()["sports"][0]["leagues"][0]["teams"]
    except Exception as e:
        fail(f"ESPN teams endpoint failed ({type(e).__name__}: {e})")
        return

    if getattr(r, "status_code", None) != 200:
        fail(f"ESPN teams endpoint returned status {getattr(r, 'status_code', '?')}")
        return

    ok(f"ESPN API reachable — {len(teams)} teams in sample")
    try:
        if teams and teams[0]["team"].get("displayName"):
            ok("Response contains team names")
        else:
            warn("Response missing team displayName field (endpoint shape changed?)")
    except Exception:
        warn("Could not verify team names in ESPN response (shape changed?)")

    # Duke injuries endpoint check.
    try:
        r2 = httpx.get(
            "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/57/injuries",
            timeout=10,
        )
        injuries = r2.json().get("injuries", [])
    except Exception as e:
        fail(f"Duke injuries endpoint failed ({type(e).__name__}: {e})")
        return

    if getattr(r2, "status_code", None) != 200:
        warn(f"Duke injuries endpoint returned status {getattr(r2, 'status_code', '?')}")

    if len(injuries) > 0:
        ok(f"Duke injury endpoint reachable — {len(injuries)} injuries found")
    else:
        warn("0 injuries returned (may be none, or endpoint changed)")

    for inj in injuries[:10]:
        player = inj.get("athlete", {}).get("displayName", "Unknown")
        pos = inj.get("athlete", {}).get("position", {}).get("abbreviation", "?")
        status = inj.get("status", "Unknown")
        print(f"    {player} ({pos}): {status}")


def check_6_cache_file_integrity() -> None:
    section("6 · CACHE FILE INTEGRITY")
    enrichment_path = CACHE_DIR / "enrichment_2026.json"
    if not enrichment_path.exists():
        warn("File not found — run: python -m model.enrichment.run_all")
        return

    try:
        data = json.loads(enrichment_path.read_text())
    except Exception as e:
        fail(f"Cache file JSON parse failed: {type(e).__name__}: {e}")
        return

    injuries = data.get("injuries", {})
    recency = data.get("recency", {})
    if not isinstance(injuries, dict) or not isinstance(recency, dict):
        fail("Cache file shape unexpected: expected injuries/recency dicts.")
        return

    ok(f"File found — {len(injuries)} injury records, {len(recency)} recency records")

    # Injuries structure sample.
    for idx, (tid, val) in enumerate(list(injuries.items())[:3]):
        if not isinstance(val, dict):
            fail(f"Injuries sample {idx}: TeamID {tid} value is not a dict")
            continue

        if "adjustment" not in val:
            fail(f"Injuries sample: TeamID {tid} missing 'adjustment'")
        else:
            try:
                adj_f = float(val["adjustment"])
                if adj_f < -0.15 or adj_f > 0.15:
                    fail(f"Injuries sample: TeamID {tid} adjustment out of [-0.15,0.15] ({adj_f:.3f})")
            except Exception:
                fail(f"Injuries sample: TeamID {tid} adjustment not float")

        if "severity" not in val:
            fail(f"Injuries sample: TeamID {tid} missing 'severity'")

        if "reasoning" not in val:
            warn(f"Injuries sample: TeamID {tid} missing 'reasoning'")

        # Print sample line
        adj_val = val.get("adjustment", "?")
        sev_val = val.get("severity", "?")
        try:
            adj_str = float(adj_val)
            adj_fmt = f"{adj_str:.3f}"
        except Exception:
            adj_fmt = str(adj_val)

        reasoning_val = str(val.get("reasoning", ""))
        print(f"    TeamID {tid}: adj={adj_fmt}  sev={sev_val}  '{reasoning_val[:60]}'")

    # Recency structure sample.
    for idx, (tid, val) in enumerate(list(recency.items())[:3]):
        if not isinstance(val, dict):
            continue
        if "adjustment" not in val:
            fail(f"Recency sample: TeamID {tid} missing 'adjustment'")
        else:
            try:
                adj_f = float(val["adjustment"])
                if adj_f < -0.15 or adj_f > 0.15:
                    fail(f"Recency sample: TeamID {tid} adjustment out of [-0.15,0.15] ({adj_f:.3f})")
            except Exception:
                fail(f"Recency sample: TeamID {tid} adjustment not float")

        adj_val = val.get("adjustment", "?")
        try:
            adj_fmt = f"{float(adj_val):.3f}"
        except Exception:
            adj_fmt = str(adj_val)

        trend_val = val.get("trend", "?")
        print(f"    TeamID {tid}: adj={adj_fmt}  trend={trend_val}")

    # Significant flags summary.
    injury_flags = sum(1 for v in injuries.values() if isinstance(v, dict) and abs(float(v.get("adjustment", 0.0))) >= 0.03)
    recency_flags = sum(
        1
        for v in recency.values()
        if isinstance(v, dict) and abs(float(v.get("adjustment", 0.0))) >= 0.03
    )
    print(f"    Significant flags: {injury_flags} injury, {recency_flags} recency")


def check_7_apply_enrichment_sanity() -> None:
    section("7 · POST-HOC ADJUSTMENT — SANITY CHECK")
    enrichment_path = CACHE_DIR / "enrichment_2026.json"
    if not enrichment_path.exists():
        warn("Skipping — enrichment_2026.json not found yet")
        return

    try:
        import pandas as pd  # noqa: F401
    except Exception as e:
        fail(f"pandas import failed: {type(e).__name__}: {e}")
        return

    import pandas as pd

    synthetic_sub = pd.DataFrame(
        {
            "ID": [
                "2026_1181_1234",
                "2026_1112_1345",
                "2026_1196_1277",
            ],
            "Pred": [0.50, 0.70, 0.30],
        }
    )

    try:
        from model.enrichment.apply_enrichment import apply_enrichment  # type: ignore
    except Exception as e:
        fail(f"ImportError importing apply_enrichment: {e}")
        return

    try:
        result = apply_enrichment(
            synthetic_sub,
            enrichment_path,
            damping=0.5,
            verbose=False,
        )
    except Exception as e:
        fail(f"apply_enrichment raised: {type(e).__name__}: {e}")
        return

    required_cols = ["ID", "Pred"]
    if not all(c in result.columns for c in required_cols):
        fail(f"apply_enrichment result missing required columns {required_cols}")
        return

    preds = result["Pred"].astype(float).to_numpy()
    if (preds < 0.025).any() or (preds > 0.975).any():
        fail("Clipping failed: some Pred values are outside [0.025, 0.975]")
        return

    ok("apply_enrichment runs and clips correctly")

    # Print comparison table
    merged = synthetic_sub.merge(result, on="ID", suffixes=("_base", "_adj"))
    merged["Delta"] = merged["Pred_adj"] - merged["Pred_base"]
    for _, row in merged.iterrows():
        print(f"    {row['ID']:<18} | {row['Pred_base']:.3f} | {row['Pred_adj']:.3f} | {row['Delta']:+.3f}")

    deltas = merged["Delta"].to_numpy(dtype=float)
    if (deltas == 0.0).all():
        warn("No adjustments applied — check team ID mapping")
    else:
        ok("Non-zero adjustments applied")


def check_8_end_to_end_sample_3_teams() -> None:
    section("8 · END-TO-END SAMPLE — 3 TOURNAMENT TEAMS")
    enrichment_path = CACHE_DIR / "enrichment_2026.json"
    if not API_KEY:
        warn("ANTHROPIC_API_KEY missing — skipping Check 8")
        return
    if not enrichment_path.exists():
        warn("enrichment_2026.json missing — skipping Check 8")
        return

    try:
        import pandas as pd
    except Exception as e:
        fail(f"pandas import failed: {type(e).__name__}: {e}")
        return

    try:
        data = json.loads(enrichment_path.read_text())
    except Exception as e:
        fail(f"Could not parse enrichment JSON: {type(e).__name__}: {e}")
        return

    injuries_cache = data.get("injuries", {})
    recency_cache = data.get("recency", {})
    if not isinstance(injuries_cache, dict) or not isinstance(recency_cache, dict):
        fail("enrichment_2026.json shape unexpected (injuries/recency not dicts)")
        return

    # Load seeds + teams to get names/conferences.
    seeds_df = pd.read_csv(DATA_DIR / "MNCAATourneySeeds.csv")
    teams_df = pd.read_csv(DATA_DIR / "MTeams.csv")
    s26 = seeds_df[seeds_df["Season"] == 2026].merge(teams_df, on="TeamID")

    desired = [("Duke", 1181), ("Kansas", 1276), ("Iowa St", 1243)]
    selected = []
    for name, tid in desired:
        match = s26[s26["TeamID"] == tid]
        if len(match) > 0:
            row = match.iloc[0]
            selected.append((int(row["TeamID"]), str(row["TeamName"]), str(row.get("Seed", ""))))
    if len(selected) < 3:
        # fallback to first teams
        for _, r in s26.head(3).iterrows():
            tid = int(r["TeamID"])
            if tid not in [x[0] for x in selected]:
                selected.append((tid, str(r["TeamName"]), str(r.get("Seed", ""))))
            if len(selected) >= 3:
                break

    # Build ESPN team name -> id mapping once for fuzzy lookup.
    try:
        import httpx
        from difflib import get_close_matches

        ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball"
        r = httpx.get(f"{ESPN_BASE}/teams", params={"limit": 500}, timeout=15)
        r.raise_for_status()
        teams = r.json()["sports"][0]["leagues"][0]["teams"]
        display_map = {}
        for t in teams:
            team = t["team"]
            nm = team.get("displayName", "") or ""
            if nm:
                # basic normalization
                norm = re.sub(r"[^a-z0-9 ]", "", nm.lower().strip())
                display_map[norm] = str(team["id"])
        espn_keys = list(display_map.keys())
    except Exception as e:
        fail(f"Could not build ESPN name map for Check 8 ({type(e).__name__}: {e})")
        return

    import anthropic

    client = anthropic.Anthropic(api_key=API_KEY)

    def find_espn_id(team_name: str) -> str | None:
        norm = re.sub(r"[^a-z0-9 ]", "", team_name.lower().strip())
        if norm in display_map:
            return display_map[norm]
        matches = get_close_matches(norm, espn_keys, n=1, cutoff=0.75)
        return display_map[matches[0]] if matches else None

    for team_id, team_name, seed_str in selected[:3]:
        espn_id = find_espn_id(team_name)
        injuries_cache_entry = injuries_cache.get(str(team_id), {})
        recency_cache_entry = recency_cache.get(str(team_id), {})

        # Seed parse for display
        m = re.search(r"\d+", seed_str)
        seed_num = int(m.group()) if m else 8

        # Fetch ESPN injuries
        espn_injuries = []
        if espn_id:
            try:
                r2 = httpx.get(
                    f"https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{espn_id}/injuries",
                    timeout=10,
                )
                espn_injuries = r2.json().get("injuries", [])
            except Exception:
                espn_injuries = []

        if not espn_injuries:
            injuries_text = "(none reported)"
        else:
            lines = []
            for inj in espn_injuries:
                player = inj.get("athlete", {}).get("displayName", "Unknown")
                pos = inj.get("athlete", {}).get("position", {}).get("abbreviation", "?")
                status = inj.get("status", "Unknown")
                detail = inj.get("details", {}).get("detail", "")
                extra = f" — {detail}" if detail else ""
                lines.append(f"- {player} ({pos}): {status}{extra}")
            injuries_text = "\n".join(lines[:10])

        # Re-run injury parse using the exact Check 3 prompt (but with live ESPN text).
        prompt = f"""NCAA March Madness 2026 injury impact analysis.
Team: {team_name} (#{seed_num} seed)
Injury report: {injuries_text}

Return ONLY valid JSON:
{{"adjustment": -0.07, "severity": "high", "key_player_out": "Name or null", "reasoning": "One sentence.", "confidence": "high|medium|low"}}

adjustment range: star out=-0.10 to -0.15 | key starter=-0.05 to -0.10 | questionable=half | none=0.0
"""
        try:
            msg = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=220,
                messages=[{"role": "user", "content": prompt}],
            )
            raw_text = msg.content[0].text.strip()
            parsed_ok, parsed = _parse_json_or_fail(raw_text, f"[Check 8] {team_name} injury parse")
        except Exception as e:
            fail(f"[Check 8] {team_name}: Claude call failed ({type(e).__name__}: {e})")
            continue

        if not parsed_ok or parsed is None:
            continue

        injury_adj = float(parsed.get("adjustment", 0.0))
        injury_sev = parsed.get("severity", "?")
        injury_reasoning = str(parsed.get("reasoning", "") or "")
        key_player_out = parsed.get("key_player_out", None)

        rec_adj = 0.0
        rec_trend = "?"
        if isinstance(recency_cache_entry, dict):
            try:
                rec_adj = float(recency_cache_entry.get("adjustment", 0.0))
            except Exception:
                rec_adj = 0.0
            rec_trend = recency_cache_entry.get("trend", "?")

        total_adj = injury_adj + rec_adj
        damping = 0.5
        # Example matchup: assume opponent has 0 total adjustment
        base_prob = 0.97
        adjusted_prob = max(0.025, min(0.975, base_prob + (total_adj * damping)))

        # Conference display (if present in cached enrichment it is not included; we only have seed mapping here)
        conference = "Unknown"
        # Print summary block
        print("    ┌─────────────────────────────────────────────┐")
        print(f"    │ TEAM: {team_name} (Seed #{seed_num}, {conference}) │")
        print("    │ Injury adjustment:  {0:+.3f}  [{1}]".format(injury_adj, injury_sev))
        if key_player_out:
            print(f"    │   → {key_player_out}")
        else:
            print(f"    │   → {injury_reasoning[:48] + ('...' if len(injury_reasoning) > 48 else '')}")
        print(f"    │ Recency adjustment: {rec_adj:+.3f}  [{rec_trend.upper() if isinstance(rec_trend,str) else '?'}]")
        print(f"    │   → trend: {rec_trend}")
        print(f"    │ TOTAL adjustment: {total_adj:+.3f} (after 0.5 damp)  │")
        print(f"    │ Example matchup: {base_prob:.3f} → {adjusted_prob:.3f}             │")
        print("    └─────────────────────────────────────────────┘")


def main() -> None:
    check_0_covers_live_scrape_verification()
    check_1_api_key_format()
    check_2_claude_reachability()
    check_3_injury_parser_json_quality()
    check_4_recency_gap_json_quality()
    check_5_espn_api_reachability()
    check_6_cache_file_integrity()
    check_7_apply_enrichment_sanity()
    check_8_end_to_end_sample_3_teams()

    print(f"\n{BOLD}{CYAN}═════════════════════════════════════════════{RESET}")
    print(f"{BOLD}{CYAN}  AUDIT COMPLETE{RESET}")
    print(f"{GREEN if RESULTS['pass'] else CYAN}  ✅ {RESULTS['pass']}  passed{RESET}")
    print(f"{YELLOW}  ⚠️  {RESULTS['warn']}  warnings{RESET}")
    print(f"{RED}  ❌ {RESULTS['fail']}  failed{RESET}")
    print(f"{BOLD}{CYAN}═════════════════════════════════════════════{RESET}")

    if RESULTS["fail"] > 0:
        print("\nFix failures before running generate_submission.py --enrich")
        print("Most common fixes:")
        print("  No API key:     add ANTHROPIC_API_KEY=sk-ant-... to .env")
        print("  No cache file:  python -m model.enrichment.run_all")
        print("  Bad JSON:       check model string is 'claude-sonnet-4-6'")
        print("  ESPN down:      retry in 5 min (rate limit)")
    elif RESULTS["fail"] == 0:
        print("\n✅ No failures. Warnings are non-blocking.")
        print("   python generate_submission.py --gender both --enrich  (and run it)")


if __name__ == "__main__":
    main()

