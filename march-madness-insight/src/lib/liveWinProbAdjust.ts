import type { ModelBreakdown } from "@/types/bracket";
import type { LiveGame } from "@/lib/espnApi";

/** NCAA regulation length (two 20-minute halves), seconds. */
export const REGULATION_SECONDS = 40 * 60;

const HALF_SECONDS = 20 * 60;
const OT_PERIOD_SECONDS = 5 * 60;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function logit(p: number): number {
  const pp = clamp01(p);
  const eps = 1e-6;
  const c = Math.min(Math.max(pp, eps), 1 - eps);
  return Math.log(c / (1 - c));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.min(80, Math.max(-80, x))));
}

/** Parse ESPN-style clock (e.g. "12:34" or "0:42") to seconds left in the current period. */
export function parsePeriodClockToSeconds(clock: string | undefined): number {
  if (!clock) return 0;
  const trimmed = clock.trim();
  const parts = trimmed.split(":");
  if (parts.length >= 2) {
    const m = parseInt(parts[0], 10);
    const secPart = parts[1].split(".")[0] ?? "0";
    const s = parseInt(secPart, 10);
    if (!Number.isNaN(m) && !Number.isNaN(s)) return m * 60 + s;
  }
  return 0;
}

/**
 * Rough seconds remaining in regulation + OT (for win-prob decay).
 * Period 1: clock + full second half. Period 2: clock only. OT: add 5 min per OT segment before current.
 */
export function estimateSecondsRemaining(game: LiveGame): number {
  const p = game.period ?? 1;
  const inPeriod = parsePeriodClockToSeconds(game.clock);

  if (p <= 1) {
    return inPeriod + HALF_SECONDS;
  }
  if (p === 2) {
    return inPeriod;
  }
  const otIndex = p - 2;
  return inPeriod + (otIndex - 1) * OT_PERIOD_SECONDS;
}

/** Point differential from team1's perspective (team1 = lower Kaggle id in API). */
export function marginForTeam1(game: LiveGame, awayK: number, homeK: number): number {
  const lo = Math.min(awayK, homeK);
  const away = parseInt(game.away.score, 10);
  const home = parseInt(game.home.score, 10);
  const as = Number.isFinite(away) ? away : 0;
  const hs = Number.isFinite(home) ? home : 0;
  const t1IsAway = awayK === lo;
  return t1IsAway ? as - hs : hs - as;
}

/**
 * Win probability for the team currently ahead on the scoreboard, given margin and time.
 * Symmetric — used as the "game state" attractor for each team1-oriented submodel.
 */
export function scoreImpliedWinProbTeam1(marginTeam1: number, secondsLeft: number): number {
  const mins = Math.max(0.25, secondsLeft / 60);
  const sigma = 11 * Math.sqrt(mins);
  return clamp01(sigmoid(marginTeam1 / Math.max(1, sigma)));
}

/** How quickly each submodel moves toward the live score state (0–1). Ensemble uses the full curve. */
const REACTIVITY: Record<keyof ModelBreakdown, number> = {
  decision_tree: 0.38,
  power_ratings: 0.48,
  similar_games: 0.55,
  simulation: 0.92,
  seed_difference: 0.22,
  ensemble: 1,
};

const SUBMODEL_KEYS: (keyof ModelBreakdown)[] = [
  "decision_tree",
  "power_ratings",
  "similar_games",
  "simulation",
  "seed_difference",
];

/**
 * Blend pregame breakdown toward a score/clock-implied win probability for team1.
 * At tipoff (~40 min left) values match pregame; late / big margins track the scoreboard more.
 */
export function adjustBreakdownForLiveScore(
  pregame: ModelBreakdown,
  marginTeam1: number,
  secondsLeft: number,
): ModelBreakdown {
  const sec = Math.max(0, secondsLeft);
  const pGame = scoreImpliedWinProbTeam1(marginTeam1, sec);
  const wBase = 1 - Math.min(1, sec / REGULATION_SECONDS);
  const wCurve = wBase * wBase;

  const out: ModelBreakdown = { ...pregame };

  for (const key of SUBMODEL_KEYS) {
    const pi = clamp01(pregame[key]);
    const wi = wCurve * REACTIVITY[key];
    out[key] = clamp01(sigmoid((1 - wi) * logit(pi) + wi * logit(pGame)));
  }

  const pEns = clamp01(pregame.ensemble);
  const we = wCurve * REACTIVITY.ensemble;
  out.ensemble = clamp01(sigmoid((1 - we) * logit(pEns) + we * logit(pGame)));

  return out;
}

export type LiveAdjustMeta = {
  marginTeam1: number;
  secondsRemaining: number;
  scoreImpliedTeam1: number;
  blendWeight: number;
};

export function liveAdjustMeta(game: LiveGame, awayK: number, homeK: number): LiveAdjustMeta {
  const marginTeam1 = marginForTeam1(game, awayK, homeK);
  const secondsRemaining = estimateSecondsRemaining(game);
  const scoreImpliedTeam1 = scoreImpliedWinProbTeam1(marginTeam1, secondsRemaining);
  const wBase = 1 - Math.min(1, secondsRemaining / REGULATION_SECONDS);
  const blendWeight = wBase * wBase;
  return { marginTeam1, secondsRemaining, scoreImpliedTeam1, blendWeight };
}
