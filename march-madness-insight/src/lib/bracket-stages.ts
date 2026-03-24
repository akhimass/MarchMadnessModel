/** Shared bracket round keys / labels for URL `stage` and UI copy. */

export type StageKey = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";

export const STAGE_KEYS: StageKey[] = ["R1", "R2", "R3", "R4", "R5", "R6"];

export const STAGE_TITLE: Record<StageKey, string> = {
  R1: "Round of 64",
  R2: "Round of 32",
  R3: "Sweet 16",
  R4: "Elite 8",
  R5: "Final 4",
  R6: "Championship",
};

export function parseStageParam(param: string | null | undefined): StageKey {
  const raw = String(param || "R1").toUpperCase();
  return STAGE_KEYS.includes(raw as StageKey) ? (raw as StageKey) : "R1";
}
