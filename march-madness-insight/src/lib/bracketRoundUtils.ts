import type { StageKey } from "@/lib/bracket-stages";

/** Map slot token → stage (R1…R6). Championship is R6CH → R6. */
export function slotToStage(slot: string): StageKey | null {
  const s = String(slot).toUpperCase();
  if (s.startsWith("R6")) return "R6";
  const m = s.match(/^R([1-5])/);
  return m ? (`R${m[1]}` as StageKey) : null;
}

const REGION_LETTERS = ["W", "X", "Y", "Z"] as const;
export type RegionLetter = (typeof REGION_LETTERS)[number];

export function slotToRegionLetter(slot: string): RegionLetter | null {
  const m = String(slot).match(/^R1([WXYZ])/i);
  return m ? (m[1].toUpperCase() as RegionLetter) : null;
}

/**
 * Count picks whose slot keys belong to a round using prefix match (R1…R6).
 * Matches backend tokens like R1W1, R5WX, R6CH reliably (avoids regex edge cases).
 */
export function countPicksForStage(picks: Record<string, number>, stage: StageKey): number {
  const pref = stage.toUpperCase();
  let n = 0;
  for (const slot of Object.keys(picks)) {
    if (String(slot).toUpperCase().startsWith(pref)) n += 1;
  }
  return n;
}

const STAGE_TOTALS: Record<StageKey, number> = {
  R1: 32,
  R2: 16,
  R3: 8,
  R4: 4,
  R5: 2,
  R6: 1,
};

export function stageTotal(stage: StageKey): number {
  return STAGE_TOTALS[stage];
}

export function countR1RegionPicks(picks: Record<string, number>, letter: RegionLetter): number {
  const pref = `R1${letter}`;
  let n = 0;
  for (const slot of Object.keys(picks)) {
    if (slot.startsWith(pref)) n += 1;
  }
  return n;
}

export function isRegionR1Complete(picks: Record<string, number>, letter: RegionLetter): boolean {
  return countR1RegionPicks(picks, letter) === 8;
}

export const REGION_LABEL: Record<RegionLetter, string> = {
  W: "East",
  X: "South",
  Y: "Midwest",
  Z: "West",
};
