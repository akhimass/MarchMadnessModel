import type { Team, TeamStats } from "@/types/bracket";
import { getSystem, PREDICTOR_ORDINAL_CODES } from "@/lib/masseySystemsMeta";
import clsx from "clsx";

interface TeamStatHighlightsProps {
  team: Team;
  stats: TeamStats;
  /** Reserved for future narrative blurbs. */
  narrative?: string;
  /** Which side this team is in `ordinalRanks` (team1 vs team2 keys). */
  teamSide: 1 | 2;
  ordinalRanks?: Record<string, { team1: number; team2: number }>;
}

function rankTone(rank: number): string {
  if (rank <= 25) return "text-emerald-400";
  if (rank <= 75) return "text-sky-300";
  if (rank > 200) return "text-amber-500";
  return "text-muted-foreground";
}

export const TeamStatHighlights = ({ team, stats, teamSide, ordinalRanks }: TeamStatHighlightsProps) => {
  const ordinalRows = PREDICTOR_ORDINAL_CODES.map((code) => {
    const pair = ordinalRanks?.[code];
    if (!pair) return null;
    const rank = teamSide === 1 ? pair.team1 : pair.team2;
    const meta = getSystem(code);
    return { code, label: code, full: meta?.fullName ?? code, rank };
  }).filter((x): x is NonNullable<typeof x> => x != null);

  return (
    <div className="rounded-lg border border-border bg-bg-surface p-3">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
          {team.logoUrl ? (
            <img src={team.logoUrl} alt="" className="h-8 w-8 object-contain" loading="lazy" draggable={false} />
          ) : (
            <span className="font-display text-sm font-bold text-white">{team.abbreviation.charAt(0)}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-semibold uppercase tracking-wider text-white">{team.name}</div>
          <div className="text-[10px] text-muted-foreground">#{team.seed} seed · {team.region}</div>
        </div>
      </div>

      <p className="mb-3 text-[10px] leading-snug text-muted-foreground">
        Stats come from the same pipeline as predictions (season features + Massey composite). KenPom.com is a separate
        product; we show <span className="text-foreground/90">Massey / net-eff ranks</span> and{" "}
        <span className="text-foreground/90">Massey ordinal systems</span> when loaded.
      </p>

      <div className="space-y-3">
        <div>
          <h4 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">
            Power ratings & national ranks
          </h4>
          <div className="space-y-1.5">
            {stats.masseyRank > 0 ? (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Massey composite (national)</span>
                <span className={clsx("font-display font-bold", rankTone(stats.masseyRank))}>#{stats.masseyRank}</span>
              </div>
            ) : null}
            {stats.netEffRank != null && stats.netEffRank > 0 ? (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Net efficiency rank</span>
                <span className={clsx("font-display font-bold", rankTone(stats.netEffRank))}>#{stats.netEffRank}</span>
              </div>
            ) : null}
            {stats.masseyRating != null ? (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Massey rating (raw)</span>
                <span className="font-mono font-semibold text-white">{stats.masseyRating.toFixed(2)}</span>
              </div>
            ) : null}
            {stats.elo != null ? (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Elo (season)</span>
                <span className="font-mono font-semibold text-white">{stats.elo.toFixed(1)}</span>
              </div>
            ) : null}
            {stats.pace != null && stats.pace > 0 ? (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Pace</span>
                <span className="font-mono text-white">{stats.pace.toFixed(1)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <h4 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">SVI</h4>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-text-secondary">Tournament value index</span>
            <span className="font-mono font-semibold text-white">{stats.svi.toFixed(3)}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{stats.sviClass}</div>
        </div>

        <div>
          <h4 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">
            Efficiency (per 100 poss.)
          </h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded border border-border/60 bg-muted/20 px-1 py-1.5">
              <div className="text-[9px] uppercase text-muted-foreground">Off</div>
              <div className="font-display text-sm font-bold text-white">{stats.offEff.toFixed(1)}</div>
            </div>
            <div className="rounded border border-border/60 bg-muted/20 px-1 py-1.5">
              <div className="text-[9px] uppercase text-muted-foreground">Def</div>
              <div className="font-display text-sm font-bold text-white">{stats.defEff.toFixed(1)}</div>
            </div>
            <div className="rounded border border-border/60 bg-muted/20 px-1 py-1.5">
              <div className="text-[9px] uppercase text-muted-foreground">Net</div>
              <div className="font-display text-sm font-bold text-emerald-300">{stats.netEff.toFixed(1)}</div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">Four factors</h4>
          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between gap-2">
              <span className="text-text-secondary">Off eFG%</span>
              <span className="font-mono text-white">{(stats.efgOff * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-secondary">Def eFG% allowed</span>
              <span className="font-mono text-white">{(stats.efgDef * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-secondary">TO% (off)</span>
              <span className="font-mono text-white">{(stats.toRate * 100).toFixed(1)}%</span>
            </div>
            {stats.toRateDef != null ? (
              <div className="flex justify-between gap-2">
                <span className="text-text-secondary">Opp TO% forced</span>
                <span className="font-mono text-white">{(stats.toRateDef * 100).toFixed(1)}%</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <span className="text-text-secondary">Off reb%</span>
              <span className="font-mono text-white">{(stats.orRate * 100).toFixed(1)}%</span>
            </div>
            {stats.drRate != null ? (
              <div className="flex justify-between gap-2">
                <span className="text-text-secondary">Def reb%</span>
                <span className="font-mono text-white">{(stats.drRate * 100).toFixed(1)}%</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <span className="text-text-secondary">FT rate</span>
              <span className="font-mono text-white">{stats.ftRate.toFixed(3)}</span>
            </div>
          </div>
        </div>

        {stats.astRate != null || stats.stlRate != null || stats.blkRate != null ? (
          <div>
            <h4 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">Other</h4>
            <div className="space-y-1 text-[10px]">
              {stats.astRate != null ? (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Ast rate</span>
                  <span className="font-mono text-white">{stats.astRate.toFixed(2)}</span>
                </div>
              ) : null}
              {stats.stlRate != null ? (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Stl rate</span>
                  <span className="font-mono text-white">{stats.stlRate.toFixed(2)}</span>
                </div>
              ) : null}
              {stats.blkRate != null ? (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Blk rate</span>
                  <span className="font-mono text-white">{stats.blkRate.toFixed(2)}</span>
                </div>
              ) : null}
              {stats.threePRate != null ? (
                <div className="flex justify-between">
                  <span className="text-text-secondary">3PA share</span>
                  <span className="font-mono text-white">{(stats.threePRate * 100).toFixed(1)}%</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {ordinalRows.length > 0 ? (
          <div>
            <h4 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">
              Massey ordinal systems
            </h4>
            <p className="mb-1.5 text-[9px] text-muted-foreground">National rank per system (lower = better).</p>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {ordinalRows.map((row) => (
                <div key={row.code} className="flex items-center justify-between gap-2 text-[10px]" title={row.full}>
                  <span className="truncate font-mono text-text-secondary">{row.label}</span>
                  <span className={clsx("shrink-0 font-display font-bold", rankTone(row.rank))}>#{row.rank}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
