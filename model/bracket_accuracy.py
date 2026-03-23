"""
Compare deterministic bracket picks from multiple models against known results.

Truth sources (merged, later overrides earlier):
  1) Tournament compact results CSV (games played so far)
  2) Optional JSON file `data/bracket_truth_{M|W}_{season}.json`
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import pandas as pd

from model.config import DATA_DIR

_REPO_ROOT = Path(__file__).resolve().parents[1]


def _truth_json_path(gender: str, season: int) -> Path:
    g = "M" if (gender or "M").upper().strip() != "W" else "W"
    return Path(DATA_DIR) / f"bracket_truth_{g}_{int(season)}.json"


def load_truth_slots_from_json(gender: str, season: int) -> Dict[str, int]:
    p = _truth_json_path(gender, season)
    if not p.exists():
        p2 = _REPO_ROOT / "data" / f"bracket_truth_{('M' if (gender or 'M').upper() != 'W' else 'W')}_{int(season)}.json"
        p = p2 if p2.exists() else p
    if not p.exists():
        return {}
    try:
        raw = json.loads(p.read_text())
        slots = raw.get("slots") if isinstance(raw, dict) else None
        if not isinstance(slots, dict):
            return {}
        out: Dict[str, int] = {}
        for k, v in slots.items():
            try:
                out[str(k)] = int(v)
            except (TypeError, ValueError):
                continue
        return out
    except (OSError, json.JSONDecodeError):
        return {}


def load_compact_results_frame(gender: str) -> Optional[pd.DataFrame]:
    fname = "MNCAATourneyCompactResults.csv" if (gender or "M").upper() != "W" else "WNCAATourneyCompactResults.csv"
    for base in (Path(DATA_DIR), _REPO_ROOT / "data"):
        p = base / fname
        if p.exists():
            return pd.read_csv(p)
    return None


def merge_truth(
    from_compact: Dict[str, int],
    from_json: Dict[str, int],
) -> Dict[str, int]:
    merged = dict(from_compact)
    merged.update(from_json)
    return merged


class HeuristicBracketModel:
    """
    Minimal `predict_proba_matchup` surface for BracketSimulator.

    team1_id / team2_id follow bracket convention: team1 is StrongSeed side.
    """

    def __init__(self, pipeline: Any, kind: str):
        self.pipeline = pipeline
        self.kind = (kind or "").lower().strip()
        self.season = int(getattr(pipeline, "season", 2026))

    def predict_proba_matchup(
        self,
        team1_id: int,
        team2_id: int,
        season: int,
        use_chaos: bool = False,
    ) -> float:
        _ = use_chaos
        s = int(season)
        t1, t2 = int(team1_id), int(team2_id)

        if self.kind == "massey_rating":
            m1 = float(self.pipeline.massey_ratings.get(s, {}).get(t1, 0.0))
            m2 = float(self.pipeline.massey_ratings.get(s, {}).get(t2, 0.0))
            if m1 > m2:
                return 1.0
            if m1 < m2:
                return 0.0
            return 0.5

        if self.kind == "net_eff":
            st1 = self.pipeline.team_stats.get((s, t1), {}) or {}
            st2 = self.pipeline.team_stats.get((s, t2), {}) or {}
            n1 = float(st1.get("NetEff", 0.0))
            n2 = float(st2.get("NetEff", 0.0))
            if n1 > n2:
                return 1.0
            if n1 < n2:
                return 0.0
            return 0.5

        if self.kind == "seed":
            seed_map = getattr(self.pipeline, "seeds_map", {})
            s1 = float(seed_map.get((s, t1), 99.0))
            s2 = float(seed_map.get((s, t2), 99.0))
            if s1 < s2:
                return 1.0
            if s1 > s2:
                return 0.0
            return 0.5

        if self.kind == "ordinal_mas":
            # Lower Massey ordinal rank (MMasseyOrdinals MAS) = better.
            of = getattr(self.pipeline, "ordinal_features", None)
            if of is None:
                return 0.5
            seed1 = float(self.pipeline.seeds_map.get((s, t1), 8.0))
            seed2 = float(self.pipeline.seeds_map.get((s, t2), 8.0))
            f1 = of.get_team_features(int(t1), s, int(seed1))
            f2 = of.get_team_features(int(t2), s, int(seed2))
            r1 = float(f1.get("mas_rank", 180.0))
            r2 = float(f2.get("mas_rank", 180.0))
            if r1 < r2:
                return 1.0
            if r1 > r2:
                return 0.0
            return 0.5

        return 0.5


def _resolve_strong_weak_for_slot(
    sim: Any,
    slot: str,
    pred_memo: Dict[str, int],
) -> Optional[Tuple[int, int]]:
    """Resolve (strong_team, weak_team) for a slot using deterministic picks."""
    slot = str(slot)
    strong_ref, weak_ref = sim.slot_graph[slot]

    def resolve_ref(ref: str) -> Optional[int]:
        ref = str(ref)
        if ref in sim.seed_to_team:
            return int(sim.seed_to_team[ref])
        if ref in pred_memo:
            return int(pred_memo[ref])
        return None

    st = resolve_ref(strong_ref)
    wt = resolve_ref(weak_ref)
    if st is None or wt is None:
        return None
    return int(st), int(wt)


def compute_metrics(
    sim: Any,
    pred_slots: Dict[str, int],
    truth_slots: Dict[str, int],
    prob_strong_fn: Callable[[int, int], float],
) -> Dict[str, Any]:
    """
    Compare predicted winners to truth for overlapping slots.

    `prob_strong_fn(strong, weak)` -> P(strong wins) for Brier score.
    """
    slots = sorted(set(truth_slots.keys()) & set(pred_slots.keys()))
    correct = 0
    total = len(slots)
    brier_sum = 0.0
    brier_n = 0

    for slot in slots:
        tw = int(truth_slots[slot])
        pw = int(pred_slots[slot])
        if tw == pw:
            correct += 1

        # Resolve actual matchup teams from *truth* bracket (not predicted).
        rs = _resolve_strong_weak_for_slot(sim, slot, truth_slots)
        if rs is None:
            continue
        strong_team, weak_team = rs
        p_strong = float(prob_strong_fn(int(strong_team), int(weak_team)))
        actual = 1.0 if tw == strong_team else 0.0
        brier_sum += (p_strong - actual) ** 2
        brier_n += 1

    champ_slot = str(getattr(sim, "champion_slot", "R6CH"))
    champ_correct: Optional[bool] = None
    if champ_slot in truth_slots and champ_slot in pred_slots:
        champ_correct = int(pred_slots[champ_slot]) == int(truth_slots[champ_slot])

    # Final Four: winners of R4* regional-final slots
    f4_slots = sorted(
        {s for s in list(pred_slots.keys()) + list(truth_slots.keys()) if str(s).startswith("R4")}
    )
    truth_f4 = {truth_slots[s] for s in f4_slots if s in truth_slots}
    pred_f4 = {pred_slots[s] for s in f4_slots if s in pred_slots}
    f4_overlap: Optional[int] = None
    if len(truth_f4) >= 4 and len(pred_f4) >= 4:
        f4_overlap = len(truth_f4 & pred_f4)

    return {
        "gamesCorrect": correct,
        "gamesCompared": total,
        "accuracy": round(correct / total, 4) if total else None,
        "brierScore": round(brier_sum / brier_n, 5) if brier_n else None,
        "brierGames": brier_n,
        "championCorrect": champ_correct,
        "finalFourOverlap": f4_overlap,
    }


def team_name_map_from_pipeline(pipeline: Any) -> Dict[int, str]:
    teams_df = getattr(pipeline, "teams_df", None)
    if teams_df is None or "TeamID" not in teams_df.columns:
        return {}
    return {int(t): str(n) for t, n in zip(teams_df["TeamID"], teams_df["TeamName"])}
