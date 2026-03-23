import anthropic
import json
import re
import os


class ClaudeInjuryScorer:
    """
    Uses Claude to convert raw injury data into win probability adjustments.
    This is the RIGHT use of Claude: structured reasoning over real data.
    """

    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        api_key = api_key.strip().strip('"').strip("'").strip("‘").strip("’").strip("“").strip("”").strip("`")
        self.client = anthropic.Anthropic(api_key=api_key) if api_key else None
        self._cache: dict = {}

    def score_injuries(
        self,
        team_name: str,
        seed: int,
        injuries: list[dict],
        team_net_eff: float = 0.0,
    ) -> dict:
        """
        Score the win probability impact of a team's injury list.
        Input: real ESPN injury data
        Output: {adjustment, severity, key_player_out, reasoning}
        """
        if not injuries:
            return {
                "adjustment": 0.0,
                "severity": "none",
                "key_player_out": None,
                "reasoning": "No injuries reported.",
                "confidence": "high",
            }

        # Policy: no impact unless a player is effectively ruled out.
        # Questionable-only reports should not move probabilities.
        def _is_ruled_out(status: str) -> bool:
            s = (status or "").lower()
            return (
                "out" in s
                or "will not take the court" in s
                or "miss the remainder" in s
                or "season-ending" in s
                or "season ending" in s
            )

        ruled_out_injuries = [
            inj for inj in injuries if _is_ruled_out(str(inj.get("status", "")))
        ]

        if not ruled_out_injuries:
            return {
                "adjustment": 0.0,
                "severity": "none",
                "key_player_out": None,
                "reasoning": "No ruled-out players (questionable-only/no-impact).",
                "confidence": "high",
            }

        # Cache key based on team + injury count + top player names.
        cache_key = (
            f"{team_name}_{len(ruled_out_injuries)}_"
            f"{','.join(i.get('player', 'Unknown') for i in ruled_out_injuries[:3])}"
        )
        if cache_key in self._cache:
            return self._cache[cache_key]

        if not self.client:
            return {
                "adjustment": 0.0,
                "severity": "unknown",
                "key_player_out": None,
                "reasoning": "No API key.",
                "confidence": "low",
            }

        injury_lines = "\n".join(
            [
                f"  - {inj.get('player', 'Unknown')} ({inj.get('position') or inj.get('pos', '?')}): {inj.get('status', 'Unknown')}"
                + (
                    f" — {inj.get('detail')}"
                    if inj.get("detail")
                    else (f" — {inj.get('date')}" if inj.get("date") else "")
                )
                for inj in ruled_out_injuries
            ]
        )

        prompt = f"""You are scoring the win probability impact of injuries for March Madness 2026.

Team: {team_name} (#{seed} seed)
Season net efficiency: {team_net_eff:+.1f} pts/100 possessions

Current injury report (from ESPN):
{injury_lines}

Task: Estimate the combined win probability adjustment from these injuries.

Guidelines:
- Star starter (15+ PPG, key to system) OUT: -0.10 to -0.15
- Key starter (8-15 PPG) OUT: -0.05 to -0.09
- Role player OUT: -0.01 to -0.04
- Questionable/Day-to-day: half of the above
- Multiple injuries: sum them, cap at -0.18

Return ONLY valid JSON (no markdown fences):
{{"adjustment": -0.07, "severity": "high", "key_player_out": "Name or null", "combined_impact": true, "reasoning": "One sentence max.", "confidence": "high|medium|low"}}"""

        try:
            msg = self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = msg.content[0].text.strip()
            # Strip markdown fences if present.
            raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
            result = json.loads(raw)
            result["adjustment"] = float(max(-0.18, min(0.0, result.get("adjustment", 0.0))))
            self._cache[cache_key] = result
            return result
        except Exception as e:
            result = {
                "adjustment": 0.0,
                "severity": "error",
                "key_player_out": None,
                "reasoning": f"Scoring error: {e}",
                "confidence": "low",
            }
            self._cache[cache_key] = result
            return result

