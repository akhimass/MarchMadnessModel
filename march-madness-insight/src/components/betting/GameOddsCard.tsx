import type { OddsGame } from "@/lib/oddsApi";
import { getConsensusOdds } from "@/lib/oddsApi";
import { MatchupBreakdownPanel } from "@/components/betting/MatchupBreakdownPanel";
import { logoUrlFromTeamName } from "@/lib/teamLogo";
import { Card, CardContent } from "@ui/card";
import { Button } from "@ui/button";

function formatAmericanOdds(odds: number | null): string {
  if (odds == null) return "—";
  const rounded = Math.round(odds * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

function formatGameTime(iso: string): string {
  const date = new Date(iso);
  // EDT for March 2026 tournament window.
  const etOffsetMinutes = -4 * 60;
  const etDate = new Date(date.getTime() + etOffsetMinutes * 60 * 1000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayName = days[etDate.getUTCDay()];
  const month = months[etDate.getUTCMonth()];
  const day = etDate.getUTCDate();
  const hours = etDate.getUTCHours();
  const mins = etDate.getUTCMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  const m = mins === 0 ? "" : `:${String(mins).padStart(2, "0")}`;
  return `${dayName}, ${month} ${day}, ${h}${m} ${ampm} ET`;
}

export function GameOddsCard({
  game,
  homeName,
  awayName,
  homeOddsName,
  awayOddsName,
  homeProb,
  awayProb,
  onAdd,
  addedState,
  suggestedStake,
  resultSummary,
  resultsOnly,
  homeTeamId,
  awayTeamId,
}: {
  game: OddsGame;
  homeName: string;
  awayName: string;
  /** Book strings for moneyline lookup (may differ from display names, e.g. UConn vs Connecticut Huskies). */
  homeOddsName?: string;
  awayOddsName?: string;
  homeProb: number | null;
  awayProb: number | null;
  onAdd: (side: "home" | "away") => void;
  addedState?: Record<string, boolean>;
  suggestedStake?: { home?: number; away?: number };
  resultSummary?: string;
  /** Final score only — hide moneyline and bet actions. */
  resultsOnly?: boolean;
  /** Kaggle IDs — loads the same `/api/matchup` breakdown as the predictor when both set. */
  homeTeamId?: number;
  awayTeamId?: number;
}) {
  const homeKey = homeOddsName ?? homeName;
  const awayKey = awayOddsName ?? awayName;
  const hideBetting = Boolean(resultsOnly);
  const homeMl = hideBetting ? null : getConsensusOdds(game, homeKey, "h2h");
  const awayMl = hideBetting ? null : getConsensusOdds(game, awayKey, "h2h");
  const spread = hideBetting ? undefined : game.bookmakers[0]?.markets?.find((m) => m.key === "spreads");
  const homeLogo = logoUrlFromTeamName(homeName);
  const awayLogo = logoUrlFromTeamName(awayName);
  const predictedWinner = homeProb != null && awayProb != null ? (homeProb >= awayProb ? homeName : awayName) : null;
  const predictedWinnerProb = homeProb != null && awayProb != null
    ? Math.max(homeProb, awayProb)
    : null;

  return (
    <Card className="border-[#2a3860] bg-card shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="font-semibold text-blue-400">
            {game.roundLabel ?? "Sweet 16"} · {game.broadcast ?? "TV TBD"}
          </span>
          <div className="flex items-center gap-2">
            {hideBetting ? (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">
                🔒 Betting Closed
              </span>
            ) : null}
            <span>{hideBetting ? "Final" : formatGameTime(game.commence_time)}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-display text-sm font-bold uppercase text-white">
                <img src={awayLogo} alt="" className="h-6 w-6 rounded-full bg-muted/40 p-0.5" />
                {awayName}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{formatAmericanOdds(awayMl)}</span>
            </div>
            {awayProb != null ? (
              <p className="text-[11px] text-muted-foreground">Model: {(awayProb * 100).toFixed(1)}%</p>
            ) : null}
            {!hideBetting ? (
              <Button size="sm" variant="secondary" className="w-full font-display text-[10px] uppercase" type="button" onClick={() => onAdd("away")}>
                {addedState?.[`${game.id}-away`] ? "Added ✓" : "Add to bet slip →"}
              </Button>
            ) : null}
            {!hideBetting && suggestedStake?.away ? (
              <Button size="default" variant="outline" className="w-full font-display text-[11px] uppercase" type="button" onClick={() => onAdd("away")}>
                Suggested bet: ${Math.round(suggestedStake.away)}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-display text-sm font-bold uppercase text-white">
                <img src={homeLogo} alt="" className="h-6 w-6 rounded-full bg-muted/40 p-0.5" />
                {homeName}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{formatAmericanOdds(homeMl)}</span>
            </div>
            {homeProb != null ? (
              <p className="text-[11px] text-muted-foreground">Model: {(homeProb * 100).toFixed(1)}%</p>
            ) : null}
            {!hideBetting ? (
              <Button size="sm" variant="secondary" className="w-full font-display text-[10px] uppercase" type="button" onClick={() => onAdd("home")}>
                {addedState?.[`${game.id}-home`] ? "Added ✓" : "Add to bet slip →"}
              </Button>
            ) : null}
            {!hideBetting && suggestedStake?.home ? (
              <Button size="default" variant="outline" className="w-full font-display text-[11px] uppercase" type="button" onClick={() => onAdd("home")}>
                Suggested bet: ${Math.round(suggestedStake.home)}
              </Button>
            ) : null}
          </div>
        </div>
        {spread ? (
          <p className="text-[11px] text-muted-foreground">
            Spread:{" "}
            {spread.outcomes
              .map((o) => `${o.name} ${o.point != null ? o.point : ""} (${o.price})`)
              .join(" / ")}
          </p>
        ) : null}
        {!hideBetting ? (
        <details className="rounded border border-border/70 bg-card/40 p-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-semibold text-foreground">Game stats & model breakdown</summary>
          <div className="mt-2 space-y-1">
            <div>
              Predicted winner: <span className="font-semibold text-foreground">{predictedWinner ?? "TBD"}</span>
            </div>
            <div>
              Win probs: {awayName} {awayProb != null ? `${(awayProb * 100).toFixed(1)}%` : "—"} · {homeName}{" "}
              {homeProb != null ? `${(homeProb * 100).toFixed(1)}%` : "—"}
            </div>
            <div>
              Moneyline: {awayName} {formatAmericanOdds(awayMl)} · {homeName} {formatAmericanOdds(homeMl)}
            </div>
          </div>
          {typeof homeTeamId === "number" &&
          typeof awayTeamId === "number" &&
          homeTeamId > 0 &&
          awayTeamId > 0 ? (
            <div className="mt-4 border-t border-border/60 pt-3 text-foreground">
              <p className="mb-2 text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground">
                Full model (predictor)
              </p>
              <MatchupBreakdownPanel homeTeamId={homeTeamId} awayTeamId={awayTeamId} />
            </div>
          ) : null}
        </details>
        ) : null}
        {hideBetting && predictedWinner && predictedWinnerProb != null ? (
          <div className="rounded border border-blue-500/20 bg-blue-500/5 px-2 py-1 text-[11px] text-blue-300">
            Model suggested: <span className="font-semibold">{predictedWinner}</span> ({(predictedWinnerProb * 100).toFixed(1)}%)
          </div>
        ) : null}
        {resultSummary ? (
          <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-300">
            {resultSummary}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
