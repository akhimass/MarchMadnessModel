import anthropic
import json
import re
import os
from pathlib import Path


class RecencyNewsFetcher:
    """
    Uses Claude with web search to get current team form/news.
    """

    def __init__(self, cache_path: Path):
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        api_key = api_key.strip().strip('"').strip("'").strip("‘").strip("’").strip("“").strip("”").strip("`")
        self.client = anthropic.Anthropic(api_key=api_key) if api_key else None
        self.cache_path = cache_path
        self._cache = self._load_cache()

    def _load_cache(self) -> dict:
        if self.cache_path.exists():
            return json.loads(self.cache_path.read_text())
        return {}

    def _save_cache(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self._cache, indent=2))

    def get_team_recency(self, team_id: int, team_name: str, seed: int, conference: str) -> dict:
        """
        Use Claude with web search to get current form.
        """
        key = str(team_id)
        if key in self._cache:
            return self._cache[key]

        if not self.client:
            return {"adjustment": 0.0, "trend": "unknown", "confidence": "low"}

        prompt = f"""Search for the latest news about {team_name} basketball team
entering the 2026 NCAA Tournament. Look for:
1. Their conference tournament result (won/runner-up/lost early?)
2. Any late-season injuries or lineup changes
3. Recent win/loss trend (last 5-10 games)
4. Overall momentum going into March Madness

Based on what you find, return ONLY valid JSON:
{{"conf_tourney": "champion|runner_up|semifinal|quarterfinal|first_round|unknown",
  "trend": "peaking|stable|declining|unknown",
  "adjustment": 0.02,
  "injury_update": "brief note or none",
  "confidence": "high|medium|low",
  "reasoning": "1-2 sentences based on what you found"}}

adjustment range: +0.05 (won conf, on fire) to -0.08 (losing streak, injuries).
Use 0.0 if findings are mixed or unclear."""

        try:
            msg = self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=300,
                tools=[{"type": "web_search_20250305", "name": "web_search"}],
                messages=[{"role": "user", "content": prompt}],
            )

            text = ""
            for block in msg.content:
                if hasattr(block, "text"):
                    text += block.text

            if not text.strip():
                raise ValueError("No text response from Claude")

            raw = re.sub(r"```(?:json)?", "", text).strip().strip("`")
            # Try to locate a JSON object in the response.
            json_match = re.search(r"\{.*\}", raw, re.DOTALL)
            if json_match:
                raw = json_match.group(0)

            result = json.loads(raw)
            result["adjustment"] = float(max(-0.10, min(0.06, result.get("adjustment", 0.0))))
            result["team_id"] = team_id
        except Exception as e:
            result = {
                "team_id": team_id,
                "adjustment": 0.0,
                "trend": "unknown",
                "conf_tourney": "unknown",
                "confidence": "low",
                "reasoning": f"Search error: {e}",
            }

        self._cache[key] = result
        self._save_cache()
        return result

