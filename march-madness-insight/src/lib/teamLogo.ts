export function getLogoFilenameFromName(name: string): string {
  const normalized = String(name ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, "");

  // ESPN/Odds often include mascot suffixes; strip them for stable school-level logos.
  const schoolOnly = normalized
    .replace(
      /(wildcats|huskies|spartans|longhorns|boilermakers|cyclones|volunteers|redstorm|bluedevils|fightingillini|cornhuskers|wolverines|crimsontide|razorbacks|cougars|fightingirish|goldenhurricane|goldeneagles|hawkeyes|bluejays|bulldogs|tigers|mustangs|lobos|jayhawks|aggies|buckeyes|rebels|trojans|bruins|cardinals|owls|rams)$/g,
      "",
    )
    .trim();
  const slug = (schoolOnly || normalized).replace(/[^a-z0-9()&]/g, "");
  const alias: Record<string, string> = {
    connecticut: "uconn",
    uconnhuskies: "uconn",
    michiganst: "michiganstate",
    michiganstatespartans: "michiganstate",
    dukebluedevils: "duke",
    purdueboilermakers: "purdue",
    iowastatecyclones: "iowastate",
    tennesseevolunteers: "tennessee",
    houstoncougars: "houston",
    illinoisfightingillini: "illinois",
    nebraskacornhuskers: "nebraska",
    michiganwolverines: "michigan",
    alabamacrimsontide: "alabama",
    arkansasrazorbacks: "arkansas",
    arizonawildcats: "arizona",
    texaslonghorns: "texas",
    iowahawkeyes: "iowa",
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
    miamihurricanes: "miami",
    utahst: "utahstate",
    kennesaw: "kennesawstate",
    queensnc: "queens",
    liubrooklyn: "longisland",
    saintjohns: "stjohns",
    stjohns: "stjohns",
    michiganstate: "michiganstate",
    northdakotastate: "northdakotastate",
    newmexico: "newmexico",
    iowastate: "iowastate",
    sandiegostate: "sandiegostate",
    washingtonstate: "washingtonstate",
    louisianastate: "lsu",
    southernmethodist: "SMU",
    // 2026 bracket fixes
    "miami(fl)": "miami",          // Miami (FL) → miami.png
    "texasaandm": "texasa&m",      // Texas A&M — & got converted to "and"
    "prairieviewaandm": "praire",  // Prairie View A&M — & got converted to "and"
    kennesawst: "kennesawstate",   // Kennesaw St → kennesawstate.png
    "stjohns(ny)": "stjohns",      // St John's (NY) → stjohns.png
    southfla: "usf",                // South Fla → usf.png
    northdakotast: "northdakotastate", // North Dakota St → northdakotastate.png
    "saintmarys(ca)": "saintmarys", // Saint Mary's (CA) → saintmarys.png
    liu: "longisland",              // LIU → longisland.png
    "queens(nc)": "queens",         // Queens (NC) → queens.png
  };
  return alias[slug] ?? slug;
}

export function logoUrlFromTeamName(name: string): string {
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  return `${apiBase}/teamlogo/${encodeURIComponent(getLogoFilenameFromName(name))}.png`;
}
