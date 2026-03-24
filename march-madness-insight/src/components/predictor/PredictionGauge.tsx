import { useEffect, useState } from "react";

interface PredictionGaugeProps {
  prob: number;
  team1: string;
  team2: string;
  team1Abbrev: string;
  team2Abbrev: string;
  team1Color?: string;
}

export const PredictionGauge = ({
  prob,
  team1,
  team2,
  team1Abbrev,
  team2Abbrev,
  team1Color,
}: PredictionGaugeProps) => {
  const W = 260;
  const H = 150;
  const cx = W / 2;
  const cy = H - 10;
  const r = 90;
  const strokeW = 22;
  const totalArc = Math.PI * r;

  const [animatedDash, setAnimatedDash] = useState(totalArc);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedDash(totalArc - prob * totalArc);
    }, 150);
    return () => clearTimeout(timer);
  }, [prob, totalArc]);

  const t1Pct = Math.round(prob * 100);
  const t2Pct = 100 - t1Pct;
  const favored = prob >= 0.5 ? team1 : team2;
  const favoredAbbrev = prob >= 0.5 ? team1Abbrev : team2Abbrev;

  return (
    <div className="flex items-end gap-4 my-4">
      {/* Team 1 win % */}
      <div className="flex-1 flex flex-col items-start">
        <div className="font-display text-sm font-bold uppercase tracking-wider text-white mb-1">
          {team1Abbrev}
        </div>
        <div className="font-display text-[48px] font-bold leading-none text-white tracking-tight">
          {t1Pct}%
        </div>
        <div className="font-body text-xs text-text-secondary mt-1">Odds to win</div>
      </div>

      {/* Gauge */}
      <div className="flex flex-col items-center flex-shrink-0">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* Background arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="hsl(0 0% 16%)"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke={team1Color || "hsl(212 82% 42%)"}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={totalArc}
            strokeDashoffset={animatedDash}
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
          {/* Center circle */}
          <circle cx={cx} cy={cy - 10} r={24} fill="hsl(0 0% 6%)" stroke="hsl(0 0% 16%)" strokeWidth="1.5" />
          <text
            x={cx}
            y={cy - 14}
            textAnchor="middle"
            fontFamily="'Oswald', sans-serif"
            fontSize="14"
            fontWeight="700"
            fill={team1Color || "hsl(212 82% 42%)"}
          >
            {favoredAbbrev}
          </text>
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            fontFamily="'Oswald', sans-serif"
            fontSize="7"
            fontWeight="500"
            letterSpacing="0.1em"
            fill="hsl(0 0% 62%)"
          >
            FAVORED
          </text>
        </svg>
        <div className="font-display text-[13px] font-bold tracking-wider uppercase text-predict-blue mt-1">
          {favored.toUpperCase()} Favored
        </div>
      </div>

      {/* Team 2 win % */}
      <div className="flex-1 flex flex-col items-end">
        <div className="font-display text-sm font-bold uppercase tracking-wider text-text-muted mb-1">
          {team2Abbrev}
        </div>
        <div className="font-display text-[48px] font-bold leading-none text-text-muted tracking-tight">
          {t2Pct}%
        </div>
        <div className="font-body text-xs text-text-secondary mt-1">Odds to win</div>
      </div>
    </div>
  );
};
