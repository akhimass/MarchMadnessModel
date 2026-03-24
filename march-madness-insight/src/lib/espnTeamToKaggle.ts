import { menTeams2026 } from "@/data/teams2026";

/** Kaggle TeamID → abbreviation (men's tournament field). */
const KAGGLE_ID_BY_ABBR = new Map<string, number>();
for (const t of menTeams2026) {
  KAGGLE_ID_BY_ABBR.set(t.abbreviation.toUpperCase().replace(/\./g, ""), t.id);
}

/** NCAA scoreboard `char6` codes often differ from our bracket abbreviations. */
const NCAA_CHAR6_ALIASES: Record<string, string> = {
  // 2026 bracket teams — map NCAA char6 → our abbreviation
  HOUS: "HOU",    // Houston
  KENT: "UK",     // Kentucky
  ILLI: "ILL",    // Illinois
  AKRO: "AKR",    // Akron
  NEBR: "NEB",    // Nebraska
  WISC: "WIS",    // Wisconsin
  GONZ: "GONZ",   // Gonzaga
  CLEM: "CLEM",   // Clemson
  MCNE: "MCN",    // McNeese
  ARIZ: "ARIZ",   // Arizona
  MICH: "MICH",   // Michigan
  MISU: "MIZO",   // Missouri
  MISS: "MIZO",   // Missouri alt
  FLOR: "FLA",    // Florida
  KANS: "KU",     // Kansas
  DUKE: "DUKE",   // Duke
  UCON: "UCONN",  // UConn
  CONN: "UCONN",  // UConn alt
  VIRG: "UVA",    // Virginia
  TTEC: "TTU",    // Texas Tech
  TXTE: "TTU",    // Texas Tech alt
  VAND: "VAN",    // Vanderbilt
  VANDY: "VAN",   // Vanderbilt alt
  NCAR: "UNC",    // North Carolina
  TENN: "TENN",   // Tennessee
  LSVL: "LOU",    // Louisville
  SMMU: "SMC",    // Saint Mary's
  STMR: "SMC",    // Saint Mary's alt
  OHST: "OSU",    // Ohio St
  ARKS: "ARK",    // Arkansas
  TXAM: "TAMU",   // Texas A&M
  PRVU: "PVAM",   // Prairie View
  HWARD: "HOW",   // Howard
  NCST: "NCST",   // NC State — note: NC State not in top-64 (First Four)
  TEXA: "TEX",    // Texas
  IOWA: "IOWA",   // Iowa
  PURD: "PUR",    // Purdue
  UCFY: "UCF",    // UCF
  UCLA: "UCLA",   // UCLA
  // NCAA sometimes uses ultra-short char6 for well-known schools
  MS: "MSU",      // Michigan State
};

/** ESPN sometimes uses different abbreviations than our bracket data. */
const ESPN_ABBR_ALIASES: Record<string, string> = {
  UCONN: "UCONN",
  CONN: "UCONN",
  MICHST: "MSU",
  MSU: "MSU",
  MICH: "MICH",
  BYU: "BYU",
  USF: "USF",
  UNC: "UNC",
  PUR: "PUR",
  NEB: "NEB",
  ILL: "ILL",
  HOU: "HOU",
  BAMA: "ALA",
  TENN: "TENN",
  ARK: "ARK",
  VAN: "VAN",
  UK: "UK",
  UVA: "UVA",
  TTU: "TTU",
  VCU: "VCU",
  ISU: "ISU",
  STJ: "SJU",
  STJOHN: "SJU",
};

function normalizeAbbr(s: string): string {
  return s
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeName(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a men's tournament Kaggle TeamID from ESPN scoreboard abbrev (and optional display name).
 */
/** Prefer backend-resolved `kaggleId` from `/api/scoreboard/live` when present. */
export function resolveMenKaggleId(team: {
  kaggleId?: number | null;
  abbreviation: string;
  name: string;
}): number | null {
  const k = team.kaggleId;
  if (k != null && k > 0) return k;
  return kaggleIdFromEspnTeam(team.abbreviation, team.name);
}

export function kaggleIdFromEspnTeam(abbrev: string, displayName?: string): number | null {
  const raw = normalizeAbbr(abbrev);
  const char6 = NCAA_CHAR6_ALIASES[raw] ?? raw;
  const aliased = ESPN_ABBR_ALIASES[char6] ?? char6;
  const normalizedName = normalizeName(displayName ?? "");

  // Disambiguate schools sharing shorthand codes before direct-abbreviation lookup.
  // Most feeds use "MIA" for both Miami (FL) and Miami (OH).
  if (aliased === "MIA" || raw === "MIA") {
    if (normalizedName.includes("redhawks") || normalizedName.includes("miami oh")) return 1275; // Miami (OH)
    if (normalizedName.includes("hurricanes") || normalizedName.includes("miami fl")) return 1274; // Miami (FL)
  }

  const direct = KAGGLE_ID_BY_ABBR.get(aliased) ?? KAGGLE_ID_BY_ABBR.get(raw);
  if (direct != null) return direct;

  const normalized = normalizedName;
  const aliasName: Record<string, string> = {
    // ESPN full display names → our name field
    "connecticut huskies": "uconn",
    "michigan state spartans": "michigan st",
    "st johns red storm": "st john's",
    "iowa state cyclones": "iowa st",
    "duke blue devils": "duke",
    "north carolina tar heels": "north carolina",
    "florida gators": "florida",
    "houston cougars": "houston",
    "illinois fighting illini": "illinois",
    "nebraska cornhuskers": "nebraska",
    "arizona wildcats": "arizona",
    "purdue boilermakers": "purdue",
    "gonzaga bulldogs": "gonzaga",
    "arkansas razorbacks": "arkansas",
    "michigan wolverines": "michigan",
    "virginia cavaliers": "virginia",
    "alabama crimson tide": "alabama",
    "kentucky wildcats": "kentucky",
    "tennessee volunteers": "tennessee",
    "texas tech red raiders": "texas tech",
    "texas longhorns": "texas",
    "vanderbilt commodores": "vanderbilt",
    "iowa hawkeyes": "iowa",
    "kansas jayhawks": "kansas",
    "clemson tigers": "clemson",
    "georgia bulldogs": "georgia",
    "wisconsin badgers": "wisconsin",
    "louisville cardinals": "louisville",
    "ucla bruins": "ucla",
    "ohio state buckeyes": "ohio st",
    "ohio st buckeyes": "ohio st",
    "byu cougars": "byu",
    "miami hurricanes": "miami (fl)",
    "miami redhawks": "miami (oh)",
    "miami fl hurricanes": "miami fl",
    "miami oh redhawks": "miami oh",
    "prairie view panthers": "prairie view",
    "south florida bulls": "south florida",
    "northern iowa panthers": "northern iowa",
    "queens royals": "queens nc",
    "liu sharks": "liu brooklyn",
    "nc state wolfpack": "nc state",
    "saint marys gaels": "st mary's ca",
    "vcu rams": "vcu",
    "mcneese cowboys": "mcneese st",
    "high point panthers": "high point",
    "hofstra pride": "hofstra",
    "wright state raiders": "wright st",
    "tennessee state tigers": "tennessee st",
    "howard bison": "howard",
    "kennesaw state owls": "kennesaw",
    "st louis billikens": "st louis",
  };
  const target = normalizeName(aliasName[normalized] ?? normalized);
  for (const t of menTeams2026) {
    const tn = normalizeName(t.name);
    if (tn === target) return t.id;
    const tTokens = tn.split(" ");
    const targetTokens = target.split(" ");
    // Avoid collapsing distinct schools like "Texas" vs "Texas Tech" or "Iowa" vs "Iowa St".
    if (tTokens.length < 2 || targetTokens.length < 2) continue;
    const overlap = tTokens.filter((tok) => targetTokens.includes(tok)).length;
    if (overlap >= 2) return t.id;
  }
  return null;
}
