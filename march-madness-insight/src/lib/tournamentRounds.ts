import type { LiveGame } from "@/lib/espnApi";
import { TOURNAMENT_DATES } from "@/lib/espnApi";

export type TournamentRoundKey = keyof typeof TOURNAMENT_DATES;

export const ROUND_ORDER: TournamentRoundKey[] = [
  "firstFour",
  "roundOf64",
  "roundOf32",
  "sweet16",
  "elite8",
  "finalFour",
  "championship",
];

const ROUND_LABELS: Record<TournamentRoundKey, string> = {
  firstFour: "First Four",
  roundOf64: "Round of 64",
  roundOf32: "Round of 32",
  sweet16: "Sweet 16",
  elite8: "Elite Eight",
  finalFour: "Final Four",
  championship: "National Championship",
};

/**
 * Parse ESPN event time to YYYYMMDD in **America/New_York** (tournament is scheduled in ET).
 * Using the raw ISO date prefix only (UTC calendar day) mis-buckets late-night games (e.g. S16 vs E8).
 */
export function parseEspnDateToYyyymmdd(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}${m[2]}${m[3]}` : "";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const mo = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !mo || !day) return "";
  return `${y}${mo.padStart(2, "0")}${day.padStart(2, "0")}`;
}

export function tournamentRoundKeyFromDate(isoDate: string): TournamentRoundKey | null {
  const ymd = parseEspnDateToYyyymmdd(isoDate);
  if (!ymd) return null;
  for (const key of ROUND_ORDER) {
    if (TOURNAMENT_DATES[key].includes(ymd)) return key;
  }
  return null;
}

export function tournamentRoundLabel(key: TournamentRoundKey | null): string {
  if (!key) return "Other NCAA games";
  return ROUND_LABELS[key];
}

export type RoundGroup = {
  key: TournamentRoundKey | "other";
  label: string;
  games: LiveGame[];
};

/**
 * Bucket scoreboard games by known March Madness calendar days; everything else is "Other NCAA games".
 */
export function groupGamesByTournamentRound(games: LiveGame[]): RoundGroup[] {
  const buckets = new Map<TournamentRoundKey | "other", LiveGame[]>();
  for (const k of ROUND_ORDER) buckets.set(k, []);
  buckets.set("other", []);

  for (const g of games) {
    const rk = tournamentRoundKeyFromDate(g.date);
    const bucketKey = rk ?? "other";
    buckets.get(bucketKey)!.push(g);
  }

  const order: (TournamentRoundKey | "other")[] = [...ROUND_ORDER, "other"];
  return order
    .map((key) => ({
      key,
      label: key === "other" ? "Other NCAA games" : ROUND_LABELS[key],
      games: buckets.get(key) ?? [],
    }))
    .filter((row) => row.games.length > 0);
}

export function sortGamesBySchedule(games: LiveGame[]): LiveGame[] {
  return [...games].sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    if (ta !== tb) return ta - tb;
    return a.shortName.localeCompare(b.shortName);
  });
}

export interface TournamentDay {
  label: string;
  date: string; // YYYY-MM-DD
  round: string;
  hasGames: boolean;
}

export const TOURNAMENT_DAYS_2026: TournamentDay[] = [
  { label: "TUE", date: "2026-03-17", round: "First Four", hasGames: true },
  { label: "WED", date: "2026-03-18", round: "First Four", hasGames: true },
  { label: "THU", date: "2026-03-19", round: "Round of 64", hasGames: true },
  { label: "FRI", date: "2026-03-20", round: "Round of 64", hasGames: true },
  { label: "SAT", date: "2026-03-21", round: "Round of 32", hasGames: true },
  { label: "SUN", date: "2026-03-22", round: "Round of 32", hasGames: true },
  { label: "THU", date: "2026-03-26", round: "Sweet 16", hasGames: true },
  { label: "FRI", date: "2026-03-27", round: "Sweet 16", hasGames: true },
  { label: "SAT", date: "2026-03-28", round: "Elite 8", hasGames: true },
  { label: "SUN", date: "2026-03-29", round: "Elite 8", hasGames: true },
  { label: "SAT", date: "2026-04-04", round: "Final Four", hasGames: true },
  { label: "MON", date: "2026-04-06", round: "Championship", hasGames: true },
];

/** Women's / date-only round labels (ET calendar day). Men's live classification uses matchup table. */
export const DATE_TO_ROUND: Record<string, string> = {
  "2026-03-17": "First Four",
  "2026-03-18": "First Four",
  "2026-03-19": "R64",
  "2026-03-20": "R64",
  "2026-03-21": "R32",
  "2026-03-22": "R32",
  "2026-03-23": "R32",
  "2026-03-26": "S16",
  "2026-03-27": "S16",
  "2026-03-28": "E8",
  "2026-03-29": "E8",
  "2026-04-04": "F4",
  "2026-04-06": "CHAMP",
};

/** @deprecated Prefer `classifyRoundFromGame` from `@/lib/roundClassification` for games with team names. */
export function classifyRound(gameDate: string): string {
  const ymd = parseEspnDateToYyyymmdd(gameDate);
  if (ymd.length !== 8) return "Unknown";
  const key = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  return DATE_TO_ROUND[key] ?? "Unknown";
}

export const UPCOMING_GAME_PREVIEWS: Record<string, string[]> = {
  "2026-03-26": [
    "(2) Purdue vs (11) Texas — 7:10 PM ET · CBS",
    "(9) Iowa vs (4) Nebraska — 7:30 PM ET · TBS",
    "(1) Arizona vs (4) Arkansas — 9:45 PM ET · CBS",
    "(2) Houston vs (3) Illinois — 10:05 PM ET · TBS",
  ],
  "2026-03-27": [
    "(1) Duke vs (5) St. John's — 7:10 PM ET · CBS",
    "(1) Michigan vs (4) Alabama — 7:35 PM ET · TBS",
    "(2) UConn vs (3) Michigan State — 9:45 PM ET · CBS",
    "(2) Iowa State vs (6) Tennessee — 10:10 PM ET · TBS",
  ],
  "2026-03-28": [
    "Elite Eight — TBD matchups",
    "4 games · CBS/TBS",
  ],
  "2026-03-29": [
    "Elite Eight — TBD matchups",
    "4 games · CBS/TBS",
  ],
};

export function getDayStripTabs(today: string): TournamentDay[] {
  const todayEntry = TOURNAMENT_DAYS_2026.find((d) => d.date === today);
  if (todayEntry) {
    return [
      { ...todayEntry, label: "TODAY" },
      ...TOURNAMENT_DAYS_2026.filter((d) => d.date > today).slice(0, 4),
    ];
  }
  const previous = TOURNAMENT_DAYS_2026.filter((d) => d.date < today).slice(-2);
  const upcoming = TOURNAMENT_DAYS_2026.filter((d) => d.date > today).slice(0, 2);
  return [
    { label: "TODAY", date: today, round: "No games", hasGames: false },
    ...previous,
    ...upcoming,
  ];
}

export function getDefaultDate(today: string): string {
  const sameDay = TOURNAMENT_DAYS_2026.find((d) => d.date === today && d.hasGames);
  if (sameDay) return sameDay.date;
  const prev = [...TOURNAMENT_DAYS_2026].reverse().find((d) => d.date < today && d.hasGames);
  if (prev) return prev.date;
  const next = TOURNAMENT_DAYS_2026.find((d) => d.date > today && d.hasGames);
  return next?.date ?? today;
}
