import clsx from "clsx";
import type { Team } from "@/types/bracket";

interface PickBubbleProps {
  team: Team;
}

export const PickBubble = ({ team }: PickBubbleProps) => (
  <div className="flex min-w-[100px] flex-col items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
    <div className="font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">My pick</div>

    <div
      className={clsx(
        "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-border bg-transparent",
        team.logoUrl ? "p-1" : "",
      )}
    >
      {team.logoUrl ? (
        <img
          src={team.logoUrl}
          alt={team.name}
          className="h-full w-full object-contain"
          loading="lazy"
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span className="font-display text-xl font-bold text-foreground">{team.abbreviation.charAt(0)}</span>
      )}
    </div>

    <div className="font-display text-sm font-bold uppercase tracking-wide text-foreground">{team.abbreviation}</div>
    <div className="max-w-[96px] truncate text-center font-body text-xs text-muted-foreground">{team.name}</div>
  </div>
);
