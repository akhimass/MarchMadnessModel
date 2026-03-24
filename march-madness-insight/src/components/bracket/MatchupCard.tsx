import { useNavigate } from "react-router-dom";
import type { BracketMatchup } from "@/types/bracket";
import { TeamRow } from "./TeamRow";
import { PickBubble } from "./PickBubble";
import { Card, CardContent } from "@ui/card";
import { Button } from "@ui/button";
import { Separator } from "@ui/separator";
import { Badge } from "@ui/badge";
import { cn } from "@/lib/utils";

interface MatchupCardProps {
  matchup: BracketMatchup;
  pick?: number;
  onPick: (slot: string, teamId: number) => void;
  previewStage?: string;
}

export const MatchupCard = ({ matchup, pick, onPick, previewStage = "R1" }: MatchupCardProps) => {
  const navigate = useNavigate();
  const pickedTeam = pick === matchup.team1.id ? matchup.team1 : pick === matchup.team2.id ? matchup.team2 : null;

  return (
    <Card
      className={cn(
        "overflow-hidden border-border bg-card shadow-sm transition-shadow hover:shadow-md",
        matchup.upsetFlag && "ring-1 ring-destructive/30",
      )}
    >
      <CardContent className="flex p-0">
        <div className="min-w-0 flex-1">
          <TeamRow
            team={matchup.team1}
            selected={pick === matchup.team1.id}
            onClick={() => onPick(matchup.slot, matchup.team1.id)}
          />
          <Separator />
          <TeamRow
            team={matchup.team2}
            selected={pick === matchup.team2.id}
            onClick={() => onPick(matchup.slot, matchup.team2.id)}
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/20 px-3 py-2.5 sm:px-4">
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 font-semibold text-primary"
              onClick={() => {
              const p = String(matchup.id).split("-");
              if (p.length >= 2) navigate(`/predictor/${p[0]}/${p[1]}?stage=${encodeURIComponent(previewStage)}`);
            }}
            >
              Preview
            </Button>
            {matchup.gameTime && (
              <span className="text-sm text-muted-foreground">{matchup.gameTime}</span>
            )}
            {matchup.upsetFlag && (
              <Badge variant="destructive" className="ml-auto shrink-0 text-xs">
                Upset watch
              </Badge>
            )}
          </div>
        </div>

        {pickedTeam && (
          <div className="flex items-stretch border-l border-border bg-muted/10 px-2 sm:px-3">
            <PickBubble team={pickedTeam} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
