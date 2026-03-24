"""
Resolve men's tournament Kaggle-style TeamIDs (from teams2026 / MTeams) from ESPN
abbreviations and display names. Mirrors march-madness-insight/src/lib/espnTeamToKaggle.ts.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

# id, name, abbreviation — must stay aligned with menTeams2026 in the frontend.
# IDs are real Kaggle TeamIDs from MTeams.csv / MNCAATourneySeeds.csv.
MEN_TEAMS_2026: List[Tuple[int, str, str]] = [
    # East (W)
    (1181, "Duke",          "DUKE"),
    (1163, "UConn",         "UCONN"),
    (1277, "Michigan St",   "MSU"),
    (1242, "Kansas",        "KU"),
    (1385, "St John's",     "SJU"),
    (1257, "Louisville",    "LOU"),
    (1417, "UCLA",          "UCLA"),
    (1326, "Ohio St",       "OSU"),
    (1395, "TCU",           "TCU"),
    (1416, "UCF",           "UCF"),
    (1378, "South Florida", "USF"),
    (1320, "Northern Iowa", "UNI"),
    (1465, "Cal Baptist",   "CBU"),
    (1295, "N Dakota St",   "NDSU"),
    (1202, "Furman",        "FUR"),
    (1373, "Siena",         "SIE"),
    # South (X)
    (1196, "Florida",           "FLA"),
    (1222, "Houston",           "HOU"),
    (1228, "Illinois",          "ILL"),
    (1304, "Nebraska",          "NEB"),
    (1435, "Vanderbilt",        "VAN"),
    (1314, "North Carolina",    "UNC"),
    (1388, "St Mary's CA",      "SMC"),
    (1155, "Clemson",           "CLEM"),
    (1234, "Iowa",              "IOWA"),
    (1401, "Texas A&M",         "TAMU"),
    (1433, "VCU",               "VCU"),
    (1270, "McNeese St",        "MCN"),
    (1407, "Troy",              "TROY"),
    (1335, "Penn",              "PENN"),
    (1225, "Idaho",             "IDHO"),
    (1341, "Prairie View",      "PVAM"),
    # West (Z)
    (1112, "Arizona",     "ARIZ"),
    (1345, "Purdue",      "PUR"),
    (1211, "Gonzaga",     "GONZ"),
    (1116, "Arkansas",    "ARK"),
    (1458, "Wisconsin",   "WIS"),
    (1140, "BYU",         "BYU"),
    (1274, "Miami FL",    "MIA"),
    (1437, "Villanova",   "NOVA"),
    (1429, "Utah St",     "USU"),
    (1281, "Missouri",    "MIZO"),
    (1400, "Texas",       "TEX"),
    (1219, "High Point",  "HPU"),
    (1218, "Hawaii",      "HAW"),
    (1244, "Kennesaw",    "KENN"),
    (1474, "Queens NC",   "QU"),
    (1254, "LIU Brooklyn","LIU"),
    # Midwest (Y)
    (1276, "Michigan",    "MICH"),
    (1235, "Iowa St",     "ISU"),
    (1438, "Virginia",    "UVA"),
    (1104, "Alabama",     "ALA"),
    (1403, "Texas Tech",  "TTU"),
    (1397, "Tennessee",   "TENN"),
    (1246, "Kentucky",    "UK"),
    (1208, "Georgia",     "UGA"),
    (1387, "St Louis",    "SLU"),
    (1365, "Santa Clara", "SCU"),
    (1275, "Miami OH",    "MIOH"),
    (1103, "Akron",       "AKR"),
    (1220, "Hofstra",     "HOF"),
    (1460, "Wright St",   "WRST"),
    (1398, "Tennessee St","TNST"),
    (1224, "Howard",      "HOW"),
]

# Bracket seeds — real Kaggle TeamID → seed number (same region offset expected by model).
BRACKET_SEED_BY_KAGGLE_ID: Dict[int, int] = {
    # East
    1181: 1, 1163: 2, 1277: 3, 1242: 4, 1385: 5, 1257: 6, 1417: 7, 1326: 8,
    1395: 9, 1416: 10, 1378: 11, 1320: 12, 1465: 13, 1295: 14, 1202: 15, 1373: 16,
    # South
    1196: 1, 1222: 2, 1228: 3, 1304: 4, 1435: 5, 1314: 6, 1388: 7, 1155: 8,
    1234: 9, 1401: 10, 1433: 11, 1270: 12, 1407: 13, 1335: 14, 1225: 15, 1341: 16,
    # West
    1112: 1, 1345: 2, 1211: 3, 1116: 4, 1458: 5, 1140: 6, 1274: 7, 1437: 8,
    1429: 9, 1281: 10, 1400: 11, 1219: 12, 1218: 13, 1244: 14, 1474: 15, 1254: 16,
    # Midwest
    1276: 1, 1235: 2, 1438: 3, 1104: 4, 1403: 5, 1397: 6, 1246: 7, 1208: 8,
    1387: 9, 1365: 10, 1275: 11, 1103: 12, 1220: 13, 1460: 14, 1398: 15, 1224: 16,
}

BRACKET_ABBR_BY_KAGGLE_ID: Dict[int, str] = {tid: abbr for tid, _name, abbr in MEN_TEAMS_2026}

KAGGLE_ID_BY_ABBR: Dict[str, int] = {}
for tid, _name, abbr in MEN_TEAMS_2026:
    KAGGLE_ID_BY_ABBR[abbr.upper().replace(".", "")] = tid

ESPN_ABBR_ALIASES: Dict[str, str] = {
    # UConn variants
    "UCONN": "UCONN",
    "CONN": "UCONN",
    # Michigan State variants
    "MICHST": "MSU",
    "MSU": "MSU",
    # Michigan variants
    "MICH": "MICH",
    # Iowa State
    "ISU": "ISU",
    # St. John's variants
    "STJ": "SJU",
    "STJOHN": "SJU",
    # BYU
    "BYU": "BYU",
    # Common ESPN short codes for 2026 bracket teams
    "USF": "USF",
    "UNC": "UNC",
    "PUR": "PUR",
    "NEB": "NEB",
    "ILL": "ILL",
    "HOU": "HOU",
    "BAMA": "ALA",
    "TENN": "TENN",
    "ARK": "ARK",
    "VAN": "VAN",
    "UK": "UK",
    "UVA": "UVA",
    "TTU": "TTU",
    "VCU": "VCU",
}

# NCAA scoreboard `char6` codes often differ from our bracket abbreviations.
NCAA_CHAR6_ALIASES: Dict[str, str] = {
    # 2026 bracket teams
    "TEXA": "TEX",       # Texas → TEX
    "HOUS": "HOU",       # Houston → HOU
    "KENT": "UK",        # Kentucky → UK
    "ILLI": "ILL",       # Illinois → ILL
    "AKRO": "AKR",       # Akron → AKR
    "NEBR": "NEB",       # Nebraska → NEB
    "WISC": "WIS",       # Wisconsin → WIS
    "GONZ": "GONZ",      # Gonzaga → GONZ
    "CLEM": "CLEM",      # Clemson → CLEM
    "MCNE": "MCN",       # McNeese → MCN
    "ARIZ": "ARIZ",      # Arizona → ARIZ
    "MICH": "MICH",      # Michigan → MICH
    "MISU": "MIZO",      # Missouri → MIZO
    "MISS": "MIZO",      # Missouri alt → MIZO
    "ALBS": "ALA",       # Alabama alt → ALA
    "FLOR": "FLA",       # Florida → FLA
    "PURDU": "PUR",      # Purdue alt → PUR
    "IOWA": "IOWA",      # Iowa → IOWA
    "KANS": "KU",        # Kansas → KU
    "DUKE": "DUKE",      # Duke → DUKE
    "UCON": "UCONN",     # UConn short → UCONN
    "VIRG": "UVA",       # Virginia → UVA
    "TXTE": "TTU",       # Texas Tech → TTU
    "TTEC": "TTU",       # Texas Tech alt → TTU
    "VANDY": "VAN",      # Vanderbilt → VAN
    "VAND": "VAN",       # Vanderbilt alt → VAN
    "NCAR": "UNC",       # North Carolina → UNC
    "NCST": "NCST",      # NC State (First Four)
    "SMMU": "SMC",       # Saint Mary's alt
    "STMR": "SMC",       # Saint Mary's alt
    "HWARD": "HOW",      # Howard → HOW
    "PRVU": "PVAM",      # Prairie View → PVAM
    "TXAM": "TAMU",      # Texas A&M → TAMU
    "ARKS": "ARK",       # Arkansas → ARK
    "LSVL": "LOU",       # Louisville → LOU
    "UCFY": "UCF",       # UCF → UCF
    # NCAA sometimes uses ultra-short char6 for well-known schools
    "MS": "MSU",         # Michigan State
}

ALIAS_NAME: Dict[str, str] = {
    "connecticut huskies": "uconn",
    "michigan state spartans": "michigan st",
    "st johns red storm": "st john's",
    "iowa state cyclones": "iowa st",
    "duke blue devils": "duke",
    "north carolina tar heels": "north carolina",
    "north carolina": "north carolina",
    "florida gators": "florida",
    "houston cougars": "houston",
    "illinois fighting illini": "illinois",
    "nebraska cornhuskers": "nebraska",
    "arizona wildcats": "arizona",
    "purdue boilermakers": "purdue",
    "gonzaga bulldogs": "gonzaga",
    "arkansas razorbacks": "arkansas",
    "michigan wolverines": "michigan",
    "iowa state cyclones": "iowa st",
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
    "byu cougars": "byu",
    "miami hurricanes": "miami (fl)",
    "miami redhawks": "miami (oh)",
    "prairie view panthers": "prairie view a&m",
    "south florida bulls": "south florida",
}


def _normalize_abbr(s: str) -> str:
    return "".join(str(s or "").upper().replace(".", "").split())


def _normalize_name(s: str) -> str:
    t = str(s or "").lower().replace("’", "'").replace("'", "")
    out = []
    for ch in t:
        if ch.isalnum() or ch.isspace():
            out.append(ch)
        elif ch == "&":
            out.append(" and ")
        else:
            out.append(" ")
    s2 = "".join(out)
    while "  " in s2:
        s2 = s2.replace("  ", " ")
    return s2.strip()


def kaggle_id_from_espn_team(abbrev: str, display_name: str = "") -> Optional[int]:
    raw = _normalize_abbr(abbrev)
    raw = NCAA_CHAR6_ALIASES.get(raw, raw)
    aliased = ESPN_ABBR_ALIASES.get(raw, raw)
    normalized = _normalize_name(display_name)

    # Disambiguate schools sharing shorthand codes before direct-abbreviation lookup.
    # Most feeds use "MIA" for both Miami (FL) and Miami (OH).
    if aliased == "MIA" or raw == "MIA":
        if "redhawks" in normalized or "miami oh" in normalized:
            return 1275  # Miami (OH)
        if "hurricanes" in normalized or "miami fl" in normalized:
            return 1274  # Miami (FL)

    direct = KAGGLE_ID_BY_ABBR.get(aliased) or KAGGLE_ID_BY_ABBR.get(raw)
    if direct is not None:
        return int(direct)

    target_key = ALIAS_NAME.get(normalized, normalized)
    target = _normalize_name(target_key)

    for tid, name, _abbr in MEN_TEAMS_2026:
        tn = _normalize_name(name)
        if tn == target:
            return int(tid)
        t_tokens = tn.split()
        target_tokens = target.split()
        # Avoid collapsing distinct schools like "Texas" vs "Texas Tech" or "Iowa" vs "Iowa St".
        if len(t_tokens) < 2 or len(target_tokens) < 2:
            continue
        overlap = sum(1 for tok in t_tokens if tok in target_tokens)
        if overlap >= 2:
            return int(tid)
    return None


def bracket_display_for_kaggle(
    kaggle_id: Optional[int],
    char6_abbr: str,
    ncaa_seed: int,
) -> tuple[str, int]:
    """
    When we resolve a men's bracket TeamID, prefer bracket abbreviation + seed over NCAA `char6`
    (fixes MEMP/MEM, duplicate seeds, etc.).
    """
    if kaggle_id is None:
        return char6_abbr, ncaa_seed
    kid = int(kaggle_id)
    abbr = BRACKET_ABBR_BY_KAGGLE_ID.get(kid)
    seed_v = BRACKET_SEED_BY_KAGGLE_ID.get(kid)
    return (abbr or char6_abbr), (int(seed_v) if seed_v is not None else ncaa_seed)


# Short school names for cache / API responses (aligned with menTeams2026).
NAME_BY_KAGGLE_ID: Dict[int, str] = {tid: name for tid, name, _abbr in MEN_TEAMS_2026}
