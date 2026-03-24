import { Link } from "react-router-dom";
import type { ApiBracketMatchupRow, ApiBracketTeamRow } from "@/lib/bracketApiTypes";
import { BracketSlot } from "@/components/bracket/BracketSlot";
import { apiTeamDisplay, type WomenFieldRow } from "@/lib/bracketFieldDisplay";

function tid(t: ApiBracketTeamRow | undefined): number {
  return Number(t?.teamId ?? 0);
}

/** Horizontal bridge between F4 column and championship (center-aligned). */
function SideBridge() {
  return (
    <div className="hidden h-[140px] w-10 shrink-0 items-center sm:flex" aria-hidden>
      <svg width={40} height={140} viewBox="0 0 40 140" className="text-[#2a3860]">
        <line x1={0} y1={70} x2={40} y2={70} stroke="currentColor" strokeWidth={1.25} />
      </svg>
    </div>
  );
}

export type FinalColumnProps = {
  title: string;
  subtitle?: string;
  matchups: ApiBracketMatchupRow[];
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
  gender?: "M" | "W";
  womenFieldById?: Map<number, WomenFieldRow>;
};

export function FinalMatchupColumn({
  title,
  subtitle,
  matchups,
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
  gender = "M",
  womenFieldById,
}: FinalColumnProps) {
  if (!matchups.length) {
    return (
      <div className="min-w-[240px] rounded-xl border border-dashed border-muted-foreground/40 bg-muted/20 p-6 text-center font-display text-xs uppercase text-muted-foreground">
        {title}: TBD
      </div>
    );
  }

  return (
    <div className="min-w-[260px] rounded-xl border border-[#2a3860] bg-[hsl(var(--bg-surface))] p-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-4 flex flex-col gap-6">
        {matchups.map((m) => {
          const slot = String(m.slot ?? m.id ?? "");
          const a = tid(m.team1);
          const b = tid(m.team2);
          const win = picks[slot];
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const pairKey = a && b ? `${lo}-${hi}` : "";
          const rw = pairKey ? winnerByPair?.[pairKey] : undefined;
          const isFinal = rw != null;
          const pr = probBySlot?.[slot];
          const pctA = pr && a ? (pr.lo === a ? pr.pLo * 100 : (1 - pr.pLo) * 100) : undefined;
          const pctB = pr && b ? (pr.lo === b ? pr.pLo * 100 : (1 - pr.pLo) * 100) : undefined;
          const d1 = apiTeamDisplay(gender, m.team1, womenFieldById);
          const d2 = apiTeamDisplay(gender, m.team2, womenFieldById);
          return (
            <div key={slot} className="flex flex-col gap-1 border-b border-border pb-4 last:border-0 last:pb-0">
              {isFinal ? (
                <span className="w-fit rounded bg-emerald-500/15 px-1.5 py-0.5 font-display text-[9px] font-bold uppercase text-emerald-300">
                  FINAL
                </span>
              ) : null}
              <BracketSlot
                seed={d1.seed}
                name={d1.name}
                teamId={a || undefined}
                selected={win === a}
                readOnly={readOnly}
                survivalPct={survivalMap?.get(a)}
                eliminated={eliminatedSet?.has(a)}
                empty={!a}
                modelWinPct={pctA ?? undefined}
                flash={flashSlot === slot}
                resultWinnerId={rw ?? null}
                champProb={a ? champProbByTeamId?.get(a) : undefined}
                maxChampProb={maxChampProb}
                liveMode={liveMode}
                onSelect={readOnly || !a || isFinal ? undefined : () => setPick(slot, a)}
              />
              <BracketSlot
                seed={d2.seed}
                name={d2.name}
                teamId={b || undefined}
                selected={win === b}
                readOnly={readOnly}
                survivalPct={survivalMap?.get(b)}
                eliminated={eliminatedSet?.has(b)}
                empty={!b}
                modelWinPct={pctB ?? undefined}
                flash={flashSlot === slot}
                resultWinnerId={rw ?? null}
                champProb={b ? champProbByTeamId?.get(b) : undefined}
                maxChampProb={maxChampProb}
                liveMode={liveMode}
                onSelect={readOnly || !b || isFinal ? undefined : () => setPick(slot, b)}
              />
              {a && b ? (
                <Link
                  to={`/predictor/${lo}/${hi}`}
                  className="pl-1 font-display text-[10px] font-semibold uppercase text-[hsl(var(--predict-blue))] hover:underline"
                >
                  Preview
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function splitFinalFourMatchups(r5: ApiBracketMatchupRow[]): {
  left: ApiBracketMatchupRow[];
  right: ApiBracketMatchupRow[];
} {
  const left = r5.filter((m) => {
    const s = String(m.slot ?? "").toUpperCase();
    return s.includes("WX") || s === "R5WX";
  });
  const right = r5.filter((m) => {
    const s = String(m.slot ?? "").toUpperCase();
    return s.includes("YZ") || s === "R5YZ";
  });
  if (left.length || right.length) {
    return { left, right };
  }
  return { left: r5.slice(0, 1), right: r5.slice(1, 2) };
}

export function FinalFourChampionshipRow(
  props: Omit<FinalColumnProps, "title" | "subtitle" | "matchups"> & {
    r5: ApiBracketMatchupRow[];
    r6: ApiBracketMatchupRow[];
  },
) {
  const { r5, r6, ...rest } = props;
  const { left, right } = splitFinalFourMatchups(r5);
  return (
    <div className="space-y-4 border-t border-border pt-8">
      <h2 className="text-center font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Final four & championship
      </h2>
      <div className="flex flex-col items-center justify-center gap-6 xl:flex-row xl:items-center xl:gap-2">
        <FinalMatchupColumn {...rest} title="Semifinal 1" subtitle="East / South" matchups={left} />
        <SideBridge />
        <FinalMatchupColumn {...rest} title="National championship" subtitle="Final game" matchups={r6} />
        <SideBridge />
        <FinalMatchupColumn {...rest} title="Semifinal 2" subtitle="West / Midwest" matchups={right} />
      </div>
    </div>
  );
}
