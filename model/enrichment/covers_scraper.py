"""
Live injury scraper for covers.com.

Playwright is used because covers.com renders the full injury tables via client-side hydration.
We then run a DOM-extraction script (confirmed working in-browser) to return:

  { "Alabama": [{"player": "...", "pos": "G", "status": "Questionable - Personal"}, ...], ... }

Results are cached with a TTL so repeated enrichment runs don't hammer covers.com.
"""

from __future__ import annotations

import json
import time
from difflib import get_close_matches
from pathlib import Path
from typing import Any, Optional

COVERS_URL = "https://www.covers.com/sport/basketball/ncaab/injuries"


# Exact JS confirmed working in browser (March 19, 2026).
EXTRACT_JS = """
() => {
    const results = {};
    const tables = document.querySelectorAll('table');
    tables.forEach((table) => {
        const rows = table.querySelectorAll('tr');
        if (rows.length < 2) return;
        let teamName = null;
        let node = table.parentElement;
        for (let i = 0; i < 10; i++) {
            if (!node) break;
            const nameEl = node.querySelector('.covers-CoversMatchups-teamName a');
            if (nameEl) {
                teamName = nameEl.childNodes[0]?.textContent?.trim();
                break;
            }
            let sib = node.previousElementSibling;
            for (let j = 0; j < 5; j++) {
                if (!sib) break;
                const el = sib.querySelector('.covers-CoversMatchups-teamName a');
                if (el) {
                    teamName = el.childNodes[0]?.textContent?.trim();
                    break;
                }
                sib = sib.previousElementSibling;
            }
            if (teamName) break;
            node = node.parentElement;
        }
        if (!teamName) return;
        const injuries = [];
        rows.forEach((row, ridx) => {
            if (ridx === 0) return;
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;
            const player = cells[0].textContent.replace(/\\s+/g, ' ').trim();
            const pos = cells[1].textContent.trim();
            const statusFull = cells[2].textContent.replace(/\\s+/g, ' ').trim();
            const statusClean = statusFull.split('(')[0].trim();
            if (player && player.length > 1 && statusClean &&
                !statusClean.includes('No injuries')) {
                injuries.push({ player, pos, status: statusClean });
            }
        });
        if (injuries.length > 0) results[teamName] = injuries;
    });
    return results;
}
"""


class CoversInjuryScraper:
    """
    Scrapes live injury data from covers.com using Playwright.

    Cache:
      <cache_dir>/covers_injuries_raw.json
    """

    def __init__(self, cache_dir: Path, ttl_hours: float = 4.0):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_path = cache_dir / "covers_injuries_raw.json"
        self.ttl_seconds = ttl_hours * 3600

    def _cache_is_fresh(self) -> bool:
        if not self.cache_path.exists():
            return False
        age = time.time() - self.cache_path.stat().st_mtime
        return age < self.ttl_seconds

    def fetch(self, force: bool = False) -> dict[str, list[dict[str, str]]]:
        """
        Fetch injury data. Returns cached data if fresh, else scrapes live.

        Args:
          force: If True, ignore cache and always scrape fresh.
        """
        if not force and self._cache_is_fresh():
            data = json.loads(self.cache_path.read_text())
            print(
                f"  [covers] Loaded from cache: {len(data)} teams "
                f"({(time.time() - self.cache_path.stat().st_mtime)/3600:.1f}h old)"
            )
            return data

        print(f"  [covers] Scraping live data from {COVERS_URL}...")
        data = self._scrape()

        # Fallback to stale cache if scrape fails hard.
        if not data and self.cache_path.exists():
            try:
                print("  [covers] WARN: Scrape returned empty — using stale cache fallback")
                return json.loads(self.cache_path.read_text())
            except Exception:
                pass

        data = data or {}
        self.cache_path.write_text(json.dumps(data, indent=2))
        print(f"  [covers] Extracted {len(data)} teams with injuries → cached")
        return data

    def _scrape(self) -> dict[str, list[dict[str, str]]]:
        """Run Playwright, wait for hydration, execute extraction JS."""
        try:
            from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
        except ImportError:
            raise ImportError(
                "Playwright not installed. Run:\n"
                "  pip install playwright\n"
                "  playwright install chromium"
            )

        data: dict[str, list[dict[str, str]]] = {}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            )
            try:
                # Wait for the React tables to hydrate.
                page.goto(COVERS_URL, wait_until="networkidle", timeout=30_000)
                page.wait_for_selector(".covers-CoversMatchups-teamName", timeout=15_000)

                # Small extra wait for all <table> blocks to finish.
                page.wait_for_timeout(2000)

                data = page.evaluate(EXTRACT_JS)
                if not isinstance(data, dict):
                    data = {}
            except PWTimeout:
                print("  [covers] WARN: Timeout — hydration selector not found")
            except Exception as e:
                print(f"  [covers] ERROR: {type(e).__name__}: {e}")
            finally:
                browser.close()

        return data

    def get_team_injuries(
        self,
        team_name: str,
        data: Optional[dict[str, list[dict[str, str]]]] = None,
    ) -> list[dict[str, str]]:
        """
        Get injuries for a specific team by name.

        Tries:
          1) exact match
          2) case-insensitive match
          3) fuzzy closest match
        """
        if data is None:
            data = self.fetch()

        # Exact match
        if team_name in data:
            return data[team_name]

        # Case-insensitive exact match
        team_lower = team_name.lower()
        for key, val in data.items():
            if key.lower() == team_lower:
                return val

        # Partial / fuzzy
        matches = get_close_matches(team_name, data.keys(), n=1, cutoff=0.6)
        if matches:
            return data[matches[0]]

        return []


# Kaggle name → Covers name mapping
COVERS_NAME_MAP = {
    "NC State": "N.C. State",
    "UConn": "Connecticut",
    "Saint Mary's": "Saint Mary's (CA)",
    "VCU": "Virginia Commonwealth",
    "UNLV": "Nevada-Las Vegas",
    "UAB": "Ala.-Birmingham",
    "UTEP": "Texas-El Paso",
    "UTSA": "Texas-San Antonio",
    "USC": "Southern California",
    "LSU": "Louisiana State",
    "TCU": "Texas Christian",
    "SMU": "Southern Methodist",
    "BYU": "Brigham Young",
    "Pitt": "Pittsburgh",
    "UNC": "North Carolina",
    "Ole Miss": "Mississippi",
    "Florida Intl": "Florida International",
    "CS Fullerton": "Cal State Fullerton",
    "CS Bakersfield": "Cal State Bakersfield",
    "UCSB": "UC Santa Barbara",
}


def normalize_team_name(kaggle_name: str) -> str:
    """Map Kaggle team name to covers.com team name (when they differ)."""
    return COVERS_NAME_MAP.get(kaggle_name, kaggle_name)


if __name__ == "__main__":
    # Quick smoke test: scrape and print teams with "Out" players.
    from dotenv import load_dotenv

    load_dotenv()
    scraper = CoversInjuryScraper(cache_dir=Path("data/cache"), ttl_hours=0)
    data = scraper.fetch(force=True)

    print(f"\n{'='*50}")
    print(f"Total teams with injuries: {len(data)}")

    print("\nTeams with OUT players:")
    for team, injuries in sorted(data.items()):
        outs = [i for i in injuries if "Out" in i.get("status", "") and "Redshirt" not in i.get("status", "")]
        if outs:
            print(f"\n  {team}:")
            for inj in outs[:3]:
                print(f"    🔴 {inj['player']} ({inj['pos']}): {inj['status']}")

    print(f"\n{'='*50}")

