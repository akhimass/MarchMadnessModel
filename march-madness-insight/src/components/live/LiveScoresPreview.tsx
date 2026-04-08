import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Radio } from "lucide-react";
import clsx from "clsx";

import { useTournamentLiveScores } from "@/hooks/useLiveScores";
import type { LiveGame } from "@/lib/espnApi";
import { logoUrlFromTeamName } from "@/lib/teamLogo";
import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";

function sortGamesForPreview(games: LiveGame[]): LiveGame[] {
  const rank = (g: LiveGame) => (g.state === "in" ? 0 : g.state === "pre" ? 1 : 2);
  return [...games].sort((a, b) => rank(a) - rank(b) || a.shortName.localeCompare(b.shortName));
}

function MiniGameRow({ game }: { game: LiveGame }) {
  const isLive = game.state === "in";
  const isFinal = game.state === "post";
  return (
    <div
      className={clsx(
        "flex min-w-[220px] flex-col gap-1.5 rounded-lg border px-3 py-2.5 transition-colors",
        isLive ? "border-predict-blue/40 bg-primary/5" : "border-border bg-card/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={clsx(
            "font-sans text-[10px] font-semibold uppercase tracking-wide",
            isLive ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {isLive ? "● Live" : game.statusText}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-7 w-7 shrink-0 overflow-hidden rounded border border-border bg-muted/50">
            <img
              src={game.away.logoUrl || logoUrlFromTeamName(game.away.name)}
              alt=""
              className="h-full w-full object-contain p-0.5"
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
          <span
            className={clsx(
              "truncate font-sans font-medium",
              game.away.winner && isFinal ? "text-foreground" : "text-foreground/90",
            )}
          >
            {game.away.seed ? `${game.away.seed} ` : ""}
            {game.away.abbreviation}
          </span>
        </div>
        <span className="font-sans tabular-nums font-semibold text-foreground">
          {isLive || isFinal ? game.away.score : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-7 w-7 shrink-0 overflow-hidden rounded border border-border bg-muted/50">
            <img
              src={game.home.logoUrl || logoUrlFromTeamName(game.home.name)}
              alt=""
              className="h-full w-full object-contain p-0.5"
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
          <span
            className={clsx(
              "truncate font-sans font-medium",
              game.home.winner && isFinal ? "text-foreground" : "text-foreground/90",
            )}
          >
            {game.home.seed ? `${game.home.seed} ` : ""}
            {game.home.abbreviation}
          </span>
        </div>
        <span className="font-sans tabular-nums font-semibold text-foreground">
          {isLive || isFinal ? game.home.score : "—"}
        </span>
      </div>
    </div>
  );
}

interface LiveScoresPreviewProps {
  /** Max games to show in the horizontal strip */
  maxGames?: number;
  className?: string;
}

/**
 * ESPN scoreboard preview for home hub & secondary surfaces. Full board: `/live`.
 */
export function LiveScoresPreview({ maxGames = 4, className }: LiveScoresPreviewProps) {
  const [gender, setGender] = useState<"M" | "W">("M");
  const { data: games, isLoading, isFetching, dataUpdatedAt } = useTournamentLiveScores(gender);

  const preview = useMemo(() => {
    if (!games?.length) return [];
    return sortGamesForPreview(games).slice(0, maxGames);
  }, [games, maxGames]);

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

  return (
    <Card className={clsx("overflow-hidden border bg-card shadow-sm", className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Radio className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="font-sans text-base font-semibold tracking-tight">Live scores</CardTitle>
              <CardDescription className="text-xs">Tournament games · ESPN + model odds</CardDescription>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={gender}
            onValueChange={(v) => {
              if (v === "M" || v === "W") setGender(v);
            }}
            className="rounded-lg border border-border bg-muted/40 p-0.5"
            size="sm"
          >
            <ToggleGroupItem value="M" className="px-3 text-xs font-sans font-medium uppercase">
              Men&apos;s
            </ToggleGroupItem>
            <ToggleGroupItem value="W" className="px-3 text-xs font-sans font-medium uppercase">
              Women&apos;s
            </ToggleGroupItem>
          </ToggleGroup>
          {lastUpdate ? (
            <span className="text-[10px] text-muted-foreground">{isFetching ? "Updating…" : `Updated ${lastUpdate}`}</span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {isLoading ? (
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: maxGames }).map((_, i) => (
              <Skeleton key={i} className="h-[88px] min-w-[220px] rounded-lg" />
            ))}
          </div>
        ) : preview.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 py-8 text-center text-sm text-muted-foreground">
            No games on the board right now. Open the full scoreboard on game days.
          </p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex w-max gap-2 pr-2">
              {preview.map((g) => (
                <MiniGameRow key={g.espnId} game={g} />
              ))}
            </div>
          </div>
        )}

        <Button variant="secondary" className="w-full font-sans text-xs font-medium" asChild>
          <Link to={`/live?gender=${gender}&tab=scores`}>
            Full scoreboard
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
