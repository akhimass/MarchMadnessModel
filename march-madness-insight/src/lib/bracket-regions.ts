import type { BracketMatchup, Team } from "@/types/bracket";

/** Canonical region order (matches Kaggle W/X/Y/Z → UI mapping). */
export const REGION_ORDER: readonly Team["region"][] = ["East", "South", "West", "Midwest"] as const;

/**
 * Kaggle R1 slots: R1W1=W01vW16 … R1W8=W08vW09 (sequential index 1–8).
 * NCAA pod stack (march-arena-reference): (1v16,8v9), (5v12,4v13), (6v11,3v14), (7v10,2v15).
 */
const R1_TRAILING_TO_POD: Record<number, number> = {
  1: 0,
  8: 1,
  5: 2,
  4: 3,
  6: 4,
  3: 5,
  7: 6,
  2: 7,
};

function r1TrailingSlotIndex(slot: string): number {
  const m = /^R1[WXYZ](\d+)$/i.exec(String(slot));
  return m ? parseInt(m[1], 10) : 99;
}

/** Sort key for R1: pod order; other rounds: lexical slot. */
export function compareMatchupsByDisplayOrder(a: BracketMatchup, b: BracketMatchup): number {
  const sa = String(a.slot);
  const sb = String(b.slot);
  if (sa.startsWith("R1") && sb.startsWith("R1")) {
    const pa = R1_TRAILING_TO_POD[r1TrailingSlotIndex(sa)] ?? 99;
    const pb = R1_TRAILING_TO_POD[r1TrailingSlotIndex(sb)] ?? 99;
    if (pa !== pb) return pa - pb;
  }
  return sa.localeCompare(sb);
}

export type RegionFilterKey = "all" | "east" | "south" | "west" | "midwest";

const REGION_KEYS: RegionFilterKey[] = ["all", "east", "south", "west", "midwest"];

export function parseRegionFilterParam(
  raw: string | null | undefined,
  stage: "R1" | "R2" | "R3" | "R4" | "R5" | "R6",
): RegionFilterKey {
  if (stage !== "R1" && stage !== "R2") return "all";
  const v = String(raw || "all").toLowerCase().trim();
  return REGION_KEYS.includes(v as RegionFilterKey) ? (v as RegionFilterKey) : "all";
}

export function regionKeyToLabel(key: Exclude<RegionFilterKey, "all">): Team["region"] {
  return (key.charAt(0).toUpperCase() + key.slice(1)) as Team["region"];
}

/** Primary region for a matchup (both teams share a region in R1/R2). */
export function matchupPrimaryRegion(m: BracketMatchup): Team["region"] {
  return m.team1.region;
}

export function filterMatchupsByRegion(
  matchups: BracketMatchup[],
  filter: RegionFilterKey,
): BracketMatchup[] {
  if (filter === "all") {
    return [...matchups].sort((a, b) => {
      const ia = REGION_ORDER.indexOf(matchupPrimaryRegion(a));
      const ib = REGION_ORDER.indexOf(matchupPrimaryRegion(b));
      if (ia !== ib) return ia - ib;
      return compareMatchupsByDisplayOrder(a, b);
    });
  }
  const label = regionKeyToLabel(filter);
  return matchups
    .filter((m) => matchupPrimaryRegion(m) === label || m.team2.region === label)
    .sort(compareMatchupsByDisplayOrder);
}

export function groupMatchupsByRegion(matchups: BracketMatchup[]): { region: Team["region"]; items: BracketMatchup[] }[] {
  const map = new Map<Team["region"], BracketMatchup[]>();
  for (const r of REGION_ORDER) map.set(r, []);
  for (const m of matchups) {
    const pr = matchupPrimaryRegion(m);
    if (!map.has(pr)) map.set(pr, []);
    map.get(pr)!.push(m);
  }
  for (const r of REGION_ORDER) {
    map.get(r)!.sort(compareMatchupsByDisplayOrder);
  }
  return REGION_ORDER.map((region) => ({ region, items: map.get(region) ?? [] })).filter((g) => g.items.length > 0);
}
