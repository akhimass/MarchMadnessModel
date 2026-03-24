import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

interface AppBrandBarProps {
  className?: string;
  /** Short context, e.g. "Bracket" or "Matchup" */
  contextLabel?: string;
  contextDescription?: string;
  endSlot?: ReactNode;
}

/**
 * Top bar: brand always links to home. Use on bracket + predictor so users can exit to landing.
 */
export function AppBrandBar({ className, contextLabel, contextDescription, endSlot }: AppBrandBarProps) {
  return (
    <div className={cn("border-b border-border bg-card/85 backdrop-blur-sm", className)}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            to="/bracket"
            className="font-display text-base font-bold tracking-tight text-foreground transition-colors hover:text-primary sm:text-lg"
          >
            Akhi&apos;s March Madness Analyzer
          </Link>
          {contextLabel ? (
            <>
              <span className="hidden h-6 w-px shrink-0 bg-border sm:block" aria-hidden />
              <div className="min-w-0">
                <p className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">{contextLabel}</p>
                {contextDescription ? (
                  <p className="truncate text-xs text-muted-foreground">{contextDescription}</p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        {endSlot ? <div className="flex shrink-0 flex-wrap items-center gap-2">{endSlot}</div> : null}
      </div>
    </div>
  );
}
