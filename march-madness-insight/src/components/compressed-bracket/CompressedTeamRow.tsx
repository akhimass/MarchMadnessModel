import { useState } from "react";
import type { Team } from "@/lib/compressedBracketTypes";
import { logoUrlFromTeamName } from "@/lib/teamLogo";

interface CompressedTeamRowProps {
  team: Team;
  score?: number;
  isWinner: boolean;
  compact?: boolean;
  compactMultiline?: boolean;
  logoLoading?: boolean;
  winnerRowHighlight?: boolean;
}

export function CompressedTeamRow({
  team,
  score,
  isWinner,
  compact = false,
  compactMultiline = false,
  logoLoading = false,
  winnerRowHighlight = false,
}: CompressedTeamRowProps) {
  const [logoError, setLogoError] = useState(false);
  const showPlaceholder = team.id <= 0 || logoError;
  const href = !showPlaceholder && team.name !== "TBD" ? logoUrlFromTeamName(team.name) : null;

  return (
    <div
      className={`BracketCell__CompetitorItem flex items-center justify-between ${
        compact ? "min-h-[16px] px-1.5 py-[2px] sm:min-h-[17px]" : "min-h-[20px] px-1.5 py-0.5"
      } ${winnerRowHighlight && isWinner ? "bg-emerald-500/[0.06]" : ""}`}
    >
      <div className="BracketCell__Competitor flex min-w-0 items-center gap-1">
        <div
          className={`BracketCell__Logo flex shrink-0 items-center justify-center ${compact ? "h-[14px] w-[14px] sm:h-[16px] sm:w-[16px]" : "h-[18px] w-[18px]"}`}
        >
          {logoLoading ? (
            <div className="flex h-full w-full items-center justify-center rounded bg-[#e8e9e9]" aria-hidden>
              <span
                className={`h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-2 border-[#6c6e6f] border-t-transparent sm:h-3 sm:w-3 ${compact ? "" : ""}`}
              />
            </div>
          ) : showPlaceholder ? (
            <div className="h-full w-full rounded bg-[#b5b7b7]" />
          ) : (
            <img
              src={href!}
              alt={team.name}
              className="h-full w-full object-contain"
              onError={() => setLogoError(true)}
            />
          )}
        </div>
        <div
          className={`BracketCell__Rank shrink-0 text-right text-[#9a9c9d] ${
            compact ? "min-w-[10px] text-[9px] sm:min-w-[12px] sm:text-[10px]" : "min-w-[12px] text-[10px]"
          }`}
        >
          {team.seed}
        </div>
        <div
          className={`BracketCell__Name min-w-0 flex-1 ${
            compact && compactMultiline
              ? "line-clamp-2 break-words text-[10px] leading-[1.2] sm:text-[11px]"
              : compact
                ? "max-w-[60px] truncate text-[10px] sm:max-w-[72px] sm:text-[11px]"
                : "max-w-[80px] truncate text-[12px]"
          } ${isWinner ? "font-medium text-[#121213]" : "font-normal text-[#121213]"}`}
        >
          {team.name}
        </div>
      </div>

      {score !== undefined && (
        <div
          className={`BracketCell__Score relative flex shrink-0 items-center font-mono font-bold ${
            compact ? "text-[10px] sm:text-[11px]" : "text-[12px]"
          } ${isWinner ? "text-[#121213]" : "text-[#6c6e6f]"}`}
        >
          {score}
        </div>
      )}
    </div>
  );
}
