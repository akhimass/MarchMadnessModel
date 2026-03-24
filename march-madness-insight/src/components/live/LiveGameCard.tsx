import clsx from "clsx";
import { Clock, MapPin } from "lucide-react";
import type { LiveGame } from "@/lib/espnApi";
import { liveGameTeamDisplay } from "@/lib/bracketFieldDisplay";

export interface LiveGameCardProps {
  game: LiveGame;
  /** P(away wins) from our ensemble, men's field only when resolved */
  awayModelWinProb?: number | null;
  /** When true, flat bottom + no bottom radius so a live predictor panel can sit below in one shell */
  attachLivePanel?: boolean;
  /** Used to align seeds/names with bracket field (`teams2026` for men). */
  gender?: "M" | "W";
}

function logoFallbackLetters(team: LiveGame["away"]): string {
  const ab = (team.abbreviation || "").replace(/\s/g, "");
  if (ab.length >= 2 && ab.length <= 4 && !/\d/.test(ab)) return ab.slice(0, 3);
  const parts = (team.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .slice(0, 3)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 3);
  }
  return (parts[0]?.slice(0, 3) || ab.slice(0, 3) || "?").toUpperCase();
}

function TeamLine({
  team,
  isLive,
  isFinal,
  modelWinProb,
  gender,
}: {
  team: LiveGame["away"];
  isLive: boolean;
  isFinal: boolean;
  modelWinProb?: number | null;
  gender: "M" | "W";
}) {
  const showProb = modelWinProb != null && !Number.isNaN(modelWinProb);
  const disp = liveGameTeamDisplay(team, gender);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-7 shrink-0 text-center font-display text-[10px] font-bold tabular-nums text-muted-foreground">
          {disp.seed > 0 ? disp.seed : ""}
        </span>
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
          {team.logoUrl ? (
            <img
              src={team.logoUrl}
              alt=""
              className="h-full w-full object-contain p-0.5"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-sans text-[10px] font-semibold text-muted-foreground">
              {logoFallbackLetters(team)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={clsx(
              "truncate font-display text-sm font-semibold uppercase leading-tight tracking-tight",
              team.winner ? "text-foreground" : isFinal ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {disp.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {team.record ? (
              <span className="font-sans text-xs text-muted-foreground">{team.record}</span>
            ) : null}
            {showProb ? (
              <span className="font-sans text-xs font-medium text-primary">
                Model {Math.round(modelWinProb * 100)}%
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <span
        className={clsx(
          "shrink-0 font-sans text-2xl font-semibold tabular-nums",
          team.winner ? "text-foreground" : isFinal ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {isLive || isFinal ? team.score : "—"}
      </span>
    </div>
  );
}

export function LiveGameCard({ game, awayModelWinProb, attachLivePanel, gender = "M" }: LiveGameCardProps) {
  const isLive = game.state === "in";
  const isFinal = game.state === "post";

  const homeModelWinProb =
    awayModelWinProb != null && !Number.isNaN(awayModelWinProb) ? 1 - awayModelWinProb : null;

  return (
    <div
      className={clsx(
        "overflow-hidden border bg-card text-card-foreground transition-colors",
        attachLivePanel ? "rounded-t-lg rounded-b-none border-b-0 shadow-none" : "rounded-lg border shadow-sm",
        isLive ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
      )}
    >
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
          ) : null}
          <span
            className={clsx(
              "font-sans text-xs font-medium uppercase tracking-wide",
              isLive ? "text-destructive" : isFinal ? "text-muted-foreground" : "text-muted-foreground",
            )}
          >
            {game.statusText}
          </span>
        </div>
        {game.venue ? (
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="font-sans text-[10px]">{game.venue}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 px-4 py-3">
        <TeamLine team={game.away} isLive={isLive} isFinal={isFinal} modelWinProb={awayModelWinProb} gender={gender} />
        <TeamLine team={game.home} isLive={isLive} isFinal={isFinal} modelWinProb={homeModelWinProb} gender={gender} />
      </div>

      {isLive && game.clock ? (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="font-sans text-xs font-medium text-primary">
            {game.clock} · {game.period === 1 ? "1st half" : "2nd half"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
