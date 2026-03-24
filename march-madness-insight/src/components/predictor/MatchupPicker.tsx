import { useState } from "react";
import clsx from "clsx";
import type { Team } from "@/types/bracket";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@ui/accordion";
import { Card } from "@ui/card";
import { Button } from "@ui/button";

interface MatchupPickerProps {
  team1: Team;
  team2: Team;
  onPick: (teamId: number) => void;
  currentPick?: number;
}

/** Region label is outside the pick button so tapping it does not select a team. */
const TeamCard = ({
  team,
  selected,
  onClick,
}: {
  team: Team;
  selected: boolean;
  onClick: () => void;
}) => (
  <div
    className={clsx(
      "relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm transition-all",
      selected ? "border-primary ring-2 ring-primary/30" : "border-border bg-card hover:border-muted-foreground/30",
    )}
  >
    <div
      className="pointer-events-none select-none border-b border-border bg-muted/40 px-3 py-2 text-center"
      aria-hidden
    >
      <div className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        #{team.seed} seed
      </div>
      <div className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">{team.region}</div>
    </div>

    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "relative flex flex-1 flex-col items-center p-4 text-center transition-colors",
        selected ? "bg-primary/10" : "hover:bg-muted/30",
      )}
    >
      <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border bg-transparent">
        {team.logoUrl ? (
          <img
            src={team.logoUrl}
            alt={team.name}
            className="h-14 w-14 object-contain"
            loading="lazy"
            draggable={false}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="font-display text-2xl font-bold text-foreground">{team.abbreviation.charAt(0)}</span>
        )}
      </div>

      <div className="font-display text-base font-bold uppercase tracking-wide text-foreground sm:text-lg">{team.name}</div>
      {team.nickname ? (
        <div className="mt-0.5 font-display text-xs font-normal uppercase tracking-wider text-muted-foreground">
          {team.nickname}
        </div>
      ) : null}
      {(team.record || team.conference) && (
        <div className="mt-2 font-body text-[11px] text-muted-foreground">
          {team.record}
          {team.record && team.conference ? " · " : ""}
          {team.conference}
        </div>
      )}

      <div
        className={clsx(
          "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2",
          selected ? "border-primary" : "border-muted-foreground/40",
        )}
        aria-hidden
      >
        {selected && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </div>
    </button>
  </div>
);

export const MatchupPicker = ({ team1, team2, onPick, currentPick }: MatchupPickerProps) => {
  const [showTooltip, setShowTooltip] = useState(true);

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <Accordion type="single" collapsible defaultValue="matchup">
        <AccordionItem value="matchup" className="border-0">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="text-left font-body text-sm text-muted-foreground">
              #{team1.seed} {team1.name} vs. #{team2.seed} {team2.name}
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="relative flex flex-col gap-3 sm:flex-row">
              <TeamCard
                team={team1}
                selected={currentPick === team1.id}
                onClick={() => {
                  onPick(team1.id);
                  setShowTooltip(false);
                }}
              />
              <TeamCard
                team={team2}
                selected={currentPick === team2.id}
                onClick={() => {
                  onPick(team2.id);
                  setShowTooltip(false);
                }}
              />

              {showTooltip && !currentPick && (
                <div className="absolute left-1/2 top-1/2 z-10 max-w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-primary/30 bg-primary px-4 py-3 text-primary-foreground shadow-lg">
                  <p className="text-center font-body text-sm leading-snug">
                    Tap a team below to pick a winner (region label above is not a control).
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute -right-2 -top-2 h-7 w-7 rounded-full p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTooltip(false);
                    }}
                  >
                    ×
                  </Button>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
};
