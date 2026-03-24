import { logoUrlFromTeamName } from "@/lib/teamLogo";
import { cn } from "@/lib/utils";

type TeamLite = { teamId?: number; teamName?: string; seed?: number };
type MatchupLite = { slot?: string; team1?: TeamLite; team2?: TeamLite };

interface Props {
  matchupsBySlot: Record<string, MatchupLite>;
  winnerByPair: Record<string, number>;
  actualWinners: Record<string, number>;
  champProbMap: Map<number, number>;
  eliminatedSet: Set<number>;
}

const REGION_LAYOUT = [
  { key: "south", letter: "X", label: "South", top: true },
  { key: "west", letter: "Y", label: "West", top: true },
  { key: "east", letter: "W", label: "East", top: false },
  { key: "midwest", letter: "Z", label: "Midwest", top: false },
] as const;

function slotWinner(row: MatchupLite | undefined, winnerByPair: Record<string, number>, actualWinners: Record<string, number>): number | undefined {
  if (!row) return undefined;
  const slot = String(row.slot ?? "");
  const a = Number(row.team1?.teamId ?? 0);
  const b = Number(row.team2?.teamId ?? 0);
  const bySlot = actualWinners[slot];
  if (bySlot) return bySlot;
  if (!a || !b) return undefined;
  return winnerByPair[`${Math.min(a, b)}-${Math.max(a, b)}`];
}

function TeamRow({
  team,
  isWinner,
  isLoser,
  champProb,
  eliminated,
}: {
  team: TeamLite;
  isWinner: boolean;
  isLoser: boolean;
  champProb: number;
  eliminated: boolean;
}) {
  const name = String(team.teamName ?? "TBD");
  const seed = Number(team.seed ?? 0);
  const logo = name !== "TBD" ? logoUrlFromTeamName(name) : null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded border px-2 py-1.5",
        isWinner ? "border-emerald-500/60 bg-emerald-500/10" : "border-border/70",
        (isLoser || eliminated) ? "opacity-45" : "",
      )}
    >
      {logo ? <img src={logo} alt="" className="h-5 w-5 rounded-full object-contain" /> : <div className="h-5 w-5 rounded-full bg-muted" />}
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[11px] font-bold uppercase", isLoser ? "line-through text-muted-foreground" : "text-foreground")}>
          {seed > 0 ? `#${seed} ` : ""}{name}
        </div>
      </div>
      {champProb > 0 ? <span className="text-[10px] text-primary">{(champProb * 100).toFixed(1)}%</span> : null}
    </div>
  );
}

function MatchCard({
  row,
  winnerByPair,
  actualWinners,
  champProbMap,
  eliminatedSet,
  title,
}: {
  row: MatchupLite | undefined;
  winnerByPair: Record<string, number>;
  actualWinners: Record<string, number>;
  champProbMap: Map<number, number>;
  eliminatedSet: Set<number>;
  title?: string;
}) {
  const winner = slotWinner(row, winnerByPair, actualWinners);
  const t1 = row?.team1 ?? {};
  const t2 = row?.team2 ?? {};
  const t1Id = Number(t1.teamId ?? 0);
  const t2Id = Number(t2.teamId ?? 0);
  const t1W = winner != null && t1Id === winner;
  const t2W = winner != null && t2Id === winner;
  return (
    <div className="rounded-md border border-border bg-card/70 p-1.5">
      {title ? <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">{title}</div> : null}
      <div className="space-y-1">
        <TeamRow team={t1} isWinner={t1W} isLoser={t2W} champProb={champProbMap.get(t1Id) ?? 0} eliminated={eliminatedSet.has(t1Id)} />
        <TeamRow team={t2} isWinner={t2W} isLoser={t1W} champProb={champProbMap.get(t2Id) ?? 0} eliminated={eliminatedSet.has(t2Id)} />
      </div>
    </div>
  );
}

function RegionColumn({
  letter,
  label,
  matchupsBySlot,
  winnerByPair,
  actualWinners,
  champProbMap,
  eliminatedSet,
}: {
  letter: string;
  label: string;
  matchupsBySlot: Record<string, MatchupLite>;
  winnerByPair: Record<string, number>;
  actualWinners: Record<string, number>;
  champProbMap: Map<number, number>;
  eliminatedSet: Set<number>;
}) {
  const r64 = Array.from({ length: 8 }, (_, i) => matchupsBySlot[`R1${letter}${i + 1}`]);
  const r32 = Array.from({ length: 4 }, (_, i) => matchupsBySlot[`R2${letter}${i + 1}`]);
  const s16 = Array.from({ length: 2 }, (_, i) => matchupsBySlot[`R3${letter}${i + 1}`]);
  const e8 = matchupsBySlot[`R4${letter}1`];

  return (
    <div className="rounded-lg border border-border bg-card/40 p-2">
      <div className="mb-2 text-center font-display text-[11px] font-bold uppercase text-muted-foreground">{label}</div>
      <div className="grid grid-cols-4 gap-2">
        <div className="space-y-2">{r64.map((m, i) => <MatchCard key={`r64-${letter}-${i}`} row={m} winnerByPair={winnerByPair} actualWinners={actualWinners} champProbMap={champProbMap} eliminatedSet={eliminatedSet} />)}</div>
        <div className="space-y-2">{r32.map((m, i) => <MatchCard key={`r32-${letter}-${i}`} row={m} winnerByPair={winnerByPair} actualWinners={actualWinners} champProbMap={champProbMap} eliminatedSet={eliminatedSet} />)}</div>
        <div className="space-y-2">{s16.map((m, i) => <MatchCard key={`s16-${letter}-${i}`} row={m} winnerByPair={winnerByPair} actualWinners={actualWinners} champProbMap={champProbMap} eliminatedSet={eliminatedSet} />)}</div>
        <div className="space-y-2"><MatchCard row={e8} winnerByPair={winnerByPair} actualWinners={actualWinners} champProbMap={champProbMap} eliminatedSet={eliminatedSet} title="Elite 8" /></div>
      </div>
    </div>
  );
}

export function ArenaTemplateBracket({
  matchupsBySlot,
  winnerByPair,
  actualWinners,
  champProbMap,
  eliminatedSet,
}: Props) {
  const finalFourLeft = matchupsBySlot.R5WX;
  const finalFourRight = matchupsBySlot.R5YZ;
  const champ = matchupsBySlot.R6CH;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {REGION_LAYOUT.filter((r) => r.top).map((r) => (
          <RegionColumn
            key={r.key}
            letter={r.letter}
            label={r.label}
            matchupsBySlot={matchupsBySlot}
            winnerByPair={winnerByPair}
            actualWinners={actualWinners}
            champProbMap={champProbMap}
            eliminatedSet={eliminatedSet}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <MatchCard row={finalFourLeft} winnerByPair={winnerByPair} actualWinners={actualWinners} champProbMap={champProbMap} eliminatedSet={eliminatedSet} title="Final Four" />
        <MatchCard row={champ} winnerByPair={winnerByPair} actualWinners={actualWinners} champProbMap={champProbMap} eliminatedSet={eliminatedSet} title="Championship" />
        <MatchCard row={finalFourRight} winnerByPair={winnerByPair} actualWinners={actualWinners} champProbMap={champProbMap} eliminatedSet={eliminatedSet} title="Final Four" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {REGION_LAYOUT.filter((r) => !r.top).map((r) => (
          <RegionColumn
            key={r.key}
            letter={r.letter}
            label={r.label}
            matchupsBySlot={matchupsBySlot}
            winnerByPair={winnerByPair}
            actualWinners={actualWinners}
            champProbMap={champProbMap}
            eliminatedSet={eliminatedSet}
          />
        ))}
      </div>
    </div>
  );
}
