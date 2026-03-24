import clsx from "clsx";

import { menTeams2026 } from "@/data/teams2026";
import type { LiveGame } from "@/lib/espnApi";
import type { Team } from "@/types/bracket";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";

const REGIONS = ["East", "South", "West", "Midwest"] as const;

function groupByRegion(teams: Team[]): Record<string, Team[]> {
  const out: Record<string, Team[]> = { East: [], South: [], West: [], Midwest: [] };
  for (const t of teams) {
    const r = t.region;
    if (out[r]) out[r].push(t);
  }
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => a.seed - b.seed);
  }
  return out;
}

function liveAbbrevsForTeam(games: LiveGame[], abbrev: string): boolean {
  const u = abbrev.toUpperCase();
  return games.some(
    (g) => g.away.abbreviation.toUpperCase() === u || g.home.abbreviation.toUpperCase() === u,
  );
}

export function LiveBracketPreview({ liveGames }: { liveGames: LiveGame[] }) {
  const byRegion = groupByRegion(menTeams2026);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {REGIONS.map((region) => (
        <Card key={region} className="border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="font-sans text-base font-semibold tracking-tight">{region}</CardTitle>
            <CardDescription className="font-sans text-xs">
              Men&apos;s tournament field · live games highlighted
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[min(55vh,28rem)] space-y-1 overflow-y-auto pr-1">
            {(byRegion[region] ?? []).map((t) => {
              const live = liveAbbrevsForTeam(liveGames, t.abbreviation);
              return (
                <div
                  key={t.id}
                  className={clsx(
                    "flex items-center justify-between rounded-md border px-2 py-1.5 font-sans text-xs",
                    live
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent bg-muted/30",
                  )}
                >
                  <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{t.seed}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{t.name}</span>
                  {live ? (
                    <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      Live
                    </span>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
