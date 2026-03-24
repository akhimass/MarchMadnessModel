import type { ApiBracketMatchupRow } from "@/lib/bracketApiTypes";
import { BracketRegion } from "@/components/bracket/BracketRegion";
import { FinalFourChampionshipRow } from "@/components/bracket/FinalStrip";
import type { WomenFieldRow } from "@/lib/bracketFieldDisplay";

export function filterByRegionLetter(matchups: ApiBracketMatchupRow[], letter: string): ApiBracketMatchupRow[] {
  return [...matchups]
    .filter((m) => m.slot && m.slot.length >= 3 && m.slot[2] === letter)
    .sort((a, b) => String(a.slot).localeCompare(String(b.slot)));
}

export function BracketTree({
  matchupsByRegion,
  r2,
  r3,
  r4,
  r5,
  r6,
  picks,
  setPick,
  readOnly,
  survivalMap,
  eliminatedSet,
  probBySlot,
  winnerByPair,
  flashSlot,
  champProbByTeamId,
  maxChampProb,
  liveMode,
  showConnectors = true,
  gender = "M",
  womenFieldById,
}: {
  matchupsByRegion: Record<string, ApiBracketMatchupRow[]>;
  r2: ApiBracketMatchupRow[];
  r3: ApiBracketMatchupRow[];
  r4: ApiBracketMatchupRow[];
  r5: ApiBracketMatchupRow[];
  r6: ApiBracketMatchupRow[];
  picks: Record<string, number>;
  setPick: (slot: string, teamId: number) => void;
  readOnly?: boolean;
  survivalMap?: Map<number, number>;
  eliminatedSet?: Set<number>;
  probBySlot?: Record<string, { lo: number; pLo: number }>;
  winnerByPair?: Record<string, number>;
  flashSlot?: string | null;
  champProbByTeamId?: Map<number, number>;
  maxChampProb?: number;
  liveMode?: boolean;
  showConnectors?: boolean;
  gender?: "M" | "W";
  womenFieldById?: Map<number, WomenFieldRow>;
}) {
  const east = matchupsByRegion.east ?? [];
  const south = matchupsByRegion.south ?? [];
  const west = matchupsByRegion.west ?? [];
  const midwest = matchupsByRegion.midwest ?? [];

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <BracketRegion
          title="East"
          r1={east}
          r2={filterByRegionLetter(r2, "W")}
          r3={filterByRegionLetter(r3, "W")}
          r4={filterByRegionLetter(r4, "W")}
          picks={picks}
          setPick={setPick}
          readOnly={readOnly}
          survivalMap={survivalMap}
          eliminatedSet={eliminatedSet}
          probBySlot={probBySlot}
          winnerByPair={winnerByPair}
          flashSlot={flashSlot}
          showConnectors={showConnectors}
          gender={gender}
          womenFieldById={womenFieldById}
        />
        <BracketRegion
          title="West"
          r1={west}
          r2={filterByRegionLetter(r2, "Y")}
          r3={filterByRegionLetter(r3, "Y")}
          r4={filterByRegionLetter(r4, "Y")}
          picks={picks}
          setPick={setPick}
          readOnly={readOnly}
          survivalMap={survivalMap}
          eliminatedSet={eliminatedSet}
          probBySlot={probBySlot}
          winnerByPair={winnerByPair}
          flashSlot={flashSlot}
          showConnectors={showConnectors}
          gender={gender}
          womenFieldById={womenFieldById}
        />
        <BracketRegion
          title="South"
          r1={south}
          r2={filterByRegionLetter(r2, "X")}
          r3={filterByRegionLetter(r3, "X")}
          r4={filterByRegionLetter(r4, "X")}
          picks={picks}
          setPick={setPick}
          readOnly={readOnly}
          survivalMap={survivalMap}
          eliminatedSet={eliminatedSet}
          probBySlot={probBySlot}
          winnerByPair={winnerByPair}
          flashSlot={flashSlot}
          showConnectors={showConnectors}
          gender={gender}
          womenFieldById={womenFieldById}
        />
        <BracketRegion
          title="Midwest"
          r1={midwest}
          r2={filterByRegionLetter(r2, "Z")}
          r3={filterByRegionLetter(r3, "Z")}
          r4={filterByRegionLetter(r4, "Z")}
          picks={picks}
          setPick={setPick}
          readOnly={readOnly}
          survivalMap={survivalMap}
          eliminatedSet={eliminatedSet}
          probBySlot={probBySlot}
          winnerByPair={winnerByPair}
          flashSlot={flashSlot}
          showConnectors={showConnectors}
          gender={gender}
          womenFieldById={womenFieldById}
        />
      </div>

      <FinalFourChampionshipRow
        r5={r5}
        r6={r6}
        picks={picks}
        setPick={setPick}
        readOnly={readOnly}
        survivalMap={survivalMap}
        eliminatedSet={eliminatedSet}
        probBySlot={probBySlot}
        winnerByPair={winnerByPair}
        flashSlot={flashSlot}
        champProbByTeamId={champProbByTeamId}
        maxChampProb={maxChampProb}
        liveMode={liveMode}
        gender={gender}
        womenFieldById={womenFieldById}
      />
    </div>
  );
}
