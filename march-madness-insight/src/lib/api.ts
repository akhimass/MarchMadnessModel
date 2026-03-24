import type { Team, MatchupPrediction, BracketMatchup } from "@/types/bracket";
import type { ApiBracketMatchupRow, RoundMatchupsApiResponse } from "@/lib/bracketApiTypes";

// ── Mock Teams ──
// East
const duke: Team         = { id: 1181, name: "Duke",          nickname: "Blue Devils",    abbreviation: "DUKE",  seed: 1,  region: "East",    record: "29-2",  conference: "ACC",         color: "#003087" };
const uconn: Team        = { id: 1163, name: "UConn",         nickname: "Huskies",        abbreviation: "UCONN", seed: 2,  region: "East",    record: "29-5",  conference: "Big East",    color: "#000E2F" };
const michiganSt: Team   = { id: 1277, name: "Michigan St",   nickname: "Spartans",       abbreviation: "MSU",   seed: 3,  region: "East",    record: "25-7",  conference: "Big Ten",     color: "#18453B" };
const kansas: Team       = { id: 1242, name: "Kansas",        nickname: "Jayhawks",       abbreviation: "KU",    seed: 4,  region: "East",    record: "23-10", conference: "Big 12",      color: "#0051BA" };
const stJohns: Team      = { id: 1385, name: "St John's",     nickname: "Red Storm",      abbreviation: "SJU",   seed: 5,  region: "East",    record: "29-6",  conference: "Big East",    color: "#C8102E" };
const louisville: Team   = { id: 1257, name: "Louisville",    nickname: "Cardinals",      abbreviation: "LOU",   seed: 6,  region: "East",    record: "23-10", conference: "ACC",         color: "#AD0000" };
const ucla: Team         = { id: 1417, name: "UCLA",          nickname: "Bruins",         abbreviation: "UCLA",  seed: 7,  region: "East",    record: "23-10", conference: "Big Ten",     color: "#2D68C4" };
const ohioSt: Team       = { id: 1326, name: "Ohio St",       nickname: "Buckeyes",       abbreviation: "OSU",   seed: 8,  region: "East",    record: "21-12", conference: "Big Ten",     color: "#BA0C2F" };
const tcu: Team          = { id: 1395, name: "TCU",           nickname: "Horned Frogs",   abbreviation: "TCU",   seed: 9,  region: "East",    record: "22-11", conference: "Big 12",      color: "#4D1979" };
const ucf: Team          = { id: 1416, name: "UCF",           nickname: "Knights",        abbreviation: "UCF",   seed: 10, region: "East",    record: "21-11", conference: "Big 12",      color: "#FFC904" };
const southFlorida: Team = { id: 1378, name: "South Florida", nickname: "Bulls",          abbreviation: "USF",   seed: 11, region: "East",    record: "25-8",  conference: "AAC",         color: "#006747" };
const northernIowa: Team = { id: 1320, name: "Northern Iowa", nickname: "Panthers",       abbreviation: "UNI",   seed: 12, region: "East",    record: "23-12", conference: "MVC",         color: "#4B116F" };
const calBaptist: Team   = { id: 1465, name: "Cal Baptist",   nickname: "Lancers",        abbreviation: "CBU",   seed: 13, region: "East",    record: "25-8",  conference: "WAC",         color: "#003DA5" };
const ndakotaSt: Team    = { id: 1295, name: "N Dakota St",   nickname: "Bison",          abbreviation: "NDSU",  seed: 14, region: "East",    record: "27-7",  conference: "Summit",      color: "#0A5640" };
const furman: Team       = { id: 1202, name: "Furman",        nickname: "Paladins",       abbreviation: "FUR",   seed: 15, region: "East",    record: "22-12", conference: "SoCon",       color: "#582C83" };
const siena: Team        = { id: 1373, name: "Siena",         nickname: "Saints",         abbreviation: "SIE",   seed: 16, region: "East",    record: "23-11", conference: "MAAC",        color: "#00572D" };

// South
const florida: Team      = { id: 1196, name: "Florida",           nickname: "Gators",        abbreviation: "FLA",   seed: 1,  region: "South",   record: "26-7",  conference: "SEC",         color: "#0021A5" };
const houston: Team      = { id: 1222, name: "Houston",           nickname: "Cougars",       abbreviation: "HOU",   seed: 2,  region: "South",   record: "30-2",  conference: "Big 12",      color: "#C8102E" };
const illinois: Team     = { id: 1228, name: "Illinois",          nickname: "Fighting Illini", abbreviation: "ILL", seed: 3,  region: "South",   record: "24-8",  conference: "Big Ten",     color: "#E84A27" };
const nebraska: Team     = { id: 1304, name: "Nebraska",          nickname: "Cornhuskers",   abbreviation: "NEB",   seed: 4,  region: "South",   record: "26-6",  conference: "Big Ten",     color: "#E41C38" };
const vanderbilt: Team   = { id: 1435, name: "Vanderbilt",        nickname: "Commodores",    abbreviation: "VAN",   seed: 5,  region: "South",   record: "26-8",  conference: "SEC",         color: "#866D4B" };
const northCarolina: Team= { id: 1314, name: "North Carolina",    nickname: "Tar Heels",     abbreviation: "UNC",   seed: 6,  region: "South",   record: "24-8",  conference: "ACC",         color: "#7BAFD4" };
const saintMarys: Team   = { id: 1388, name: "Saint Mary's",      nickname: "Gaels",         abbreviation: "SMC",   seed: 7,  region: "South",   record: "27-6",  conference: "WCC",         color: "#D80024" };
const clemson: Team      = { id: 1155, name: "Clemson",           nickname: "Tigers",        abbreviation: "CLEM",  seed: 8,  region: "South",   record: "24-10", conference: "ACC",         color: "#F56600" };
const iowa: Team         = { id: 1234, name: "Iowa",              nickname: "Hawkeyes",      abbreviation: "IOWA",  seed: 9,  region: "South",   record: "21-12", conference: "Big Ten",     color: "#FFCD00" };
const texasAM: Team      = { id: 1401, name: "Texas A&M",         nickname: "Aggies",        abbreviation: "TAMU",  seed: 10, region: "South",   record: "21-11", conference: "SEC",         color: "#500000" };
const vcu: Team          = { id: 1433, name: "VCU",               nickname: "Rams",          abbreviation: "VCU",   seed: 11, region: "South",   record: "27-7",  conference: "Atlantic 10", color: "#FFD100" };
const mcneese: Team      = { id: 1270, name: "McNeese",           nickname: "Cowboys",       abbreviation: "MCN",   seed: 12, region: "South",   record: "28-5",  conference: "Southland",   color: "#005CA9" };
const troy: Team         = { id: 1407, name: "Troy",              nickname: "Trojans",       abbreviation: "TROY",  seed: 13, region: "South",   record: "22-11", conference: "Sun Belt",    color: "#862633" };
const penn: Team         = { id: 1335, name: "Penn",              nickname: "Quakers",       abbreviation: "PENN",  seed: 14, region: "South",   record: "18-13", conference: "Ivy",         color: "#011F5B" };
const idaho: Team        = { id: 1225, name: "Idaho",             nickname: "Vandals",       abbreviation: "IDHO",  seed: 15, region: "South",   record: "22-10", conference: "Big Sky",     color: "#F1B82D" };
const prairieView: Team  = { id: 1341, name: "Prairie View A&M",  nickname: "Panthers",      abbreviation: "PVAM",  seed: 16, region: "South",   record: "18-17", conference: "SWAC",        color: "#4F2D7F" };

// West
const arizona: Team      = { id: 1112, name: "Arizona",     nickname: "Wildcats",    abbreviation: "ARIZ",  seed: 1,  region: "West",    record: "32-2",  conference: "Big 12",      color: "#CC0033" };
const purdue: Team       = { id: 1345, name: "Purdue",       nickname: "Boilermakers",abbreviation: "PUR",   seed: 2,  region: "West",    record: "27-8",  conference: "Big Ten",     color: "#CEB888" };
const gonzaga: Team      = { id: 1211, name: "Gonzaga",      nickname: "Bulldogs",    abbreviation: "GONZ",  seed: 3,  region: "West",    record: "30-3",  conference: "WCC",         color: "#002967" };
const arkansas: Team     = { id: 1116, name: "Arkansas",     nickname: "Razorbacks",  abbreviation: "ARK",   seed: 4,  region: "West",    record: "29-8",  conference: "SEC",         color: "#9D2235" };
const wisconsin: Team    = { id: 1458, name: "Wisconsin",    nickname: "Badgers",     abbreviation: "WIS",   seed: 5,  region: "West",    record: "24-10", conference: "Big Ten",     color: "#C5050C" };
const byu: Team          = { id: 1140, name: "BYU",          nickname: "Cougars",     abbreviation: "BYU",   seed: 6,  region: "West",    record: "23-11", conference: "Big 12",      color: "#002E5D" };
const miamiFL: Team      = { id: 1274, name: "Miami (FL)",   nickname: "Hurricanes",  abbreviation: "MIA",   seed: 7,  region: "West",    record: "25-8",  conference: "ACC",         color: "#005030" };
const villanova: Team    = { id: 1437, name: "Villanova",    nickname: "Wildcats",    abbreviation: "NOVA",  seed: 8,  region: "West",    record: "24-8",  conference: "Big East",    color: "#003E7E" };
const utahSt: Team       = { id: 1429, name: "Utah St",      nickname: "Aggies",      abbreviation: "USU",   seed: 9,  region: "West",    record: "29-6",  conference: "MWC",         color: "#0F2439" };
const missouri: Team     = { id: 1281, name: "Missouri",     nickname: "Tigers",      abbreviation: "MIZO",  seed: 10, region: "West",    record: "20-12", conference: "SEC",         color: "#F1B82D" };
const texas: Team        = { id: 1400, name: "Texas",        nickname: "Longhorns",   abbreviation: "TEX",   seed: 11, region: "West",    record: "18-14", conference: "SEC",         color: "#BF5700" };
const highPoint: Team    = { id: 1219, name: "High Point",   nickname: "Panthers",    abbreviation: "HPU",   seed: 12, region: "West",    record: "30-4",  conference: "Big South",   color: "#4B0082" };
const hawaii: Team       = { id: 1218, name: "Hawaii",       nickname: "Warriors",    abbreviation: "HAW",   seed: 13, region: "West",    record: "24-8",  conference: "Big West",    color: "#024731" };
const kennesawSt: Team   = { id: 1244, name: "Kennesaw St",  nickname: "Owls",        abbreviation: "KENN",  seed: 14, region: "West",    record: "21-13", conference: "ASUN",        color: "#FDBB30" };
const queensNC: Team     = { id: 1474, name: "Queens N.C.",  nickname: "Royals",      abbreviation: "QU",    seed: 15, region: "West",    record: "21-13", conference: "ASUN",        color: "#862633" };
const longIsland: Team   = { id: 1254, name: "Long Island",  nickname: "Sharks",      abbreviation: "LIU",   seed: 16, region: "West",    record: "24-10", conference: "NEC",         color: "#002D62" };

// Midwest
const michigan: Team     = { id: 1276, name: "Michigan",    nickname: "Wolverines",   abbreviation: "MICH",  seed: 1,  region: "Midwest", record: "31-3",  conference: "Big Ten",     color: "#00274C" };
const iowaSt: Team       = { id: 1235, name: "Iowa St",     nickname: "Cyclones",     abbreviation: "ISU",   seed: 2,  region: "Midwest", record: "27-7",  conference: "Big 12",      color: "#C8102E" };
const virginia: Team     = { id: 1438, name: "Virginia",    nickname: "Cavaliers",    abbreviation: "UVA",   seed: 3,  region: "Midwest", record: "29-5",  conference: "ACC",         color: "#232D4B" };
const alabama: Team      = { id: 1104, name: "Alabama",     nickname: "Crimson Tide", abbreviation: "ALA",   seed: 4,  region: "Midwest", record: "23-8",  conference: "SEC",         color: "#9E1B32" };
const texasTech: Team    = { id: 1403, name: "Texas Tech",  nickname: "Red Raiders",  abbreviation: "TTU",   seed: 5,  region: "Midwest", record: "22-11", conference: "Big 12",      color: "#CC0000" };
const tennessee: Team    = { id: 1397, name: "Tennessee",   nickname: "Volunteers",   abbreviation: "TENN",  seed: 6,  region: "Midwest", record: "22-11", conference: "SEC",         color: "#FF8200" };
const kentucky: Team     = { id: 1246, name: "Kentucky",    nickname: "Wildcats",     abbreviation: "UK",    seed: 7,  region: "Midwest", record: "21-13", conference: "SEC",         color: "#0033A0" };
const georgia: Team      = { id: 1208, name: "Georgia",     nickname: "Bulldogs",     abbreviation: "UGA",   seed: 8,  region: "Midwest", record: "22-10", conference: "SEC",         color: "#BA0C2F" };
const saintLouis: Team   = { id: 1387, name: "Saint Louis", nickname: "Billikens",    abbreviation: "SLU",   seed: 9,  region: "Midwest", record: "28-5",  conference: "Atlantic 10", color: "#003DA5" };
const santaClara: Team   = { id: 1365, name: "Santa Clara", nickname: "Broncos",      abbreviation: "SCU",   seed: 10, region: "Midwest", record: "29-8",  conference: "WCC",         color: "#862633" };
const miamiOH: Team      = { id: 1275, name: "Miami (OH)",  nickname: "RedHawks",     abbreviation: "MIOH",  seed: 11, region: "Midwest", record: "20-13", conference: "MAC",         color: "#B61E2E" };
const akron: Team        = { id: 1103, name: "Akron",       nickname: "Zips",         abbreviation: "AKR",   seed: 12, region: "Midwest", record: "29-5",  conference: "MAC",         color: "#041E42" };
const hofstra: Team      = { id: 1220, name: "Hofstra",     nickname: "Pride",        abbreviation: "HOF",   seed: 13, region: "Midwest", record: "24-10", conference: "CAA",         color: "#003DA5" };
const wrightSt: Team     = { id: 1460, name: "Wright St",   nickname: "Raiders",      abbreviation: "WRST",  seed: 14, region: "Midwest", record: "23-11", conference: "Horizon",     color: "#C5050C" };
const tennesseeSt: Team  = { id: 1398, name: "Tennessee St",nickname: "Tigers",       abbreviation: "TNST",  seed: 15, region: "Midwest", record: "23-9",  conference: "OVC",         color: "#004B8D" };
const howard: Team       = { id: 1224, name: "Howard",      nickname: "Bison",        abbreviation: "HOW",   seed: 16, region: "Midwest", record: "24-10", conference: "MEAC",        color: "#003A63" };

// ── Bracket Data ──
// Ordered in NCAA pod format: Pod1(1v16, 8v9) | Pod2(5v12, 4v13) | Pod3(6v11, 3v14) | Pod4(7v10, 2v15)
export const bracketData: Record<string, BracketMatchup[]> = {
  east: [
    // Pod 1
    { id: "duke-siena",           team1: duke,        team2: siena,        prob: 97, upsetFlag: false, gameTime: "3/19, 12:15 PM" },
    { id: "ohiost-tcu",           team1: ohioSt,      team2: tcu,          prob: 46, upsetFlag: true,  gameTime: "3/20, 9:40 PM"  },
    // Pod 2
    { id: "stjohns-northerniowa", team1: stJohns,     team2: northernIowa, prob: 63, upsetFlag: false, gameTime: "3/20, 12:15 PM" },
    { id: "kansas-calbaptist",    team1: kansas,      team2: calBaptist,   prob: 87, upsetFlag: false, gameTime: "3/19, 9:40 PM"  },
    // Pod 3
    { id: "louisville-sflorida",  team1: louisville,  team2: southFlorida, prob: 69, upsetFlag: false, gameTime: "3/20, 2:45 PM"  },
    { id: "michiganst-ndakotast", team1: michiganSt,  team2: ndakotaSt,    prob: 88, upsetFlag: false, gameTime: "3/19, 7:10 PM"  },
    // Pod 4
    { id: "ucla-ucf",             team1: ucla,        team2: ucf,          prob: 79, upsetFlag: false, gameTime: "3/20, 7:10 PM"  },
    { id: "uconn-furman",         team1: uconn,       team2: furman,       prob: 94, upsetFlag: false, gameTime: "3/19, 2:45 PM"  },
  ],
  south: [
    // Pod 1
    { id: "florida-pvam",         team1: florida,      team2: prairieView,  prob: 99, upsetFlag: false, gameTime: "3/19, 12:15 PM" },
    { id: "clemson-iowa",         team1: clemson,      team2: iowa,         prob: 46, upsetFlag: true,  gameTime: "3/20, 9:40 PM"  },
    // Pod 2
    { id: "vanderbilt-mcneese",   team1: vanderbilt,   team2: mcneese,      prob: 69, upsetFlag: false, gameTime: "3/20, 12:15 PM" },
    { id: "nebraska-troy",        team1: nebraska,     team2: troy,         prob: 86, upsetFlag: false, gameTime: "3/19, 9:40 PM"  },
    // Pod 3
    { id: "northcarolina-vcu",    team1: northCarolina,team2: vcu,          prob: 74, upsetFlag: false, gameTime: "3/20, 2:45 PM"  },
    { id: "illinois-penn",        team1: illinois,     team2: penn,         prob: 92, upsetFlag: false, gameTime: "3/19, 7:10 PM"  },
    // Pod 4
    { id: "saintmarys-texasam",   team1: saintMarys,   team2: texasAM,      prob: 66, upsetFlag: false, gameTime: "3/20, 7:10 PM"  },
    { id: "houston-idaho",        team1: houston,      team2: idaho,        prob: 97, upsetFlag: false, gameTime: "3/19, 2:45 PM"  },
  ],
  west: [
    // Pod 1
    { id: "arizona-liu",          team1: arizona,      team2: longIsland,   prob: 98, upsetFlag: false, gameTime: "3/19, 12:15 PM" },
    { id: "villanova-utahst",     team1: villanova,    team2: utahSt,       prob: 60, upsetFlag: false, gameTime: "3/20, 9:40 PM"  },
    // Pod 2
    { id: "wisconsin-highpoint",  team1: wisconsin,    team2: highPoint,    prob: 76, upsetFlag: false, gameTime: "3/20, 12:15 PM" },
    { id: "arkansas-hawaii",      team1: arkansas,     team2: hawaii,       prob: 92, upsetFlag: false, gameTime: "3/19, 9:40 PM"  },
    // Pod 3
    { id: "byu-texas",            team1: byu,          team2: texas,        prob: 74, upsetFlag: false, gameTime: "3/20, 2:45 PM"  },
    { id: "gonzaga-kennesawst",   team1: gonzaga,      team2: kennesawSt,   prob: 95, upsetFlag: false, gameTime: "3/19, 7:10 PM"  },
    // Pod 4
    { id: "miamifl-missouri",     team1: miamiFL,      team2: missouri,     prob: 73, upsetFlag: false, gameTime: "3/20, 7:10 PM"  },
    { id: "purdue-queensnc",      team1: purdue,       team2: queensNC,     prob: 97, upsetFlag: false, gameTime: "3/19, 2:45 PM"  },
  ],
  midwest: [
    // Pod 1
    { id: "michigan-howard",      team1: michigan,     team2: howard,       prob: 97, upsetFlag: false, gameTime: "3/19, 12:15 PM" },
    { id: "georgia-saintlouis",   team1: georgia,      team2: saintLouis,   prob: 40, upsetFlag: true,  gameTime: "3/20, 9:40 PM"  },
    // Pod 2
    { id: "texastech-akron",      team1: texasTech,    team2: akron,        prob: 78, upsetFlag: false, gameTime: "3/20, 12:15 PM" },
    { id: "alabama-hofstra",      team1: alabama,      team2: hofstra,      prob: 91, upsetFlag: false, gameTime: "3/19, 9:40 PM"  },
    // Pod 3
    { id: "tennessee-miamioh",    team1: tennessee,    team2: miamiOH,      prob: 72, upsetFlag: false, gameTime: "3/20, 2:45 PM"  },
    { id: "virginia-wrightst",    team1: virginia,     team2: wrightSt,     prob: 87, upsetFlag: false, gameTime: "3/19, 7:10 PM"  },
    // Pod 4
    { id: "kentucky-santaclara",  team1: kentucky,     team2: santaClara,   prob: 62, upsetFlag: false, gameTime: "3/20, 7:10 PM"  },
    { id: "iowast-tennesseest",   team1: iowaSt,       team2: tennesseeSt,  prob: 91, upsetFlag: false, gameTime: "3/19, 2:45 PM"  },
  ],
};


// ── Mock Matchup ──
const MOCK_MATCHUP: MatchupPrediction = {
  team1: duke,
  team2: siena,
  standardProb: 0.97,
  chaosProb: 0.94,
  modelBreakdown: {
    decision_tree: 0.95,
    power_ratings: 1.0,
    similar_games: 1.0,
    simulation: 1.0,
    seed_difference: 0.99,
    ensemble: 0.97,
  },
  upsetAlert: false,
  giantKillerScore: 0,
  team1Stats: {
    netEff: 28.5, offEff: 118.2, defEff: 89.7, efgOff: 0.568,
    efgDef: 0.462, toRate: 0.132, orRate: 0.365, ftRate: 0.378,
    masseyRank: 3, svi: 0.305, sviClass: "True Contender",
  },
  team2Stats: {
    netEff: -2.1, offEff: 107.1, defEff: 99.7, efgOff: 0.506,
    efgDef: 0.486, toRate: 0.138, orRate: 0.303, ftRate: 0.342,
    masseyRank: 193, svi: -0.02, sviClass: "Statistically Stable",
  },
  team1Narrative:
    "The Blue Devils are a rebounding machine, dominating the glass at +1.65 SD above average. They protect the ball at an elite level and take efficient shots without FT-line dependence — the exact profile the model favors for March.",
  team2Narrative:
    "The Saints excel at limiting opponent FT attempts and generating turnovers defensively, but their 279th-ranked schedule hasn't prepared them for this level.",
  injuryImpact: {
    adjustment: -0.08,
    severity: "high",
    keyPlayerOut: "Cooper Flagg",
    reasoning: "Ankle Sprain — Questionable. Star PF, 19.2 PPG.",
  },
};

// Team-specific matchup data lookup
const matchupDataMap: Record<string, Partial<MatchupPrediction>> = {};

// Build matchup overrides from bracket data
for (const region of Object.values(bracketData)) {
  for (const m of region) {
    const prob = m.prob / 100;
    matchupDataMap[m.id] = {
      team1: m.team1,
      team2: m.team2,
      standardProb: prob,
      chaosProb: prob - 0.03,
      modelBreakdown: {
        decision_tree: Math.max(0, prob - 0.02),
        power_ratings: Math.min(1, prob + 0.03),
        similar_games: Math.min(1, prob + 0.02),
        simulation: prob,
        seed_difference: Math.min(1, prob + 0.01),
        ensemble: prob,
      },
      upsetAlert: m.upsetFlag,
      giantKillerScore: m.upsetFlag ? Math.round((1 - prob) * 100) : 0,
    };
  }
}

export const fetchMatchup = async (matchupId: string): Promise<MatchupPrediction> => {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

  const parseTeamIds = (id: string): { team1Id: number; team2Id: number } | null => {
    const m = id.match(/^(\d+)-(\d+)$/);
    if (!m) return null;
    return { team1Id: parseInt(m[1], 10), team2Id: parseInt(m[2], 10) };
  };

  const deriveAbbreviation = (name: string): string => {
    const cleaned = String(name ?? "")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const abb = parts
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join("")
      .toUpperCase();
    return abb.length ? abb : "TEAM";
  };

  const logoFilenameFromName = (name: string): string => {
    // Matches filenames in `/teamlogo` (lowercase, no spaces, keep `()` and `&`).
    const normalized = String(name ?? "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/\./g, "")
      .replace(/\s+/g, "");
    const slug = normalized.replace(/[^a-z0-9()&]/g, "");

    // Aliases for teams whose Kaggle names don't match the logo basenames.
    const alias: Record<string, string> = {
      connecticut: "uconn",
      "michiganst": "michiganstate",
      ohiost: "ohiostate",
      southflorida: "usf",
      ndakotast: "northdakotastate",
      stmarysca: "saintmarys",
      mcneesest: "mcneese",
      prairieview: "praire",
      iowast: "iowastate",
      stlouis: "saintlouis",
      miamioh: "miami(oh)",
      smu: "SMU",
      wrightst: "wrightstate",
      tennesseest: "tennesseestate",
      miamifl: "miami",
      utahst: "utahstate",
      kennesaw: "kennesawstate",
      queensnc: "queens",
      liubrooklyn: "longisland",
    };

    return alias[slug] ?? slug;
  };

  const logoUrlFromName = (name: string): string => {
    const filename = logoFilenameFromName(name);
    return `${apiBase}/teamlogo/${encodeURIComponent(filename)}.png`;
  };

  const colorFromId = (teamId: number): string => {
    const hue = Math.abs(teamId) % 360;
    return `hsl(${hue} 70% 45%)`;
  };

  const getTeamsMap = async (g: "M" | "W") => {
    const cacheKey = `teams_${g}`;
    const anyWindow = window as Window & {
      __akhiTeamsCache?: Record<string, Map<number, Record<string, unknown>>>;
    };
    if (anyWindow.__akhiTeamsCache?.[cacheKey]) return anyWindow.__akhiTeamsCache[cacheKey];

    const res = await fetch(`${apiBase}/api/teams/2026?gender=${g}`);
    if (!res.ok) throw new Error(`teams request failed (${res.status})`);
    const teams: any[] = await res.json();
    const map = new Map<number, any>(teams.map((t) => [t.teamId as number, t]));

    anyWindow.__akhiTeamsCache = anyWindow.__akhiTeamsCache ?? {};
    anyWindow.__akhiTeamsCache[cacheKey] = map;
    return map;
  };

  const override = matchupDataMap[matchupId];
  const parsed = parseTeamIds(matchupId);

  // Prefer parsing matchupId (backend-driven). Otherwise fall back to demo overrides.
  const team1Id = parsed?.team1Id ?? override?.team1?.id;
  const team2Id = parsed?.team2Id ?? override?.team2?.id;
  if (!team1Id || !team2Id) return { ...MOCK_MATCHUP, injuryImpact: undefined } as MatchupPrediction;

  const gender: "M" | "W" = Math.max(team1Id, team2Id) >= 3000 ? "W" : "M";

  try {
    const matchupRes = await fetch(`${apiBase}/api/matchup/${team1Id}/${team2Id}?gender=${gender}`);

    if (!matchupRes.ok) throw new Error(`matchup request failed (${matchupRes.status})`);
    const matchupJson = await matchupRes.json();

    const t1 = matchupJson?.team1;
    const t2 = matchupJson?.team2;
    const mb = matchupJson?.model_breakdown;

    const toTeamStats = (t: any): MatchupPrediction["team1Stats"] => {
      const sviClass = (t?.SVI_category ?? "Statistically Stable") as MatchupPrediction["team1Stats"]["sviClass"];
      return {
        netEff: Number(t?.NetEff ?? 0),
        offEff: Number(t?.OffEff ?? 0),
        defEff: Number(t?.DefEff ?? 0),
        efgOff: Number(t?.eFG_off ?? 0),
        efgDef: Number(t?.eFG_def ?? 0),
        toRate: Number(t?.TO_rate_off ?? 0),
        orRate: Number(t?.OR_rate ?? 0),
        ftRate: Number(t?.FT_rate ?? 0),
        masseyRank: Number(t?.massey_rank ?? 0),
        svi: Number(t?.SVI ?? 0),
        sviClass,
      };
    };

    const injuryImpactFrom = (inj: any): MatchupPrediction["injuryImpact"] => {
      if (!inj) return undefined;
      const rawSeverity = String(inj.severity ?? "none");
      const allowed = new Set(["none", "low", "medium", "high", "critical"]);
      const severity = (allowed.has(rawSeverity) ? rawSeverity : "none") as any;
      return {
        adjustment: Number(inj.adjustment ?? 0),
        severity,
        keyPlayerOut: inj.key_player ?? null,
        reasoning: inj.reasoning ?? "",
      };
    };

    let uiTeam1: Team | undefined = override?.team1;
    let uiTeam2: Team | undefined = override?.team2;

    if (!uiTeam1 || !uiTeam2) {
      const teamsMap = await getTeamsMap(gender);
      const t1Lite = teamsMap.get(team1Id);
      const t2Lite = teamsMap.get(team2Id);

      const makeTeam = (lite: any, tid: number): Team => {
        const name = String(lite?.teamName ?? `Team ${tid}`);
        const seed = typeof lite?.seed === "number" ? lite.seed : 0;
        const region = (String(lite?.region ?? "East") as Team["region"]) ?? "East";
        return {
          id: tid,
          name,
          nickname: "",
          abbreviation: deriveAbbreviation(name),
          seed: Math.max(0, seed),
          region,
          record: "",
          conference: "",
          color: colorFromId(tid),
          logoUrl: logoUrlFromName(name),
        };
      };

      uiTeam1 = makeTeam(t1Lite, team1Id);
      uiTeam2 = makeTeam(t2Lite, team2Id);
    }

    const injuryImpact = injuryImpactFrom(matchupJson?.injury1);
    // Narratives use an LLM; omit them during normal browsing.
    const team1Narrative = "";
    const team2Narrative = "";

    return {
      team1: uiTeam1,
      team2: uiTeam2,
      standardProb: Number(matchupJson?.standard_prob ?? override?.standardProb ?? 0),
      chaosProb: Number(matchupJson?.chaos_prob ?? override?.chaosProb ?? 0),
      ordinalRanks: matchupJson?.ordinal_ranks as MatchupPrediction["ordinalRanks"] | undefined,
      modelBreakdown: {
        decision_tree: Number(mb?.decision_tree ?? 0),
        power_ratings: Number(mb?.power_ratings ?? 0),
        similar_games: Number(mb?.similar_games ?? 0),
        simulation: Number(mb?.simulation ?? 0),
        seed_difference: Number(mb?.seed_difference ?? 0),
        ensemble: Number(mb?.overall ?? Number(matchupJson?.standard_prob ?? 0)),
      },
      upsetAlert: Boolean(matchupJson?.upset_alert ?? false),
      giantKillerScore: Number(matchupJson?.giant_killer_score ?? 0),
      team1Stats: toTeamStats(t1),
      team2Stats: toTeamStats(t2),
      team1Narrative,
      team2Narrative,
      injuryImpact,
    };
  } catch (e) {
    console.warn("[fetchMatchup] backend call failed; falling back to mock data.", e);
    // IMPORTANT: don't show stale/mock injury banners if the backend failed.
    return { ...MOCK_MATCHUP, ...(override ?? {}), injuryImpact: undefined } as MatchupPrediction;
  }
};

export const fetchFirstRoundMatchups = async (
  gender: "M" | "W",
  season: number = 2026,
): Promise<unknown> => {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const res = await fetch(`${apiBase}/api/bracket/first-round?season=${season}&gender=${gender}`);
  if (!res.ok) throw new Error(`first-round request failed (${res.status})`);
  return res.json();
};

export const fetchRoundMatchups = async (
  stage: string,
  gender: "M" | "W",
  picks: Record<string, number>,
  season: number = 2026,
  opts?: { strictLive?: boolean },
): Promise<RoundMatchupsApiResponse> => {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const strictLive = Boolean(opts?.strictLive);

  const res = await fetch(
    `${apiBase}/api/bracket/round-matchups?season=${season}&gender=${gender}&strict_live=${strictLive ? "true" : "false"}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ stage, picks: picks ?? {} }),
    },
  );

  if (!res.ok) throw new Error(`round-matchups request failed (${res.status})`);
  return (await res.json()) as RoundMatchupsApiResponse;
};

/**
 * Ensemble win probability for the lower TeamID in the pair (matches `/api/matchup/{min}/{max}`).
 */
export async function fetchMatchupStandardProb(
  teamAKaggle: number,
  teamBKaggle: number,
  gender: "M" | "W",
): Promise<number | null> {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const lo = Math.min(teamAKaggle, teamBKaggle);
  const hi = Math.max(teamAKaggle, teamBKaggle);
  const res = await fetch(`${apiBase}/api/matchup/${lo}/${hi}?gender=${gender}`);
  if (!res.ok) return null;
  const j = (await res.json()) as { standard_prob?: number };
  return typeof j.standard_prob === "number" ? j.standard_prob : null;
}

export interface Team2026Row {
  teamId: number;
  teamName?: string | null;
  seed?: number;
  seedStr?: string;
  region?: string;
  gender?: string;
}

export async function fetchTeams2026(gender: "M" | "W" = "M"): Promise<Team2026Row[]> {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const res = await fetch(`${apiBase}/api/teams/2026?gender=${gender}`);
  if (!res.ok) throw new Error(`teams failed (${res.status})`);
  return res.json() as Promise<Team2026Row[]>;
}

export interface BracketSimulationResult {
  survival: Record<string, unknown>[];
  championship_odds: Record<string, number>;
  teams?: Array<{
    teamId: number;
    teamName: string;
    champProb: number;
    finalFourProb: number;
    elite8Prob: number;
    avgWins: number;
  }>;
}

export async function fetchBracketSimulation(
  n: number = 10_000,
  gender: "M" | "W" = "M",
): Promise<BracketSimulationResult> {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const res = await fetch(`${apiBase}/api/bracket/simulate?n=${n}&gender=${gender}`);
  if (!res.ok) throw new Error(`simulate failed (${res.status})`);
  return res.json() as Promise<BracketSimulationResult>;
}

export interface BracketAccuracyMetrics {
  gamesCorrect: number;
  gamesCompared: number;
  accuracy: number | null;
  brierScore: number | null;
  brierGames: number;
  championCorrect: boolean | null;
  finalFourOverlap: number | null;
}

export interface BracketAccuracyModelRow {
  id: string;
  label: string;
  metrics: BracketAccuracyMetrics | null;
  championTeamId: number | null;
  championTeamName: string | null;
}

export interface BracketAccuracyResponse {
  season: number;
  gender: string;
  truthAvailable: boolean;
  truthGameCount: number;
  truthSources: { fromCompactCsv: number; fromJsonFile: number };
  models: BracketAccuracyModelRow[];
}

export async function fetchBracketAccuracy(
  gender: "M" | "W" = "M",
  season: number = 2026,
): Promise<BracketAccuracyResponse> {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const res = await fetch(`${apiBase}/api/bracket/accuracy?gender=${gender}&season=${season}`);
  if (!res.ok) throw new Error(`bracket accuracy failed (${res.status})`);
  return res.json() as Promise<BracketAccuracyResponse>;
}

export interface TournamentResultRow {
  season: number;
  dayNum: number;
  wTeamId: number;
  lTeamId: number;
  wScore: number;
  lScore: number;
  gender?: string;
  round?: string | null;
  source?: string;
}

export async function fetchTournamentResults(
  season: number = 2026,
  gender: "M" | "W" = "M",
): Promise<TournamentResultRow[]> {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const res = await fetch(`${apiBase}/api/results/${season}?gender=${gender}`);
  if (!res.ok) throw new Error(`results failed (${res.status})`);
  return res.json() as Promise<TournamentResultRow[]>;
}

export async function fetchFavoritePicks(
  gender: "M" | "W" = "M",
  chaos = false,
): Promise<{ season: number; gender: string; picks: Record<string, number> }> {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const res = await fetch(`${apiBase}/api/bracket/favorite-picks?gender=${gender}&chaos=${chaos}`);
  if (!res.ok) throw new Error(`favorite-picks failed (${res.status})`);
  return res.json() as Promise<{ season: number; gender: string; picks: Record<string, number> }>;
}

export interface ModelPerformanceResponse {
  ensemble?: { brier?: number; accuracy?: number; label?: string };
  subModels?: Array<{
    id: string;
    name: string;
    weight: number;
    brier: number;
    accuracy: number;
    bestAt?: string;
  }>;
  featureImportance?: Array<{ feature: string; importance: number; label?: string }>;
  historicalCalibration?: Array<{
    bucket: string;
    predicted: number;
    actual: number;
    n: number;
  }>;
  notes?: string;
}

export interface OrdinalSystemsResponse {
  count: number;
  systems: string[];
  notes?: string;
}

export async function fetchModelPerformance(): Promise<ModelPerformanceResponse> {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const res = await fetch(`${apiBase}/api/model/performance`);
  if (!res.ok) throw new Error(`model performance failed (${res.status})`);
  return res.json() as Promise<ModelPerformanceResponse>;
}

export async function fetchOrdinalSystems(): Promise<OrdinalSystemsResponse> {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const res = await fetch(`${apiBase}/api/model/ordinal-systems`);
  if (!res.ok) throw new Error(`ordinal systems failed (${res.status})`);
  return res.json() as Promise<OrdinalSystemsResponse>;
}

export interface R64R32AccuracyGame {
  gameId?: string | null;
  round: "R64" | "R32";
  wTeamId: number;
  lTeamId: number;
  predProbWinner: number;
  predWinnerTeamId: number;
  correct: boolean;
  brier: number;
}

export interface R64R32AccuracyResponse {
  games: R64R32AccuracyGame[];
  summary: {
    total: number;
    correct: number;
    accuracy: number;
    avgBrier: number;
  };
}

export async function fetchR64R32Accuracy(): Promise<R64R32AccuracyResponse> {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const res = await fetch(`${apiBase}/api/model/r64-r32-accuracy`);
  if (!res.ok) throw new Error(`r64/r32 accuracy failed (${res.status})`);
  return res.json() as Promise<R64R32AccuracyResponse>;
}

export interface NarrativeApiResponse {
  team1_narrative?: string;
  team2_narrative?: string;
  matchup_narrative?: string;
  betting_narrative?: string;
}

export async function fetchNarrative(
  team1Id: number,
  team2Id: number,
  gender?: "M" | "W",
  opts?: { context?: "betting"; ourProb?: number; odds?: number },
): Promise<NarrativeApiResponse> {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const params = new URLSearchParams();
  if (gender) params.set("gender", gender);
  if (opts?.context) params.set("context", opts.context);
  if (opts?.ourProb != null) params.set("our_prob", String(opts.ourProb));
  if (opts?.odds != null) params.set("odds", String(opts.odds));
  const qs = params.toString();
  const res = await fetch(`${apiBase}/api/narrative/${team1Id}/${team2Id}${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`narrative failed (${res.status})`);
  return res.json() as Promise<NarrativeApiResponse>;
}

export interface FirstRoundMatchupsResponse {
  matchupsByRegion: Record<string, ApiBracketMatchupRow[]>;
}

export async function fetchFirstRoundMatchupsTyped(
  gender: "M" | "W",
  season: number = 2026,
): Promise<FirstRoundMatchupsResponse> {
  const raw = await fetchFirstRoundMatchups(gender, season);
  return raw as FirstRoundMatchupsResponse;
}
