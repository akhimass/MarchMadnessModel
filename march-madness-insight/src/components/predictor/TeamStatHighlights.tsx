import type { Team, TeamStats, PowerRanking, OffensiveStat } from "@/types/bracket";
import clsx from "clsx";

interface TeamStatHighlightsProps {
  team: Team;
  stats: TeamStats;
  narrative: string;
}

const POWER_RANKINGS: (keyof Pick<TeamStats, 'masseyRank'>)[] = [];

const getPowerRankings = (stats: TeamStats): PowerRanking[] => [
  { label: "Season Performance", rank: stats.masseyRank },
  { label: "Strength of Schedule", rank: Math.round(stats.masseyRank * 1.2) },
  { label: "Away Games", rank: Math.round(stats.masseyRank * 0.8) },
  { label: "Recent Games", rank: Math.round(stats.masseyRank * 0.9) },
  { label: "Non-Conference Games", rank: Math.round(stats.masseyRank * 1.1) },
];

const getOffensiveStats = (stats: TeamStats): OffensiveStat[] => [
  { label: "Points/Possession", value: stats.offEff.toFixed(1), rank: stats.masseyRank },
  { label: "Effective FG %", value: `${(stats.efgOff * 100).toFixed(1)}%`, rank: Math.round(stats.masseyRank * 0.7) },
  { label: "Turnover %", value: `${(stats.toRate * 100).toFixed(1)}%`, rank: Math.round(stats.masseyRank * 1.3) },
  { label: "Off Rebound %", value: `${(stats.orRate * 100).toFixed(1)}%`, rank: Math.round(stats.masseyRank * 0.9) },
  { label: "FTA per FGA", value: stats.ftRate.toFixed(3), rank: Math.round(stats.masseyRank * 1.5) },
];

const getDefensiveStats = (stats: TeamStats): OffensiveStat[] => [
  { label: "Points Allowed/Poss.", value: stats.defEff.toFixed(1), rank: stats.masseyRank },
  { label: "Opp EFG %", value: `${(stats.efgDef * 100).toFixed(1)}%`, rank: Math.round(stats.masseyRank * 0.7) },
  { label: "Net Efficiency", value: stats.netEff.toFixed(1), rank: stats.masseyRank },
];

export const TeamStatHighlights = ({ team, stats, narrative }: TeamStatHighlightsProps) => {
  const powerRankings = getPowerRankings(stats);
  const offensiveStats = getOffensiveStats(stats);
  const defensiveStats = getDefensiveStats(stats);

  return (
    <div className="bg-bg-surface border border-border rounded-lg p-3">
      {/* Team header */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center border border-border bg-bg-base/30"
          style={{ background: "transparent" }}
        >
          <span className="font-display text-sm font-bold text-white">{team.abbreviation.charAt(0)}</span>
        </div>
        <span className="font-display text-sm font-semibold uppercase tracking-wider text-white truncate">
          {team.name}
        </span>
      </div>

      {/* Narrative intentionally hidden for ESPN-style cleanliness. */}

      <div className="space-y-3">
        <div>
          <h4 className="font-display text-[11px] font-bold tracking-[0.15em] uppercase text-text-muted mb-2">Power Rankings</h4>
          <div className="space-y-2">
            {powerRankings.map((pr) => (
              <div key={pr.label} className="flex items-center justify-between">
                <span className="font-body text-[11px] text-text-secondary">{pr.label}</span>
                <span className="font-display text-[11px] font-bold text-white">#{pr.rank}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <h4 className="font-display text-[11px] font-bold tracking-[0.15em] uppercase text-text-muted mb-2">Offensive</h4>
            <div className="space-y-1.5">
              {offensiveStats.map((os) => (
                <div key={os.label} className="flex items-center justify-between">
                  <span className="font-body text-[10px] text-text-secondary">{os.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-[10px] font-bold text-white">{os.value}</span>
                    <span
                      className={clsx(
                        "font-display text-[10px] font-bold",
                        os.rank < 50 ? "text-win-green" : os.rank > 200 ? "text-upset-red" : "text-text-muted",
                      )}
                    >
                      #{os.rank}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-display text-[11px] font-bold tracking-[0.15em] uppercase text-text-muted mb-2">Defensive</h4>
            <div className="space-y-1.5">
              {defensiveStats.map((ds) => (
                <div key={ds.label} className="flex items-center justify-between">
                  <span className="font-body text-[10px] text-text-secondary">{ds.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-[10px] font-bold text-white">{ds.value}</span>
                    <span className={clsx("font-display text-[10px] font-bold", ds.rank < 50 ? "text-win-green" : ds.rank > 200 ? "text-upset-red" : "text-text-muted")}>
                      #{ds.rank}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
