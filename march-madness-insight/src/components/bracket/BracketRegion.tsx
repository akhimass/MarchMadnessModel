import { Link } from "react-router-dom";
import type { ApiBracketMatchupRow, ApiBracketTeamRow } from "@/lib/bracketApiTypes";
import { BracketSlot } from "@/components/bracket/BracketSlot";
import { ConnectorLines } from "@/components/bracket/ConnectorLines";
import { apiTeamDisplay, type WomenFieldRow } from "@/lib/bracketFieldDisplay";

const MATCHUP_BLOCK = "min-h-[148px]";

function tid(t: ApiBracketTeamRow | undefined): number {
  return Number(t?.teamId ?? 0);
}

export function BracketRegion({
  title,
  r1,
  r2,
  r3,
  r4,
  picks,
  setPick,
  readOnly,
  survivalMap,
  eliminatedSet,
  probBySlot,
  winnerByPair,
  flashSlot,
  showConnectors = true,
  gender = "M",
  womenFieldById,
}: {
  title: string;
  r1: ApiBracketMatchupRow[];
  r2: ApiBracketMatchupRow[];
  r3: ApiBracketMatchupRow[];
  r4: ApiBracketMatchupRow[];
  picks: Record<string, number>;
  setPick: (slot: string, teamId: number) => void;
  readOnly?: boolean;
  survivalMap?: Map<number, number>;
  eliminatedSet?: Set<number>;
  /** slot -> { lo, pLo } for model P(lower id wins) */
  probBySlot?: Record<string, { lo: number; pLo: number }>;
  /** `${min}-${max}` -> winning team id */
  winnerByPair?: Record<string, number>;
  flashSlot?: string | null;
  showConnectors?: boolean;
  gender?: "M" | "W";
  womenFieldById?: Map<number, WomenFieldRow>;
}) {
  const renderRound = (label: string, matchups: ApiBracketMatchupRow[]) => (
    <div className="flex min-w-[220px] flex-col">
      <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-col gap-4">
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
          return (
            <div key={slot} className={`flex flex-col gap-1 ${MATCHUP_BLOCK}`}>
              {isFinal ? (
                <span className="w-fit rounded bg-emerald-500/15 px-1.5 py-0.5 font-display text-[9px] font-bold uppercase text-emerald-300">
                  FINAL
                </span>
              ) : null}
              <BracketSlot
                seed={tseed(m.team1)}
                name={tname(m.team1)}
                teamId={a || undefined}
                selected={win === a}
                readOnly={readOnly}
                survivalPct={survivalMap?.get(a)}
                eliminated={eliminatedSet?.has(a)}
                empty={!a}
                modelWinPct={pctA ?? undefined}
                flash={flashSlot === slot}
                resultWinnerId={rw ?? null}
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

  return (
    <div className="rounded-xl border border-[#2a3860] bg-[hsl(var(--bg-surface))] p-4 shadow-sm">
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">{title}</h3>
      <div className="mt-4 flex items-start gap-1 overflow-x-auto pb-2">
        {renderRound("Round of 64", r1)}
        {showConnectors ? <ConnectorLines matchupCount={r1.length} round={0} /> : null}
        {renderRound("Round of 32", r2)}
        {showConnectors ? <ConnectorLines matchupCount={r2.length} round={1} /> : null}
        {renderRound("Sweet 16", r3)}
        {showConnectors ? <ConnectorLines matchupCount={r3.length} round={2} /> : null}
        {renderRound("Elite 8", r4)}
      </div>
    </div>
  );
}
