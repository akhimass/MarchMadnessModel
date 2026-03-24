import { Link } from "react-router-dom";
import { Progress } from "@ui/progress";
import { Button } from "@ui/button";

interface SubmitBarProps {
  totalPicks: number;
  maxPicks: number;
}

export const SubmitBar = ({ totalPicks, maxPicks }: SubmitBarProps) => {
  const pct = (totalPicks / maxPicks) * 100;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto max-w-5xl space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <span>
              <span className="font-display text-base font-bold tabular-nums text-foreground">{totalPicks}</span>
              <span className="mx-1">/</span>
              {maxPicks} picks
            </span>
            <Link to="/live?tab=scores" className="font-sans text-xs font-medium text-primary hover:underline">
              Live scores
            </Link>
          </div>
          <span className="font-display text-sm font-bold tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
        </div>
        <Progress value={pct} className="h-2.5 bg-muted [&>div]:bg-primary" />
        <Button
          size="lg"
          className="w-full font-display text-base font-bold uppercase tracking-wider"
          disabled={totalPicks < maxPicks}
        >
          Submit bracket
        </Button>
      </div>
    </div>
  );
};
