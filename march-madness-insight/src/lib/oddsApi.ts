/** The Odds API — NCAA basketball: https://the-odds-api.com/sports-odds-data/basketball-odds.html */
import type { Team2026Row } from "@/lib/api";
import { menTeams2026 } from "@/data/teams2026";
import { oddsNameToKaggle } from "@/lib/oddsNameMap";
import { TOURNAMENT_DATES } from "@/lib/espnApi";
import { parseEspnDateToYyyymmdd } from "@/lib/tournamentRounds";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const SPORT = "basketball_ncaab";

export interface OddsApiMeta {
  games: OddsGame[];
  requestsRemaining?: string | null;
  requestsUsed?: string | null;
}

export interface OddsGame {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  sport_key?: string;
  sport_title?: string;
  roundLabel?: string;
  broadcast?: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: "h2h" | "spreads" | "totals";
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

type Sweet16Mock = {
  home: string;
  away: string;
  homeOdds: number;
  awayOdds: number;
  homeSpread: number;
  awaySpread: number;
  time: string;
  broadcast: string;
};

// 2026 Men's Sweet 16 — official-style slate (Thu Mar 26 / Fri Mar 27 ET).
// UTC times set so America/New_York calendar day stays on 20260326 / 20260327 for `inferNcaaRoundFromCommence`.
const S16_GAMES: Sweet16Mock[] = [
  // Thu Mar 26
  { home: "Purdue Boilermakers",      away: "Texas Longhorns",          homeOdds: -185, awayOdds: 158, homeSpread: -4.5, awaySpread: 4.5,  time: "2026-03-26T23:10:00Z", broadcast: "CBS" },
  { home: "Nebraska Cornhuskers",     away: "Iowa Hawkeyes",            homeOdds: -125, awayOdds: 108, homeSpread: -1.5, awaySpread: 1.5,  time: "2026-03-26T23:30:00Z", broadcast: "TBS/truTV" },
  { home: "Arizona Wildcats",         away: "Arkansas Razorbacks",      homeOdds: -240, awayOdds: 200, homeSpread: -7.0, awaySpread: 7.0,  time: "2026-03-27T01:45:00Z", broadcast: "CBS" },
  { home: "Houston Cougars",          away: "Illinois Fighting Illini", homeOdds: -160, awayOdds: 138, homeSpread: -3.5, awaySpread: 3.5,  time: "2026-03-27T02:05:00Z", broadcast: "TBS/truTV" },
  // Fri Mar 27
  { home: "Duke Blue Devils",         away: "St. John's Red Storm",     homeOdds: -280, awayOdds: 235, homeSpread: -6.5, awaySpread: 6.5,  time: "2026-03-27T23:10:00Z", broadcast: "CBS" },
  { home: "Michigan Wolverines",      away: "Alabama Crimson Tide",     homeOdds: -210, awayOdds: 178, homeSpread: -5.5, awaySpread: 5.5,  time: "2026-03-27T23:35:00Z", broadcast: "TBS/truTV" },
  { home: "Connecticut Huskies",      away: "Michigan State Spartans",  homeOdds: -165, awayOdds: 142, homeSpread: -3.5, awaySpread: 3.5,  time: "2026-03-28T01:45:00Z", broadcast: "CBS" },
  { home: "Iowa State Cyclones",      away: "Tennessee Volunteers",     homeOdds: -155, awayOdds: 132, homeSpread: -3.0, awaySpread: 3.0,  time: "2026-03-28T02:10:00Z", broadcast: "TBS/truTV" },
];

export function generateMockOdds(): OddsGame[] {
  return S16_GAMES.map((g, i) => ({
    id: `mock_s16_${i}`,
    sport_key: "basketball_ncaab",
    sport_title: "NCAAB",
    commence_time: g.time,
    home_team: g.home,
    away_team: g.away,
    roundLabel: "Sweet 16",
    broadcast: g.broadcast,
    bookmakers: [
      {
        key: "draftkings",
        title: "DraftKings",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: g.home, price: g.homeOdds },
              { name: g.away, price: g.awayOdds },
            ],
          },
          {
            key: "spreads",
            outcomes: [
              { name: g.home, price: -110, point: g.homeSpread },
              { name: g.away, price: -110, point: g.awaySpread },
            ],
          },
        ],
      },
      {
        key: "fanduel",
        title: "FanDuel",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: g.home, price: g.homeOdds - 5 },
              { name: g.away, price: g.awayOdds + 5 },
            ],
          },
        ],
      },
    ],
  }));
}

export const MOCK_ODDS_GAMES: OddsGame[] = generateMockOdds();

export async function getLiveOdds(): Promise<OddsApiMeta> {
  const key = import.meta.env.VITE_ODDS_API_KEY as string | undefined;
  if (!key) {
    return { games: MOCK_ODDS_GAMES };
  }

  const url = `${ODDS_BASE}/sports/${SPORT}/odds?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Odds API error: ${r.status}`);
  const games = (await r.json()) as OddsGame[];
  const requestsRemaining = r.headers.get("x-requests-remaining");
  const requestsUsed = r.headers.get("x-requests-used");
  return { games, requestsRemaining, requestsUsed };
}

function normOddsStr(s: string | null | undefined): string {
  if (s == null || typeof s !== "string") return "";
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

/**
 * Stable pair id for de-duping / merging API rows vs canonical Sweet 16 mocks
 * (prefers Kaggle-style labels from `oddsNameToKaggle` when available).
 */
export function pairKeyForOddsGame(g: OddsGame): string {
  const ka = oddsNameToKaggle(g.home_team ?? "") ?? normOddsStr(g.home_team);
  const kb = oddsNameToKaggle(g.away_team ?? "") ?? normOddsStr(g.away_team);
  const [a, b] = [ka, kb].sort((x, y) => x.localeCompare(y));
  return `${a}||${b}`;
}

/**
 * The Odds API often returns an incomplete Sweet 16 slate (e.g. 7/8 games). Merge in the
 * canonical mock S16 games for any missing pair, preferring API rows when both exist.
 *
 * Returns **only** these 8 games — do not append the rest of the NCAAB feed (that caused
 * duplicate teams / wrong S16 pairings when many games share the same tournament dates).
 */
export function buildBettingOddsGameList(apiGames: OddsGame[]): OddsGame[] {
  if (!apiGames.length) return MOCK_ODDS_GAMES;
  const canonical = generateMockOdds();
  const s16Keys = new Set(canonical.map(pairKeyForOddsGame));
  const apiByS16Key = new Map<string, OddsGame>();
  for (const g of apiGames) {
    const k = pairKeyForOddsGame(g);
    if (s16Keys.has(k) && !apiByS16Key.has(k)) apiByS16Key.set(k, g);
  }
  return canonical.map((m) => {
    const api = apiByS16Key.get(pairKeyForOddsGame(m));
    if (!api) return m;
    // Keep books/prices from API but preserve canonical tip-off times. Odds API `commence_time`
    // often lands on adjacent UTC/ET dates vs our NCAA round buckets, which made every game
    // infer as "R64" and empty the Sweet 16 tab.
    return {
      ...api,
      commence_time: m.commence_time,
      roundLabel: m.roundLabel ?? api.roundLabel,
    };
  });
}

function tokenSet(s: string): Set<string> {
  return new Set(normOddsStr(s).split(/\s+/).filter(Boolean));
}

/** Match a our-side name to a book outcome (avoids "Michigan" matching Michigan St). */
export function outcomeMatchesTeamName(teamName: string | null | undefined, outcomeName: string | null | undefined): boolean {
  if (teamName == null || outcomeName == null || teamName === "" || outcomeName === "") return false;
  const kT = oddsNameToKaggle(teamName);
  const kO = oddsNameToKaggle(outcomeName);
  if (kT && kO && kT === kO) return true;
  const nt = normOddsStr(teamName);
  const no = normOddsStr(outcomeName);
  if (nt.length > 0 && nt === no) return true;
  const tTokens = tokenSet(teamName);
  const oTokens = tokenSet(outcomeName);
  let overlap = 0;
  for (const t of tTokens) if (oTokens.has(t)) overlap++;
  if (overlap >= 2) return true;
  if (overlap === 1 && tTokens.size === 1 && [...tTokens][0].length >= 4) return true;
  return false;
}

export function getConsensusOdds(
  game: OddsGame,
  teamName: string | null | undefined,
  market: "h2h" | "spreads" = "h2h",
): number | null {
  if (teamName == null || String(teamName).trim() === "") return null;
  const prices: number[] = [];
  for (const bm of game.bookmakers ?? []) {
    const mkt = bm.markets.find((m) => m.key === market);
    if (!mkt) continue;
    const outcome = mkt.outcomes.find((o) => outcomeMatchesTeamName(teamName, o.name));
    if (outcome) prices.push(outcome.price);
  }
  if (prices.length === 0) return null;
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  return Math.round(avg);
}

export type PortfolioProbRow = {
  game: OddsGame;
  home: { teamId: number; teamName?: string | null };
  away: { teamId: number; teamName?: string | null };
  homeProb: number | null;
  awayProb: number | null;
};

/**
 * Split full bankroll across games (one side per game) using the same edge-weighted rule as the AI slip.
 * Suggested amounts on the card sum to `bankroll` (rounded to whole dollars).
 */
export function fullBankrollSuggestedByGameId(
  rows: PortfolioProbRow[],
  bankroll: number,
): Map<string, { home: number; away: number }> {
  // Strategy:
  // - Bet on the model-favorite side only.
  // - Blend model probability with market implied probability (60/40) to maximize value.
  // - Cap effective model confidence to 70/30 so extreme favorites don't dominate sizing.
  const MIN_MODEL_FAV_PROB = 0.3;
  const MAX_MODEL_FAV_PROB = 0.7;
  const MODEL_WEIGHT = 0.6;
  const MARKET_WEIGHT = 0.4;
  const MODERATE_FAV_MIN = 0.5;
  const MODERATE_FAV_MAX = 0.6;

  const empty = new Map<string, { home: number; away: number }>();
  if (bankroll <= 0 || !rows.length) {
    for (const r of rows) empty.set(r.game.id, { home: 0, away: 0 });
    return empty;
  }

  const candidates = rows
    .map((row) => {
      const homeOdds = getConsensusOdds(row.game, row.game.home_team ?? "", "h2h");
      const awayOdds = getConsensusOdds(row.game, row.game.away_team ?? "", "h2h");
      if (homeOdds == null || awayOdds == null) return null;

      const hp = row.homeProb ?? 0.5;
      const ap = row.awayProb ?? 0.5;
      const modelFavSide = hp >= ap ? ("home" as const) : ("away" as const);
      const modelFavProb = modelFavSide === "home" ? hp : ap;
      const modelFavInModerateRange = modelFavProb >= MODERATE_FAV_MIN && modelFavProb <= MODERATE_FAV_MAX;

      const impliedHomeProb = americanToImpliedProb(homeOdds);
      const impliedAwayProb = americanToImpliedProb(awayOdds);

      // 60/40 blend for *each* side, then cap effective confidence to [0.3, 0.7].
      const blendedHome = MODEL_WEIGHT * hp + MARKET_WEIGHT * impliedHomeProb;
      const blendedAway = MODEL_WEIGHT * ap + MARKET_WEIGHT * impliedAwayProb;
      const cappedHome = Math.max(MIN_MODEL_FAV_PROB, Math.min(MAX_MODEL_FAV_PROB, blendedHome));
      const cappedAway = Math.max(MIN_MODEL_FAV_PROB, Math.min(MAX_MODEL_FAV_PROB, blendedAway));

      const edgeHome = cappedHome - impliedHomeProb;
      const edgeAway = cappedAway - impliedAwayProb;

      // If we're in the near coinflip band (50-60% model favorite),
      // bet the side with higher edge/value (not necessarily the model favorite).
      // Otherwise, default to model-favorite side.
      let chosenSide: "home" | "away";
      if (modelFavInModerateRange) {
        chosenSide = edgeHome >= edgeAway ? "home" : "away";
      } else {
        chosenSide = modelFavSide;
      }

      const chosenEdge = chosenSide === "home" ? edgeHome : edgeAway;
      return { gameId: row.game.id, side: chosenSide, edge: chosenEdge };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (!candidates.length) {
    for (const row of rows) empty.set(row.game.id, { home: 0, away: 0 });
    return empty;
  }

  // Guarantee every matchup has at least some suggested bet.
  const MIN_STAKE_PER_GAME = 10;
  const minStakePerGame = Math.min(MIN_STAKE_PER_GAME, Math.floor(bankroll / Math.max(1, candidates.length)));
  const baseStake = minStakePerGame * candidates.length;
  const remaining = Math.max(0, bankroll - baseStake);

  const weights = candidates.map((c) => Math.max(0.01, c.edge + 0.02));
  const sumW = weights.reduce((s, w) => s + w, 0);
  const rawExtra = weights.map((w) => (remaining * w) / sumW);
  const flooredExtra = rawExtra.map((x) => Math.floor(x));
  let extraRemainder = Math.max(0, remaining - flooredExtra.reduce((s, x) => s + x, 0));

  const fracIdx = rawExtra
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac)
    .map((x) => x.i);

  let k = 0;
  while (extraRemainder > 0 && fracIdx.length > 0) {
    flooredExtra[fracIdx[k % fracIdx.length]] += 1;
    extraRemainder -= 1;
    k += 1;
  }

  // Default: no bet on any game unless it's a qualified candidate.
  for (const row of rows) empty.set(row.game.id, { home: 0, away: 0 });
  candidates.forEach((c, i) => {
    const stake = Math.max(0, minStakePerGame + flooredExtra[i]);
    empty.set(c.gameId, {
      home: c.side === "home" ? stake : 0,
      away: c.side === "away" ? stake : 0,
    });
  });

  return empty;
}

export function americanToImpliedProb(americanOdds: number): number {
  if (americanOdds < 0) return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  return 100 / (americanOdds + 100);
}

export function americanToPotentialProfit(americanOdds: number, stake: number): number {
  if (americanOdds > 0) return stake * (americanOdds / 100);
  return stake * (100 / Math.abs(americanOdds));
}

export function calculateEV(ourProb: number, americanOdds: number, stake: number): number {
  const profit = americanToPotentialProfit(americanOdds, stake);
  return ourProb * profit - (1 - ourProb) * stake;
}

export function kellyBet(ourProb: number, americanOdds: number, bankroll: number): number {
  return kellyBetWithModifier(ourProb, americanOdds, bankroll, 0.25);
}

/** modifier: 0.25 conservative, 0.5 moderate, 1.0 aggressive */
export function kellyBetWithModifier(
  ourProb: number,
  americanOdds: number,
  bankroll: number,
  modifier: number,
): number {
  const impliedProb = americanToImpliedProb(americanOdds);
  const edge = ourProb - impliedProb;
  if (edge <= 0) return 0;
  const profitRatio = americanToPotentialProfit(americanOdds, 1);
  if (profitRatio <= 0) return 0;
  const kelly = edge / profitRatio;
  return Math.round(bankroll * kelly * modifier * 100) / 100;
}

export function inferNcaaRoundFromCommence(commenceIso: string, roundLabel?: string | null): string {
  const rl = String(roundLabel ?? "").toLowerCase();
  if (rl.includes("sweet")) return "S16";
  if (rl.includes("elite")) return "E8";
  if (rl.includes("final four") || rl === "final four") return "F4";
  if (rl.includes("championship") || rl.includes("national championship")) return "CHAMP";
  if (rl.includes("first four")) return "FF";

  const d = parseEspnDateToYyyymmdd(commenceIso);
  if (!d) return "R64";
  if (TOURNAMENT_DATES.firstFour.includes(d)) return "FF";
  if (TOURNAMENT_DATES.roundOf64.includes(d)) return "R64";
  if (TOURNAMENT_DATES.roundOf32.includes(d)) return "R32";
  if (TOURNAMENT_DATES.sweet16.includes(d)) return "S16";
  if (TOURNAMENT_DATES.elite8.includes(d)) return "E8";
  if (TOURNAMENT_DATES.finalFour.includes(d)) return "F4";
  if (TOURNAMENT_DATES.championship.includes(d)) return "CHAMP";
  return "R64";
}

/**
 * Resolve a 2026 men's tournament row from an Odds API / book display string using bundled
 * `menTeams2026` + `oddsNameToKaggle`. Used when `/api/teams/2026` is empty or still 503.
 */
export function team2026RowFromOddsName(oddsName: string | null | undefined): Team2026Row | null {
  if (oddsName == null || String(oddsName).trim() === "") return null;
  const kaggle = oddsNameToKaggle(oddsName);
  if (!kaggle) return null;
  const kn = kaggle.toLowerCase().replace(/['’.]/g, "'");
  const t = menTeams2026.find((x) => x.name.toLowerCase().replace(/['’.]/g, "'") === kn);
  if (!t) return null;
  return {
    teamId: t.id,
    teamName: t.name,
    seed: t.seed,
    seedStr: String(t.seed),
    region: t.region,
    gender: "M",
  };
}

export function matchTeamName(oddsName: string, ourTeams: string[]): string | null {
  const mapped = oddsNameToKaggle(oddsName);
  if (mapped) {
    const hit = ourTeams.find((t) => t.toLowerCase() === mapped.toLowerCase());
    if (hit) return hit;
    const hitK = ourTeams.find((t) => {
      const m = oddsNameToKaggle(t);
      return m != null && m.toLowerCase() === mapped.toLowerCase();
    });
    if (hitK) return hitK;
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const normOdds = norm(oddsName);
  const exact = ourTeams.find((t) => norm(t) === normOdds);
  if (exact) return exact;
  const firstWord = normOdds.split(" ")[0] ?? "";
  return ourTeams.find((t) => norm(t).startsWith(firstWord)) || null;
}
