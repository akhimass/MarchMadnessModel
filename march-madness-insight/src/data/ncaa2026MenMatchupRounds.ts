/**
 * 2026 NCAA Men's Tournament — round classification by **matchup identity** (not calendar alone).
 * Schedule source: operator-provided bracket (First Four through Sweet 16).
 * Elite 8 / Final Four / Championship: fall back to date when pair not in table yet.
 */
import type { LiveGame } from "@/lib/espnApi";
import { TOURNAMENT_DATES } from "@/lib/espnApi";
import { parseEspnDateToYyyymmdd } from "@/lib/tournamentRounds";

export type ScoreboardRoundKey = "FF" | "R64" | "R32" | "S16" | "E8" | "F4" | "CHAMP";

/** Sorted pair key "a|b" with canonical school slugs */
const PAIR_TO_ROUND = new Map<string, ScoreboardRoundKey>();

function addPair(a: string, b: string, round: ScoreboardRoundKey) {
  const x = a < b ? a : b;
  const y = a < b ? b : a;
  PAIR_TO_ROUND.set(`${x}|${y}`, round);
}

/** Build canonical slug from ESPN-ish display name (seed prefix optional). */
export function canonTeamSlug(raw: string): string {
  let s = raw
    .replace(/^\([^)]*\)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  s = s.replace(/['’.]/g, "");
  s = s.replace(/&/g, " and ");
  // Drop common mascot tails (keep school)
  s = s.replace(
    /\s+(wildcats|huskies|spartans|longhorns|boilermakers|cyclones|volunteers|red storm|blue devils|fighting illini|cornhuskers|crimson tide|razorbacks|cougars|fighting irish|golden eagles|hawkeyes|bluejays|bulldogs|tigers|mustangs|lobos|jayhawks|aggies|buckeyes|rebels|trojans|bruins|cardinals|owls|rams|bearcats|raiders|flyers|wolf pack|aztecs|blazers|panthers|paladins|saints|skyhawks|seahawks|governors|terriers|eagles|bison|knights|lancers|dragons|catamounts|broncos|buffaloes|zips|lobos|cowboys|antelopes|golden grizzlies|red wolves|fighting camels|pirates|crimson|wave|u)$/gi,
    "",
  );
  s = s.replace(/[^a-z0-9 ]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  const aliases: Record<string, string> = {
    unc: "north carolina",
    "north carolina tar heels": "north carolina",
    "st johns": "st john s",
    "st. john s": "st john s",
    "st john's": "st john s",
    "st. john's": "st john s",
    "saint louis billikens": "saint louis",
    "saint mary s": "saint marys",
    "saint mary's": "saint marys",
    "st mary s": "saint marys",
    "st. mary's": "saint marys",
    "texas a m": "texas am",
    "texas a&m": "texas am",
    "miami fl": "miami fl",
    "miami florida": "miami fl",
    "miami fla": "miami fl",
    "miami oh": "miami ohio",
    "miami ohio": "miami ohio",
    "miami university": "miami ohio",
    "long island": "long island",
    "liu sharks": "long island",
    "liu": "long island",
    "uab": "uab",
    "southern methodist": "smu",
    "smu mustangs": "smu",
    "uni": "northern iowa",
    "northern iowa panthers": "northern iowa",
    "penn quakers": "penn",
    "pennsylvania": "penn",
    "ucf knights": "ucf",
    "central florida": "ucf",
    "idaho vandals": "idaho",
    "queens royals": "queens",
    "wright state raiders": "wright state",
    "tennessee state tigers": "tennessee state",
    "hofstra pride": "hofstra",
    "troy trojans": "troy",
    "south florida bulls": "south florida",
    "usf": "south florida",
    "cal baptist": "cal baptist",
    "california baptist": "cal baptist",
    "kennesaw state owls": "kennesaw state",
    "kennesaw": "kennesaw state",
    "prairie view": "prairie view am",
    "prairie view a m": "prairie view am",
    "umbc retrievers": "umbc",
    "hawaii rainbow warriors": "hawaii",
    "hawai i": "hawaii",
    "santa clara broncos": "santa clara",
    "furman paladins": "furman",
    "north dakota state bison": "north dakota state",
    "mcneese cowboys": "mcneese",
    "mcneese state": "mcneese",
    "high point panthers": "high point",
    "siena saints": "siena",
    "akron zips": "akron",
    "villanova wildcats": "villanova",
    "georgia bulldogs": "georgia",
    "missouri tigers": "missouri",
    "clemson tigers": "clemson",
    "wisconsin badgers": "wisconsin",
    "kentucky wildcats": "kentucky",
    "arizona wildcats": "arizona",
    "florida gators": "florida",
    "kansas jayhawks": "kansas",
    "duke blue devils": "duke",
    "gonzaga bulldogs": "gonzaga",
    "houston cougars": "houston",
    "purdue boilermakers": "purdue",
    "illinois fighting illini": "illinois",
    "alabama crimson tide": "alabama",
    "iowa hawkeyes": "iowa",
    "nebraska cornhuskers": "nebraska",
    "texas longhorns": "texas",
    "byu cougars": "byu",
    "ucla bruins": "ucla",
    "uconn huskies": "uconn",
    connecticut: "uconn",
    "michigan wolverines": "michigan",
    "michigan state spartans": "michigan state",
    "iowa state cyclones": "iowa state",
    "tennessee volunteers": "tennessee",
    "virginia cavaliers": "virginia",
    "texas tech red raiders": "texas tech",
    "utah state aggies": "utah state",
    "vcu rams": "vcu",
    "louisville cardinals": "louisville",
    "vanderbilt commodores": "vanderbilt",
    "tcu horned frogs": "tcu",
    "ohio state buckeyes": "ohio state",
    "saint louis": "saint louis",
    "arkansas razorbacks": "arkansas",
  };

  let key = s.replace(/\s+/g, " ").trim();
  if (aliases[key]) return aliases[key];
  // First 3 words max for long names
  const parts = key.split(" ").filter(Boolean);
  if (parts.length > 4) key = parts.slice(0, 3).join(" ");
  if (key.includes("st john") || key.includes("st. john")) return "st johns";
  if (key.includes("miami") && key.includes("ohio")) return "miami ohio";
  if (key.includes("miami") && (key.includes("fl") || key.includes("fla"))) return "miami fl";
  return key;
}

function pairKeyFromSlugs(a: string, b: string): string {
  const x = canonTeamSlug(a);
  const y = canonTeamSlug(b);
  const lo = x < y ? x : y;
  const hi = x < y ? y : x;
  return `${lo}|${hi}`;
}

// ─── First Four — Tue Mar 17 / Wed Mar 18 ───────────────────────────────────
addPair("Howard", "UMBC", "FF");
addPair("Texas", "NC State", "FF");
addPair("Prairie View A&M", "Lehigh", "FF");
addPair("Miami (Ohio)", "SMU", "FF");

// ─── Round of 64 — Thu Mar 19 ────────────────────────────────────────────────
// East
addPair("Duke", "Siena", "R64");
addPair("UConn", "Furman", "R64");
addPair("Michigan State", "North Dakota State", "R64");
addPair("Kansas", "Cal Baptist", "R64");
// South
addPair("Florida", "Prairie View A&M", "R64");
addPair("Houston", "Idaho", "R64");
addPair("Illinois", "Penn", "R64");
addPair("Nebraska", "Troy", "R64");
// West
addPair("Arizona", "Long Island University", "R64");
addPair("Purdue", "Queens", "R64");
addPair("Gonzaga", "Kennesaw State", "R64");
addPair("Arkansas", "Hawai'i", "R64");
// Midwest
addPair("Michigan", "Howard", "R64");
addPair("Iowa State", "Tennessee State", "R64");
addPair("Virginia", "Wright State", "R64");
addPair("Alabama", "Hofstra", "R64");

// ─── Round of 64 — Fri Mar 20 ────────────────────────────────────────────────
// East
addPair("St. John's", "UNI", "R64");
addPair("Louisville", "South Florida", "R64");
addPair("UCLA", "UCF", "R64");
addPair("Ohio State", "TCU", "R64");
// South
addPair("Vanderbilt", "McNeese", "R64");
addPair("North Carolina", "VCU", "R64");
addPair("Texas A&M", "Saint Mary's", "R64");
addPair("Iowa", "Clemson", "R64");
// West
addPair("Wisconsin", "High Point", "R64");
addPair("BYU", "Texas", "R64");
addPair("Miami (Fla.)", "Missouri", "R64");
addPair("Utah State", "Villanova", "R64");
// Midwest
addPair("Texas Tech", "Akron", "R64");
addPair("Tennessee", "Miami (Ohio)", "R64");
addPair("Kentucky", "Santa Clara", "R64");
addPair("Georgia", "Saint Louis", "R64");

// ─── Round of 32 — Sat Mar 21 ────────────────────────────────────────────────
// East upper (1/16/8/9 bracket)
addPair("Duke", "Ohio State", "R32");
addPair("Duke", "TCU", "R32");
// East upper (4/13/5/12 bracket)
addPair("Kansas", "St. John's", "R32");
addPair("Kansas", "Northern Iowa", "R32");
// South upper
addPair("Florida", "Clemson", "R32");
addPair("Florida", "Iowa", "R32");
addPair("Nebraska", "Vanderbilt", "R32");
addPair("Nebraska", "McNeese", "R32");
// West upper
addPair("Arizona", "Villanova", "R32");
addPair("Arizona", "Utah State", "R32");
addPair("Arkansas", "Wisconsin", "R32");
addPair("Arkansas", "High Point", "R32");
// Midwest upper
addPair("Michigan", "Georgia", "R32");
addPair("Michigan", "Saint Louis", "R32");
addPair("Alabama", "Texas Tech", "R32");
addPair("Alabama", "Akron", "R32");

// ─── Round of 32 — Sun Mar 22 / Mon Mar 23 ──────────────────────────────────
// East lower (3/14/6/11 bracket)
addPair("Michigan State", "Louisville", "R32");
addPair("Michigan State", "South Florida", "R32");
// East lower (2/15/7/10 bracket)
addPair("UConn", "UCLA", "R32");
addPair("UConn", "UCF", "R32");
// South lower
addPair("Illinois", "North Carolina", "R32");
addPair("Illinois", "VCU", "R32");
addPair("Houston", "Saint Mary's", "R32");
addPair("Houston", "Texas A&M", "R32");
// West lower
addPair("Gonzaga", "BYU", "R32");
addPair("Gonzaga", "Texas", "R32");
addPair("Purdue", "Miami (Fla.)", "R32");
addPair("Purdue", "Missouri", "R32");
// Midwest lower
addPair("Virginia", "Tennessee", "R32");
addPair("Virginia", "Miami (Ohio)", "R32");
addPair("Iowa State", "Kentucky", "R32");
addPair("Iowa State", "Santa Clara", "R32");

// ─── Sweet 16 — Thu Mar 26 / Fri Mar 27 ─────────────────────────────────────
// East: upper (1/16/8/9 vs 4/13/5/12) and lower (6/11/3/14 vs 7/10/2/15)
addPair("Duke", "Kansas", "S16");
addPair("Michigan State", "UConn", "S16");
// South
addPair("Florida", "Nebraska", "S16");
addPair("Illinois", "Houston", "S16");
// West
addPair("Arizona", "Arkansas", "S16");
addPair("Gonzaga", "Purdue", "S16");
// Midwest
addPair("Michigan", "Alabama", "S16");
addPair("Virginia", "Iowa State", "S16");

/** Strict matchup classification (null if unknown pair). */
export function inferMenRoundFromMatchup(awayName: string, homeName: string): ScoreboardRoundKey | null {
  const pk = pairKeyFromSlugs(awayName, homeName);
  return PAIR_TO_ROUND.get(pk) ?? null;
}

/**
 * When a pair isn't in `PAIR_TO_ROUND`, bucket by **ET calendar day** (same windows as `TOURNAMENT_DATES`).
 * Previously we only fell back for E8/F4/Champ — unknown R64 pairs on those dates could be mislabeled E8.
 */
function inferRoundFromCalendarDate(ymd: string): ScoreboardRoundKey | null {
  if (!ymd || ymd.length !== 8) return null;
  if (TOURNAMENT_DATES.firstFour.includes(ymd)) return "FF";
  if (TOURNAMENT_DATES.roundOf64.includes(ymd)) return "R64";
  if (TOURNAMENT_DATES.roundOf32.includes(ymd)) return "R32";
  if (TOURNAMENT_DATES.sweet16.includes(ymd)) return "S16";
  if (TOURNAMENT_DATES.elite8.includes(ymd)) return "E8";
  if (TOURNAMENT_DATES.finalFour.includes(ymd)) return "F4";
  if (TOURNAMENT_DATES.championship.includes(ymd)) return "CHAMP";
  return null;
}

/** Men's round: matchup identity table first; else ET calendar day → round. */
export function inferMenScoreboardRound(game: LiveGame): ScoreboardRoundKey | null {
  const m = inferMenRoundFromMatchup(game.away.name, game.home.name);
  if (m) return m;
  const ymd = parseEspnDateToYyyymmdd(game.date);
  return inferRoundFromCalendarDate(ymd);
}
