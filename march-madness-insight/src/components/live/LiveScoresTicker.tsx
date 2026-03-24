import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import clsx from "clsx";

import { useTournamentLiveScores } from "@/hooks/useLiveScores";
import type { LiveGame } from "@/lib/espnApi";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";

function rank(g: LiveGame) {
  return g.state === "in" ? 0 : g.state === "pre" ? 1 : 2;
}

/**
 * Slim strip for bracket page — live games first, deep-link to `/live`.
 */
export function LiveScoresTicker() {
  const [gender, setGender] = useState<"M" | "W">("M");
  const { data: games, isLoading } = useTournamentLiveScores(gender);

  const line = useMemo(() => {
    if (!games?.length) return [];
    return [...games].sort((a, b) => rank(a) - rank(b) || a.shortName.localeCompare(b.shortName)).slice(0, 3);
  }, [games]);

  return (
    <div className="border-b border-border bg-muted/30">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Radio className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="font-sans text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Live</span>
          <ToggleGroup
            type="single"
            value={gender}
            onValueChange={(v) => {
              if (v === "M" || v === "W") setGender(v);
            }}
            className="h-7 rounded-md border border-border bg-background/80 p-0.5"
            size="sm"
          >
            <ToggleGroupItem value="M" className="h-6 px-2 text-[10px] font-sans font-semibold uppercase">
              M
            </ToggleGroupItem>
            <ToggleGroupItem value="W" className="h-6 px-2 text-[10px] font-sans font-semibold uppercase">
              W
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          {isLoading ? (
            <span className="text-xs text-muted-foreground">Loading scores…</span>
          ) : line.length === 0 ? (
            <span className="truncate font-sans text-xs text-muted-foreground">No tournament games</span>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs">
              {line.map((g) => (
                <span key={g.espnId} className="truncate font-sans font-medium text-foreground/90">
                  <span
                    className={clsx(
                      "mr-1 text-[10px] font-semibold uppercase",
                      g.state === "in" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {g.state === "in" ? "LIVE" : g.state === "pre" ? "NEXT" : "FINAL"}
                  </span>
                  {g.away.abbreviation} {g.state !== "pre" ? g.away.score : ""}–{g.state !== "pre" ? g.home.score : ""}{" "}
                  {g.home.abbreviation}
                </span>
              ))}
            </div>
          )}
          <Link
            to={`/live?gender=${gender}&tab=scores`}
            className="shrink-0 font-sans text-[10px] font-semibold uppercase tracking-wide text-primary hover:underline"
          >
            All games →
          </Link>
        </div>
      </div>
    </div>
  );
}
