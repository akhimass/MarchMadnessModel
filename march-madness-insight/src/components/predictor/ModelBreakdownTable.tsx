import type { ModelBreakdown as ModelBreakdownType } from "@/types/bracket";
import { Separator } from "@ui/separator";

interface ModelBreakdownTableProps {
  breakdown: ModelBreakdownType;
  team1Abbrev: string;
  team2Abbrev: string;
  team1Color?: string;
  /** When true, sub-models are placeholders; probability is still from seed/heuristic ensemble. */
  degraded?: boolean;
}

const MODEL_LABELS: { key: keyof ModelBreakdownType; name: string; desc: string }[] = [
  {
    key: "decision_tree",
    name: "Decision tree (GBM)",
    desc: "Gradient boosting on game features — splits that historically separate winners.",
  },
  {
    key: "power_ratings",
    name: "Power ratings (LR)",
    desc: "Logistic regression on efficiency and strength signals vs opponent.",
  },
  {
    key: "similar_games",
    name: "Similar games (RF)",
    desc: "Random forest trained on outcomes of comparable matchups.",
  },
  {
    key: "simulation",
    name: "Simulation (MLP)",
    desc: "Neural net layer on pace/scenario-style inputs.",
  },
  {
    key: "seed_difference",
    name: "Seed / history",
    desc: "Historical win rate for similar seed gaps (calibrated prior).",
  },
];

export const ModelBreakdownTable = ({
  breakdown,
  team1Abbrev,
  team2Abbrev,
  degraded,
}: ModelBreakdownTableProps) => {
  const overallT1 = Math.round(breakdown.ensemble * 100);
  const overallT2 = 100 - overallT1;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-surface">
      {degraded ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-100">
          Full ensemble is still loading. Sub-model rows below are neutral; the headline % uses the live seed-adjusted
          matchup engine.
        </div>
      ) : null}
      {/* Header */}
      <div className="grid grid-cols-[80px_1fr_80px] items-center bg-bg-elevated px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-predict-blue">
            <span className="font-display text-[9px] font-bold text-white">{team1Abbrev.charAt(0)}</span>
          </div>
          <span className="font-display text-sm font-bold uppercase tracking-wider text-white">{team1Abbrev}</span>
        </div>
        <span className="text-center font-display text-[11px] font-bold uppercase tracking-[0.2em] text-text-muted">
          Sub-model lean (Team1 win share)
        </span>
        <div className="flex items-center justify-end gap-2">
          <span className="font-display text-sm font-bold uppercase tracking-wider text-text-muted">{team2Abbrev}</span>
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral">
            <span className="font-display text-[9px] font-bold text-white">{team2Abbrev.charAt(0)}</span>
          </div>
        </div>
      </div>

      {/* Model rows */}
      {MODEL_LABELS.map(({ key, name, desc }) => {
        const t1 = Math.round(breakdown[key] * 100);
        const t2 = 100 - t1;
        return (
          <div key={key}>
            <div className="grid grid-cols-[80px_1fr_80px] items-center px-4 py-4 transition-colors hover:bg-bg-elevated">
              <span className="font-display text-[28px] font-bold text-white">{t1}%</span>
              <div className="text-center">
                <div className="font-display text-sm font-semibold uppercase tracking-wider text-white">{name}</div>
                <div className="mt-0.5 font-body text-xs text-text-secondary">{desc}</div>
              </div>
              <span className="text-right font-display text-[28px] font-bold text-text-muted">{t2}%</span>
            </div>
            <Separator className="bg-border" />
          </div>
        );
      })}

      {/* Overall */}
      <div className="grid grid-cols-[80px_1fr_80px] items-center bg-bg-base px-4 py-5">
        <span className="font-display text-4xl font-bold text-white">{overallT1}%</span>
        <div className="text-center">
          <div className="font-display text-xs font-bold uppercase tracking-[0.2em] text-text-secondary">
            Overall (ensemble)
          </div>
          <div className="mt-0.5 font-body text-[10px] text-text-muted">Standard win probability for {team1Abbrev}</div>
        </div>
        <span className="text-right font-display text-4xl font-bold text-text-muted">{overallT2}%</span>
      </div>
    </div>
  );
};
