import clsx from "clsx";
import { ScrollArea, ScrollBar } from "@ui/scroll-area";

const regions = [
  { label: "Round of 64", sub: "East", region: "east" },
  { label: "Round of 64", sub: "South", region: "south" },
  { label: "Round of 64", sub: "West", region: "west" },
  { label: "Round of 64", sub: "Midwest", region: "midwest" },
];

interface RoundTabsProps {
  activeRegion: string;
  onRegionChange: (region: string) => void;
  picksRemaining?: number;
}

export const RoundTabs = ({ activeRegion, onRegionChange, picksRemaining = 63 }: RoundTabsProps) => (
  <div className="bg-bg-elevated border-b border-border">
    <ScrollArea className="w-full">
      <div className="flex items-stretch min-w-max">
        {regions.map((tab) => (
          <button
            key={tab.region}
            onClick={() => onRegionChange(tab.region)}
            className={clsx(
              "px-5 py-3 text-center flex flex-col items-center gap-0.5 border-b-2 flex-shrink-0 transition-colors",
              activeRegion === tab.region
                ? "border-predict-blue text-white"
                : "border-transparent text-text-muted hover:text-text-secondary"
            )}
          >
            <span className="font-display text-[10px] font-medium tracking-wider uppercase">{tab.label}</span>
            <span className="font-display text-[13px] font-bold tracking-wide uppercase">{tab.sub}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center px-4 flex-shrink-0">
          <div className="bg-bg-surface border border-border rounded px-3 py-1.5 text-center">
            <span className="font-display text-lg font-bold text-white leading-none">{picksRemaining}</span>
            <div className="font-display text-[8px] font-medium tracking-wider uppercase text-text-muted">
              Picks Remaining
            </div>
          </div>
        </div>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  </div>
);
