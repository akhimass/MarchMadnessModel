from __future__ import annotations

import argparse
import json
import math
import os
import pickle
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

import numpy as np
import pandas as pd

from model.config import DATA_DIR


def _parse_numeric_seed(seed_token: str) -> int:
    """
    Convert a seed token like 'W01', 'X16', 'X16a' into an integer 1..16.
    """
    import re

    m = re.search(r"(\d{1,2})", str(seed_token))
    if not m:
        raise ValueError(f"Could not parse numeric seed from token: {seed_token}")
    return int(m.group(1))


def _default_label_mapper(model: Any, use_chaos: bool) -> Any:
    """
    Infer the standard vs chaos model object from a few common shapes.
    """
    if isinstance(model, dict):
        if use_chaos:
            return model.get("chaos") or model.get("chaos_model") or model.get("upset")
        return model.get("standard") or model.get("standard_model") or model.get("power")

    # Attribute-based fallback.
    if use_chaos and hasattr(model, "chaos_model"):
        return getattr(model, "chaos_model")
    if (not use_chaos) and hasattr(model, "standard_model"):
        return getattr(model, "standard_model")

    # Otherwise, assume the passed model already represents the desired universe.
    return model


class BracketSimulator:
    """
    Monte Carlo bracket simulator over the real NCAA 2026 slot graph.

    The simulator is intentionally flexible about the `model` interface:
      - Preferred: model (or model['standard']/model['chaos']) implements
          `predict_proba_matchup(team1_id, team2_id, season, use_chaos=False) -> float`
        where the returned value is P(team1 wins).
      - Fallback: model implements `predict_proba(X_df_or_array)`.
        In that case, this simulator needs a `feature_builder` callable that
        maps (team1_id, team2_id, season) -> dict of features compatible with
        the model's expected feature columns.
    """

    def __init__(
        self,
        seeds_df: pd.DataFrame,
        slots_df: pd.DataFrame,
        model: Any,
        season: int = 2026,
        feature_builder: Optional[Callable[[int, int, int], Dict[str, float]]] = None,
        rng_seed: int = 42,
        gender: str = "M",
        teams_df: Optional[pd.DataFrame] = None,
    ):
        self.season = int(season)
        self.model = model
        self.feature_builder = feature_builder
        self.gender = gender
        self.rng = np.random.default_rng(int(rng_seed))

        seeds_season = seeds_df.loc[seeds_df["Season"] == self.season].copy()
        slots_season = slots_df.loc[slots_df["Season"] == self.season].copy()

        if seeds_season.empty:
            raise ValueError(f"No seeds found for Season={self.season}")
        if slots_season.empty:
            raise ValueError(f"No slots found for Season={self.season}")

        # seed token (e.g. W01, X16a) -> team_id
        self.seed_to_team: Dict[str, int] = {
            str(seed): int(tid) for seed, tid in zip(seeds_season["Seed"], seeds_season["TeamID"])
        }

        # Seed token per team: team_id -> seed_token
        self.team_to_seed_token: Dict[int, str] = {
            int(tid): str(seed)
            for seed, tid in zip(seeds_season["Seed"], seeds_season["TeamID"])
        }

        # Region slot graph: Slot -> (StrongSeedRef, WeakSeedRef)
        self.slot_graph: Dict[str, Tuple[str, str]] = {
            str(slot): (str(strong), str(weak))
            for slot, strong, weak in zip(
                slots_season["Slot"], slots_season["StrongSeed"], slots_season["WeakSeed"]
            )
        }

        # Determine champion slot.
        # For NCAA datasets, this is usually 'R6CH'.
        self.champion_slot = "R6CH" if "R6CH" in self.slot_graph else max(self.slot_graph.keys())

        # Load team names for output.
        if teams_df is None:
            teams_file = f"{self.gender}Teams.csv" if f"{self.gender}Teams.csv".startswith("M") else None
            # The dataset naming is usually MTeams.csv / WTeams.csv.
            if self.gender.upper() == "M":
                teams_file = "MTeams.csv"
            else:
                teams_file = "WTeams.csv"

            repo_root = Path(__file__).resolve().parents[2]
            candidate_paths = [
                Path(DATA_DIR) / teams_file,
                repo_root / "data" / teams_file,
            ]
            teams_path = next((p for p in candidate_paths if p.exists()), None)
            if teams_path is None:
                raise FileNotFoundError(
                    f"Could not find {teams_file} in {candidate_paths}. "
                    f"Pass `teams_df` directly if needed."
                )
            teams_df = pd.read_csv(teams_path)

        self.team_names: Dict[int, str] = {}
        if "TeamID" in teams_df.columns and "TeamName" in teams_df.columns:
            self.team_names = {
                int(tid): str(name)
                for tid, name in zip(teams_df["TeamID"], teams_df["TeamName"])
            }

        self.team_ids = sorted(set(seeds_season["TeamID"].astype(int).to_numpy()))

        # Precompute a fast slot list in topological order so we can simulate
        # brackets iteratively. Some NCAA slots (e.g. 'X16', 'Y11') do not start
        # with 'R' and cannot be ordered reliably by parsing the round number.
        slots = list(self.slot_graph.keys())
        indegree = {s: 0 for s in slots}
        adj: Dict[str, list[str]] = {s: [] for s in slots}
        for s in slots:
            strong_ref, weak_ref = self.slot_graph[s]
            for ref in (strong_ref, weak_ref):
                ref = str(ref)
                if ref in self.slot_graph:
                    indegree[s] += 1
                    adj[ref].append(s)

        # Deterministic Kahn topological sort.
        ready = sorted([s for s in slots if indegree[s] == 0])
        order: list[str] = []
        while ready:
            cur = ready.pop(0)
            order.append(cur)
            for nxt in adj[cur]:
                indegree[nxt] -= 1
                if indegree[nxt] == 0:
                    ready.append(nxt)
                    ready.sort()

        if len(order) != len(slots):
            raise ValueError("Slot dependency graph contains a cycle or disconnected component.")

        self._slot_list = order
        self._slot_idx_map = {slot: idx for idx, slot in enumerate(self._slot_list)}

        m = len(self._slot_list)
        self._slot_round_num = np.zeros(m, dtype=int)

        # For each slot position, store where each team comes from:
        #   - if a ref is a seed token: it maps to a team_id via seed_to_team
        #   - if a ref is another slot: it maps to winner_slot[ref_slot_idx]
        self._strong_is_seed = [False] * m
        self._weak_is_seed = [False] * m
        self._strong_ref_seed_token: list[Optional[str]] = [None] * m
        self._weak_ref_seed_token: list[Optional[str]] = [None] * m
        self._strong_ref_slot_idx = np.full(m, -1, dtype=int)
        self._weak_ref_slot_idx = np.full(m, -1, dtype=int)

        for pos, slot in enumerate(self._slot_list):
            strong_ref, weak_ref = self.slot_graph[slot]
            # Only R-prefixed slots map to tournament rounds used for reach heatmap.
            self._slot_round_num[pos] = int(str(slot)[1]) if str(slot).startswith("R") and len(str(slot)) > 1 else 0

            if strong_ref in self.seed_to_team:
                self._strong_is_seed[pos] = True
                self._strong_ref_seed_token[pos] = str(strong_ref)
            else:
                self._strong_ref_slot_idx[pos] = self._slot_idx_map[str(strong_ref)]

            if weak_ref in self.seed_to_team:
                self._weak_is_seed[pos] = True
                self._weak_ref_seed_token[pos] = str(weak_ref)
            else:
                self._weak_ref_slot_idx[pos] = self._slot_idx_map[str(weak_ref)]

        # Team seed numbers for Cinderella.
        self._team_index = {tid: idx for idx, tid in enumerate(self.team_ids)}
        self._team_seed_num = np.zeros(len(self.team_ids), dtype=int)
        for tid, idx in self._team_index.items():
            seed_token = self.team_to_seed_token[tid]
            self._team_seed_num[idx] = _parse_numeric_seed(seed_token)

        # Probability cache: (use_chaos, team1_id, team2_id) -> p(team1 wins)
        self._prob_cache: Dict[bool, Dict[Tuple[int, int], float]] = {False: {}, True: {}}

        # Round prefixes (by slot code convention).
        self.r32_prefix = "R1"
        self.s16_prefix = "R2"
        self.e8_prefix = "R3"
        self.f4_prefix = "R4"
        self.title_prefix = "R5"
        self.champ_prefix = "R6CH"

    def _predict_prob_team1_wins_cached(self, team1_id: int, team2_id: int, use_chaos: bool) -> float:
        cache = self._prob_cache[bool(use_chaos)]
        key = (int(team1_id), int(team2_id))
        if key in cache:
            return cache[key]
        p = self._predict_prob_team1_wins(team1_id=int(team1_id), team2_id=int(team2_id), use_chaos=use_chaos)
        cache[key] = float(p)
        return float(p)

    def _simulate_one_bracket_fast(self, use_chaos: bool) -> Dict[str, int]:
        """
        Iterative single-bracket simulation.
        Returns slot -> winning_team_id for all slots.
        """
        m = len(self._slot_list)
        winner_slot = np.zeros(m, dtype=int)
        memo: Dict[str, int] = {}

        for pos, slot in enumerate(self._slot_list):
            if self._strong_is_seed[pos]:
                strong_team = self.seed_to_team[self._strong_ref_seed_token[pos]]  # type: ignore[index]
            else:
                strong_team = int(winner_slot[self._strong_ref_slot_idx[pos]])

            if self._weak_is_seed[pos]:
                weak_team = self.seed_to_team[self._weak_ref_seed_token[pos]]  # type: ignore[index]
            else:
                weak_team = int(winner_slot[self._weak_ref_slot_idx[pos]])

            p_strong = self._predict_prob_team1_wins_cached(strong_team, weak_team, use_chaos=use_chaos)
            u = float(self.rng.random())
            winner_team = int(strong_team) if u < p_strong else int(weak_team)
            winner_slot[pos] = winner_team
            memo[slot] = winner_team

        return memo

    def _resolve_ref(self, ref: str, memo: Dict[str, int], use_chaos: bool) -> int:
        """
        Resolve a reference that is either a seed token (W01, X16a) or another slot.
        """
        ref = str(ref)
        if ref in self.seed_to_team:
            return self.seed_to_team[ref]
        return self._winner_of_slot(ref, memo=memo, use_chaos=use_chaos)

    def _predict_prob_team1_wins(self, team1_id: int, team2_id: int, use_chaos: bool) -> float:
        """
        Predict P(team1 wins) from the provided model/universe.
        """
        model = _default_label_mapper(self.model, use_chaos=use_chaos)

        if hasattr(model, "predict_proba_matchup"):
            p = model.predict_proba_matchup(
                team1_id=team1_id, team2_id=team2_id, season=self.season, use_chaos=use_chaos
            )
            return float(p)

        # Try feature_builder + model.predict_proba
        if self.feature_builder is None:
            raise ValueError(
                "Model does not provide `predict_proba_matchup` and no `feature_builder` was provided "
                "to the BracketSimulator."
            )

        feats = self.feature_builder(int(team1_id), int(team2_id), int(self.season))
        X = pd.DataFrame([feats])

        if hasattr(model, "feature_cols"):
            # Many models expect a specific feature order.
            cols = list(getattr(model, "feature_cols"))
            missing = [c for c in cols if c not in X.columns]
            if missing:
                raise ValueError(f"feature_builder missing columns: {missing}")
            X = X[cols]

        if hasattr(model, "predict_proba"):
            p_vec = model.predict_proba(X)
            p = float(np.asarray(p_vec).reshape(-1)[0])
            return p

        raise ValueError("Unsupported model interface for prediction.")

    def _winner_of_slot(self, slot: str, memo: Dict[str, int], use_chaos: bool) -> int:
        slot = str(slot)
        if slot in memo:
            return memo[slot]

        strong_ref, weak_ref = self.slot_graph[slot]
        strong_team = self._resolve_ref(strong_ref, memo=memo, use_chaos=use_chaos)
        weak_team = self._resolve_ref(weak_ref, memo=memo, use_chaos=use_chaos)

        # IMPORTANT: use model prediction as P(strong_team wins)
        # StrongSeed should correspond to "team1" in probability convention.
        p_strong = self._predict_prob_team1_wins(strong_team, weak_team, use_chaos=use_chaos)
        u = float(self.rng.random())
        winner = strong_team if u < p_strong else weak_team

        memo[slot] = int(winner)
        return int(winner)

    def _simulate_one_bracket_with_matchups(
        self, use_chaos: bool
    ) -> Tuple[Dict[str, int], Dict[str, Tuple[int, int, float, int, int]]]:
        """
        Simulate one bracket, returning:
          - memo: slot -> winning_team_id
          - matchups: slot -> (strong_team_id, weak_team_id, p_strong, seed_strong, seed_weak)

        This computes win probabilities exactly once per slot matchup, enabling
        both fast aggregation and chaos-mode Cinderella index.
        """

        memo: Dict[str, int] = {}
        matchups: Dict[str, Tuple[int, int, float, int, int]] = {}

        def winner_of_slot_detail(slot: str) -> int:
            slot = str(slot)
            if slot in memo:
                return memo[slot]

            def resolve_ref(ref: str) -> int:
                ref = str(ref)
                if ref in self.seed_to_team:
                    return self.seed_to_team[ref]
                # Otherwise, it's a slot reference.
                return winner_of_slot_detail(ref)

            strong_ref, weak_ref = self.slot_graph[slot]
            strong_team = resolve_ref(strong_ref)
            weak_team = resolve_ref(weak_ref)

            p_strong = self._predict_prob_team1_wins(int(strong_team), int(weak_team), use_chaos=use_chaos)

            strong_seed_num = _parse_numeric_seed(self.team_to_seed_token[int(strong_team)])
            weak_seed_num = _parse_numeric_seed(self.team_to_seed_token[int(weak_team)])
            matchups[slot] = (int(strong_team), int(weak_team), float(p_strong), int(strong_seed_num), int(weak_seed_num))

            u = float(self.rng.random())
            winner = int(strong_team) if u < p_strong else int(weak_team)
            memo[slot] = winner
            return winner

        _ = winner_of_slot_detail(self.champion_slot)
        return memo, matchups

    def simulate_deterministic_favorites(self, use_chaos: bool = False) -> Dict[str, int]:
        """
        Fill the bracket by always picking the model favorite (no RNG).

        At each slot, winner is StrongSeed if P(Strong wins) >= 0.5, else WeakSeed.
        If probabilities tie at exactly 0.5, break ties by better (lower) numeric seed.
        """
        m = len(self._slot_list)
        winner_slot = np.zeros(m, dtype=int)
        memo: Dict[str, int] = {}

        for pos, slot in enumerate(self._slot_list):
            if self._strong_is_seed[pos]:
                strong_team = self.seed_to_team[self._strong_ref_seed_token[pos]]  # type: ignore[index]
            else:
                strong_team = int(winner_slot[self._strong_ref_slot_idx[pos]])

            if self._weak_is_seed[pos]:
                weak_team = self.seed_to_team[self._weak_ref_seed_token[pos]]  # type: ignore[index]
            else:
                weak_team = int(winner_slot[self._weak_ref_slot_idx[pos]])

            p_strong = self._predict_prob_team1_wins_cached(int(strong_team), int(weak_team), use_chaos=use_chaos)

            if p_strong > 0.5:
                winner_team = int(strong_team)
            elif p_strong < 0.5:
                winner_team = int(weak_team)
            else:
                s_s = int(self._team_seed_num[self._team_index[int(strong_team)]])
                s_w = int(self._team_seed_num[self._team_index[int(weak_team)]])
                winner_team = int(strong_team) if s_s <= s_w else int(weak_team)

            winner_slot[pos] = winner_team
            memo[str(slot)] = winner_team

        return memo

    def fill_from_compact_results(self, compact_df: pd.DataFrame) -> Dict[str, int]:
        """
        Build partial slot -> winner using tournament compact results (WTeamID / LTeamID).

        Only includes games present in `compact_df` for `self.season`. Later-round slots
        appear only when all feeder games exist so teams can be resolved.
        """
        season = int(self.season)
        pair_to_winner: Dict[Tuple[int, int], int] = {}
        sub = compact_df.loc[compact_df["Season"] == season] if "Season" in compact_df.columns else compact_df
        for _, row in sub.iterrows():
            w, l = int(row["WTeamID"]), int(row["LTeamID"])
            a, b = (min(w, l), max(w, l))
            pair_to_winner[(a, b)] = w

        m = len(self._slot_list)
        winner_slot = np.zeros(m, dtype=int)
        memo: Dict[str, int] = {}

        for pos, slot in enumerate(self._slot_list):
            if self._strong_is_seed[pos]:
                strong_team = self.seed_to_team[self._strong_ref_seed_token[pos]]  # type: ignore[index]
            else:
                idx = int(self._strong_ref_slot_idx[pos])
                if winner_slot[idx] == 0:
                    break
                strong_team = int(winner_slot[idx])

            if self._weak_is_seed[pos]:
                weak_team = self.seed_to_team[self._weak_ref_seed_token[pos]]  # type: ignore[index]
            else:
                idx = int(self._weak_ref_slot_idx[pos])
                if winner_slot[idx] == 0:
                    break
                weak_team = int(winner_slot[idx])

            a, b = (min(int(strong_team), int(weak_team)), max(int(strong_team), int(weak_team)))
            key = (a, b)
            if key not in pair_to_winner:
                # Game not played yet (or missing from CSV) — leave 0; dependent slots stop later.
                continue

            winner_team = int(pair_to_winner[key])
            winner_slot[pos] = winner_team
            memo[str(slot)] = winner_team

        return memo

    def simulate_one_bracket(self, model: Any, use_chaos: bool = False) -> Dict[str, int]:
        """
        Simulate one complete tournament.

        Returns a mapping: {slot: winning_team_id}.
        """
        # Support the signature while still using the same slot graph.
        # If the passed model differs, clear the probability cache to avoid
        # cross-model contamination.
        if model is self.model:
            return self._simulate_one_bracket_fast(use_chaos=use_chaos)

        prev_model = self.model
        prev_cache = self._prob_cache
        try:
            self.model = model
            self._prob_cache = {False: {}, True: {}}
            return self._simulate_one_bracket_fast(use_chaos=use_chaos)
        finally:
            self.model = prev_model
            self._prob_cache = prev_cache

    def run_simulations(self, n: int = 100_000, use_chaos: bool = False) -> pd.DataFrame:
        """
        Run n simulations.

        Track:
          - how often each team reaches each round (R32, S16, E8, F4, Title, Champ)
          - expected wins per team (AvgWins)
          - chaos: Cinderella index (Cinderella)

        Returns
        -------
        pd.DataFrame
            Columns:
              TeamID, TeamName, Seed, R32, S16, E8, F4, Title, Champ, AvgWins
              + when use_chaos=True: Cinderella
        """

        n = int(n)
        team_ids = self.team_ids

        # Reach counts arrays; indexed by team position.
        reach_R32 = np.zeros(len(team_ids), dtype=float)
        reach_S16 = np.zeros(len(team_ids), dtype=float)
        reach_E8 = np.zeros(len(team_ids), dtype=float)
        reach_F4 = np.zeros(len(team_ids), dtype=float)
        reach_Title = np.zeros(len(team_ids), dtype=float)
        reach_Champ = np.zeros(len(team_ids), dtype=float)

        wins_counts = np.zeros(len(team_ids), dtype=float)
        cinderella_counts = np.zeros(len(team_ids), dtype=float)

        team_index = self._team_index
        team_seed_num = self._team_seed_num

        m = len(self._slot_list)

        for i in range(n):
            winner_slot = np.zeros(m, dtype=int)

            for pos, slot in enumerate(self._slot_list):
                if self._strong_is_seed[pos]:
                    strong_team = self.seed_to_team[self._strong_ref_seed_token[pos]]  # type: ignore[index]
                else:
                    strong_team = int(winner_slot[self._strong_ref_slot_idx[pos]])

                if self._weak_is_seed[pos]:
                    weak_team = self.seed_to_team[self._weak_ref_seed_token[pos]]  # type: ignore[index]
                else:
                    weak_team = int(winner_slot[self._weak_ref_slot_idx[pos]])

                p_strong = self._predict_prob_team1_wins_cached(strong_team, weak_team, use_chaos=use_chaos)
                u = float(self.rng.random())
                winner_team = int(strong_team) if u < p_strong else int(weak_team)
                winner_slot[pos] = winner_team

                w_idx = team_index[winner_team]
                wins_counts[w_idx] += 1.0

                round_num = int(self._slot_round_num[pos])
                if round_num == 1:
                    reach_R32[w_idx] += 1.0
                elif round_num == 2:
                    reach_S16[w_idx] += 1.0
                elif round_num == 3:
                    reach_E8[w_idx] += 1.0
                elif round_num == 4:
                    reach_F4[w_idx] += 1.0
                elif round_num == 5:
                    reach_Title[w_idx] += 1.0
                elif round_num == 6:
                    reach_Champ[w_idx] += 1.0

                if use_chaos:
                    s_idx = team_index[int(strong_team)]
                    t_idx = team_index[int(weak_team)]
                    strong_seed = int(team_seed_num[s_idx])
                    weak_seed = int(team_seed_num[t_idx])

                    strong_multiplier = (17.0 - weak_seed) / 8.5
                    weak_multiplier = (17.0 - strong_seed) / 8.5
                    cinderella_counts[s_idx] += strong_multiplier * p_strong
                    cinderella_counts[t_idx] += weak_multiplier * (1.0 - p_strong)

        # Build results table.
        rows = []
        for tid in team_ids:
            team_name = self.team_names.get(tid, "")
            seed_token = self.team_to_seed_token.get(tid, "")
            seed_num = _parse_numeric_seed(seed_token) if seed_token else math.nan

            idx = team_index[tid]
            rows.append(
                {
                    "TeamID": tid,
                    "TeamName": team_name,
                    "Seed": seed_num,
                    "R32": reach_R32[idx] / n,
                    "S16": reach_S16[idx] / n,
                    "E8": reach_E8[idx] / n,
                    "F4": reach_F4[idx] / n,
                    "Title": reach_Title[idx] / n,
                    "Champ": reach_Champ[idx] / n,
                    "AvgWins": wins_counts[idx] / n,
                    **({"Cinderella": cinderella_counts[idx] / n} if use_chaos else {}),
                }
            )

        out = pd.DataFrame(rows)
        return out.sort_values("Champ", ascending=False).reset_index(drop=True)

    def get_round_by_round_survival(self, results_df: pd.DataFrame) -> pd.DataFrame:
        """
        Produce a heatmap-friendly wide format:
          R32, S16, E8, F4, Title, Champ survival probabilities.
        """

        cols = ["TeamID", "TeamName", "Seed", "R32", "S16", "E8", "F4", "Title", "Champ"]
        missing = [c for c in cols if c not in results_df.columns]
        if missing:
            raise ValueError(f"results_df missing columns: {missing}")
        return results_df[cols].copy()

    def get_championship_probabilities(self, results_df: pd.DataFrame) -> Dict[str, float]:
        """
        Return {TeamName: ChampProbability}.
        """
        out: Dict[str, float] = {}
        for _, r in results_df.iterrows():
            name = str(r.get("TeamName", r["TeamID"]))
            out[name] = float(r["Champ"])
        return out


def _resolve_data_path(filename: str) -> Path:
    repo_root = Path(__file__).resolve().parents[2]
    # Candidate 1: configured DATA_DIR (intended: ./data)
    p1 = Path(DATA_DIR) / filename
    # Candidate 2: repo root/data
    p2 = repo_root / "data" / filename
    # Candidate 3: repo root (legacy)
    p3 = repo_root / filename
    if p1.exists():
        return p1
    if p2.exists():
        return p2
    if p3.exists():
        return p3
    raise FileNotFoundError(f"Could not find {filename} in {p1}, {p2}, or {p3}")


def _json_serializable_df(df: pd.DataFrame) -> list[dict[str, Any]]:
    def conv(v: Any) -> Any:
        if isinstance(v, (np.floating, np.integer)):
            return v.item()
        if isinstance(v, (np.ndarray,)):
            return v.tolist()
        if pd.isna(v):
            return None
        return v

    return [
        {k: conv(v) for k, v in row.items()}
        for row in df.to_dict(orient="records")
    ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Monte Carlo bracket simulations.")
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--n", type=int, default=100_000)
    parser.add_argument("--outdir", type=str, default=str(Path(".").resolve() / "sim_results"))
    parser.add_argument("--gender", type=str, default="M")
    parser.add_argument("--standard-model", type=str, default="")
    parser.add_argument("--chaos-model", type=str, default="")
    args = parser.parse_args()

    # Load bracket structure.
    seeds_path = _resolve_data_path("MNCAATourneySeeds.csv" if args.gender.upper() == "M" else "WNCAATourneySeeds.csv")
    slots_path = _resolve_data_path("MNCAATourneySlots.csv" if args.gender.upper() == "M" else "WNCAATourneySlots.csv")

    seeds_df = pd.read_csv(seeds_path)
    slots_df = pd.read_csv(slots_path)

    # Load models if paths provided; otherwise expect you to wire in externally.
    # This file focuses on simulation mechanics; model/feature wiring may vary.
    model_obj: Any = None
    if args.standard_model and args.chaos_model:
        # Optional pattern: you can pickle-load both model types externally.
        # Keep this placeholder minimal to avoid hard-coding class imports.
        model_obj = {"standard": None, "chaos": None}
        with open(args.standard_model, "rb") as f:
            model_obj["standard"] = pickle.load(f)  # type: ignore[name-defined]
        with open(args.chaos_model, "rb") as f:
            model_obj["chaos"] = pickle.load(f)  # type: ignore[name-defined]
    else:
        raise ValueError(
            "Provide --standard-model and --chaos-model paths (pickled objects) or "
            "wire model/prediction externally."
        )

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    simulator = BracketSimulator(
        seeds_df=seeds_df,
        slots_df=slots_df,
        model=model_obj,
        season=args.season,
        gender=args.gender,
    )

    # Standard simulation.
    standard_results = simulator.run_simulations(n=args.n, use_chaos=False)
    standard_path = outdir / f"standard_bracket_{args.season}.json"
    standard_path.write_text(json.dumps(_json_serializable_df(standard_results)))

    # Chaos simulation.
    chaos_results = simulator.run_simulations(n=args.n, use_chaos=True)
    chaos_path = outdir / f"chaos_bracket_{args.season}.json"
    chaos_path.write_text(json.dumps(_json_serializable_df(chaos_results)))

    # Print top 10 championship probabilities (standard).
    top10 = standard_results.head(10)[["TeamName", "TeamID", "Champ"]]
    print(f"Top 10 championship probabilities (standard) for Season={args.season}")
    for _, r in top10.iterrows():
        print(f"- {r['TeamName']} (TeamID={int(r['TeamID'])}): {float(r['Champ'])*100:.1f}%")

