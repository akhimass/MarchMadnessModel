import type { InjuryImpact } from "@/types/bracket";

interface InjuryBannerProps {
  injury?: InjuryImpact;
  teamName: string;
}

export const InjuryBanner = ({ injury, teamName }: InjuryBannerProps) => {
  if (!injury || (injury.severity !== "high" && injury.severity !== "critical")) return null;

  return (
    <div className="flex items-center gap-2.5 bg-[hsl(30_100%_5%)] border border-[hsl(30_80%_25%)] rounded-lg p-3 px-4">
      <span className="text-base flex-shrink-0">🏥</span>
      <div className="font-body text-xs text-[hsl(30_100%_70%)] flex-1">
        <strong>{teamName}</strong> — {injury.keyPlayerOut} · {injury.reasoning}
      </div>
      <span className="font-display text-base font-bold text-[hsl(30_100%_60%)] flex-shrink-0">
        {injury.adjustment > 0 ? "+" : ""}{Math.round(injury.adjustment * 100)}%
      </span>
    </div>
  );
};
