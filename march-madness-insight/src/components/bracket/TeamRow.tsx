import clsx from "clsx";
import type { Team } from "@/types/bracket";

interface TeamRowProps {
  team: Team;
  selected: boolean;
  onClick: () => void;
}

export const TeamRow = ({ team, selected, onClick }: TeamRowProps) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors sm:py-4",
      selected ? "bg-primary/10" : "hover:bg-muted/60",
    )}
  >
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-transparent">
      {team.logoUrl ? (
        <img
          src={team.logoUrl}
          alt={team.name}
          className="h-9 w-9 object-contain"
          loading="lazy"
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span className="font-display text-lg font-bold text-foreground">{team.abbreviation.charAt(0)}</span>
      )}
    </div>

    <span className="w-7 shrink-0 text-center font-display text-lg font-bold tabular-nums text-muted-foreground">
      {team.seed}
    </span>

    <span className="min-w-0 flex-1 truncate font-display text-base font-semibold uppercase tracking-wide text-foreground sm:text-lg">
      {team.name}
    </span>

    <div
      className={clsx(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
        selected ? "border-primary" : "border-muted-foreground/40",
      )}
      aria-hidden
    >
      {selected && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
    </div>
  </button>
);
