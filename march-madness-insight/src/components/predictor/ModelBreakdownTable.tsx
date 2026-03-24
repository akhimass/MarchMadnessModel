import type { ModelBreakdown as ModelBreakdownType } from "@/types/bracket";
import { Separator } from "@ui/separator";

interface ModelBreakdownTableProps {
  breakdown: ModelBreakdownType;
  team1Abbrev: string;
  team2Abbrev: string;
  team1Color?: string;
}

const MODEL_LABELS: { key: keyof ModelBreakdownType; name: string; desc: string }[] = [
  { key: "decision_tree", name: "DECISION TREE", desc: "Identifies data trends with predictive significance" },
  { key: "power_ratings", name: "POWER RATINGS", desc: "Analyzes scoring margins and schedule strength" },
  { key: "similar_games", name: "SIMILAR GAMES", desc: "Based on results of similar past matchups" },
  { key: "simulation", name: "SIMULATION", desc: "Play-by-play computer simulation of game" },
  { key: "seed_difference", name: "SEED DIFFERENCE", desc: "Historical win odds for similar seed differences" },
];

export const ModelBreakdownTable = ({
  breakdown,
  team1Abbrev,
  team2Abbrev,
}: ModelBreakdownTableProps) => {
  const overallT1 = Math.round(breakdown.ensemble * 100);
  const overallT2 = 100 - overallT1;

  return (
    <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[80px_1fr_80px] items-center py-3 px-4 bg-bg-elevated">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-predict-blue flex items-center justify-center">
            <span className="font-display text-[9px] font-bold text-white">{team1Abbrev.charAt(0)}</span>
          </div>
          <span className="font-display text-sm font-bold uppercase tracking-wider text-white">{team1Abbrev}</span>
        </div>
        <span className="font-display text-[11px] font-bold tracking-[0.2em] uppercase text-text-muted text-center">
          Prediction Model
        </span>
        <div className="flex items-center gap-2 justify-end">
          <span className="font-display text-sm font-bold uppercase tracking-wider text-text-muted">{team2Abbrev}</span>
          <div className="w-5 h-5 rounded-full bg-neutral flex items-center justify-center">
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
            <div className="grid grid-cols-[80px_1fr_80px] items-center py-4 px-4 hover:bg-bg-elevated transition-colors">
              <span className="font-display text-[28px] font-bold text-white">{t1}%</span>
              <div className="text-center">
                <div className="font-display text-sm font-semibold uppercase tracking-wider text-white">{name}</div>
                <div className="font-body text-xs text-text-secondary mt-0.5">{desc}</div>
              </div>
              <span className="font-display text-[28px] font-bold text-text-muted text-right">{t2}%</span>
            </div>
            <Separator className="bg-border" />
          </div>
        );
      })}

      {/* Overall */}
      <div className="grid grid-cols-[80px_1fr_80px] items-center py-5 px-4 bg-bg-base">
        <span className="font-display text-4xl font-bold text-white">{overallT1}%</span>
        <div className="text-center">
          <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-text-secondary">
            Overall Prediction
          </div>
          <div className="font-body text-[10px] text-text-muted tracking-wider mt-0.5">
            Ensemble of all 5 models
          </div>
        </div>
        <span className="font-display text-4xl font-bold text-text-muted text-right">{overallT2}%</span>
      </div>
    </div>
  );
};
