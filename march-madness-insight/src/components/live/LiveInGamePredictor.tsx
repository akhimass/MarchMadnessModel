import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { fetchMatchup } from "@/lib/api";
import {
  adjustBreakdownForLiveScore,
  liveAdjustMeta,
  REGULATION_SECONDS,
} from "@/lib/liveWinProbAdjust";
import type { LiveGame } from "@/lib/espnApi";
import { Separator } from "@ui/separator";

const ROWS: { key: keyof ModelBreakdown; label: string; hint: string }[] = [
  { key: "decision_tree", label: "Decision tree", hint: "More sticky — shifts slowly in-game" },
  { key: "power_ratings", label: "Power ratings", hint: "Schedule-strength style signal" },
  { key: "similar_games", label: "Similar games", hint: "Historical comps" },
  { key: "simulation", label: "Simulation", hint: "Most reactive to score & clock" },
  { key: "seed_difference", label: "Seed difference", hint: "Structural prior — slow to move" },
];

function pct(p: number) {
  return `${Math.round(clampProb(p) * 100)}%`;
}

function clampProb(p: number) {
  return Math.min(1, Math.max(0, p));
}

function BreakdownCompareRow({
  label,
  hint,
  pre,
  live,
}: {
  label: string;
  hint: string;
  pre: number;
  live: number;
}) {
  const d = Math.round((live - pre) * 100);
  const up = d > 0;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <div className="font-sans font-semibold text-foreground">{label}</div>
        <div className="font-sans text-[10px] text-muted-foreground">{hint}</div>
      </div>
      <span className="shrink-0 font-sans tabular-nums text-muted-foreground">{pct(pre)}</span>
      <div className="flex shrink-0 items-center gap-1.5 justify-end">
        <span className="font-sans text-muted-foreground">→</span>
        <span className="min-w-[2.5rem] text-right font-sans font-semibold tabular-nums text-foreground">
          {pct(live)}
        </span>
        {d !== 0 ? (
          <span
            className={`w-10 text-right font-sans text-[10px] font-medium tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}
          >
            {up ? "+" : ""}
            {d}
          </span>
        ) : (
          <span className="w-10" />
        )}
      </div>
    </div>
  );
}

type Props = {
  game: LiveGame;
  awayKaggleId: number;
  homeKaggleId: number;
  /** Reserved for future gender-specific tuning */
  gender?: "M" | "W";
  /** When true, show extra copy for the Live AI tab */
  verbose?: boolean;
};

/**
 * Full model breakdown from `/api/matchup`, re-blended using current ESPN score & clock for in-progress games.
 */
export function LiveInGamePredictor({ game, awayKaggleId, homeKaggleId, verbose }: Props) {
  const lo = Math.min(awayKaggleId, homeKaggleId);
  const hi = Math.max(awayKaggleId, homeKaggleId);
  const matchupId = `${lo}-${hi}`;

  const { data: pregame, isLoading, isError } = useQuery({
    queryKey: ["live-matchup-full", matchupId],
    queryFn: () => fetchMatchup(matchupId),
    staleTime: 60_000,
  });

  const meta = useMemo(
    () => liveAdjustMeta(game, awayKaggleId, homeKaggleId),
    [game, awayKaggleId, homeKaggleId],
  );

  const liveBreakdown = useMemo(() => {
    if (!pregame || !meta) return null;
    return adjustBreakdownForLiveScore(pregame.modelBreakdown, meta.marginTeam1, meta.secondsRemaining);
  }, [pregame, meta]);

  const awayWinPregame = useMemo(() => {
    if (!pregame) return null;
    const t1 = pregame.team1.id;
    const pT1 = pregame.standardProb;
    return awayKaggleId === t1 ? pT1 : 1 - pT1;
  }, [pregame, awayKaggleId]);

  const awayWinLive = useMemo(() => {
    if (!liveBreakdown || !pregame) return null;
    const t1 = pregame.team1.id;
    const pT1 = liveBreakdown.ensemble;
    return awayKaggleId === t1 ? pT1 : 1 - pT1;
  }, [liveBreakdown, pregame, awayKaggleId]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-6 text-center font-sans text-xs text-muted-foreground">
        Loading full matchup model…
      </div>
    );
  }

  if (isError || !pregame || !liveBreakdown || !meta) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-4 font-sans text-xs text-muted-foreground">
        Couldn&apos;t load model breakdown for this matchup.
      </div>
    );
  }

  const pre = pregame.modelBreakdown;
  const clockLabel =
    game.state === "in" && game.clock
      ? `${game.clock} · ${game.period === 1 ? "1st half" : game.period === 2 ? "2nd half" : `OT${Math.max(0, (game.period ?? 1) - 2)}`}`
      : game.statusText;

  return (
    <div className="overflow-hidden rounded-lg border border-primary/25 bg-gradient-to-b from-primary/[0.06] to-card shadow-sm">
      <div className="flex items-start gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
        <Activity className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-xs font-semibold text-foreground">Live-adjusted predictor</p>
          <p className="mt-0.5 font-sans text-[10px] leading-snug text-muted-foreground">
            Pregame submodels from the API, re-weighted toward a score &amp; time heuristic as the clock runs (
            {Math.round(meta.blendWeight * 100)}% blend at {clockLabel}). Regulation baseline ≈{" "}
            {Math.floor(REGULATION_SECONDS / 60)} min.
          </p>
        </div>
      </div>

      {verbose ? (
        <div className="border-b border-border px-3 py-2 font-sans text-[11px] text-muted-foreground">
          Scoreboard margin (lower Kaggle ID team):{" "}
          <span className="font-medium text-foreground">
            {meta.marginTeam1 > 0 ? "+" : ""}
            {meta.marginTeam1}
          </span>
          {" · "}
          ~{Math.floor(meta.secondsRemaining / 60)}:
          {String(Math.floor(meta.secondsRemaining % 60)).padStart(2, "0")} left (est.)
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Model</span>
        <span className="text-center">Pre</span>
        <span className="col-span-2 text-right">Live (Δ)</span>
      </div>

      {ROWS.map(({ key, label, hint }) => (
        <div key={key}>
          <BreakdownCompareRow label={label} hint={hint} pre={pre[key]} live={liveBreakdown[key]} />
          <Separator className="bg-border" />
        </div>
      ))}

      <div className="grid grid-cols-1 gap-2 bg-muted/30 px-3 py-4 sm:grid-cols-2">
        <div>
          <div className="font-sans text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ensemble ({pregame.team1.abbreviation} perspective)
          </div>
          <div className="mt-1 font-sans text-2xl font-bold tabular-nums text-foreground">
            {pct(pre.ensemble)}
            <span className="mx-1 text-lg font-normal text-muted-foreground">→</span>
            {pct(liveBreakdown.ensemble)}
          </div>
        </div>
        <div>
          <div className="font-sans text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Away win ({game.away.abbreviation})
          </div>
          <div className="mt-1 font-sans text-2xl font-bold tabular-nums text-foreground">
            {awayWinPregame != null ? pct(awayWinPregame) : "—"}
            <span className="mx-1 text-lg font-normal text-muted-foreground">→</span>
            {awayWinLive != null ? pct(awayWinLive) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
