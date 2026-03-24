import { ESPN_TO_KAGGLE_M } from "@/lib/espnApi";

/** Reverse map for men’s tournament teams (partial — falls back to undefined). */
const KAGGLE_TO_ESPN: Record<number, string> = {};
for (const [espn, kaggle] of Object.entries(ESPN_TO_KAGGLE_M)) {
  KAGGLE_TO_ESPN[kaggle] = espn;
}

/** ESPN team id (string) → Kaggle TeamID for men’s field (partial map). */
export const ESPNID_TO_KAGGLE: Record<string, number> = Object.fromEntries(
  Object.entries(KAGGLE_TO_ESPN).map(([kaggle, espn]) => [String(espn), Number(kaggle)]),
);

export function kaggleIdToEspnId(teamId: number): string | undefined {
  return KAGGLE_TO_ESPN[teamId];
}

export function espnIdToKaggleId(espnId: string): number | null {
  return ESPNID_TO_KAGGLE[espnId] ?? null;
}
