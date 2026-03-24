interface UpsetAlertProps {
  show: boolean;
  score: number;
  teamName: string;
}

export const UpsetAlert = ({ show, score, teamName }: UpsetAlertProps) => {
  if (!show) return null;

  return (
    <div className="flex items-center gap-3 bg-[hsl(0_50%_6%)] border border-[hsl(0_40%_20%)] rounded-lg p-3 px-4">
      <div>
        <span className="bg-upset-red text-[11px] font-display font-bold tracking-wider px-2 py-0.5 rounded text-white inline-block mb-1">
          ⚠ UPSET ALERT
        </span>
        <p className="font-body text-[13px] text-[hsl(0_70%_70%)]">{teamName} is a structural threat</p>
      </div>
      <div className="ml-auto text-right flex-shrink-0">
        <div className="font-display text-lg font-bold text-upset-red">+{score}%</div>
      </div>
    </div>
  );
};
