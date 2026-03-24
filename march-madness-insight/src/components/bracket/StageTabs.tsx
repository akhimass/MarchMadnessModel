import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { Badge } from "@ui/badge";
import { cn } from "@/lib/utils";
import type { StageKey } from "@/lib/bracket-stages";

export type { StageKey };

const STAGES: { key: StageKey; label: string; short: string }[] = [
  { key: "R1", label: "Round of 64", short: "R64" },
  { key: "R2", label: "Round of 32", short: "R32" },
  { key: "R3", label: "Sweet 16", short: "S16" },
  { key: "R4", label: "Elite 8", short: "E8" },
  { key: "R5", label: "Final 4", short: "F4" },
  { key: "R6", label: "Championship", short: "CH" },
];

const REGION_TABS = [
  { key: "east", label: "Round of 64 (East)" },
  { key: "south", label: "Round of 64 (South)" },
  { key: "west", label: "Round of 64 (West)" },
  { key: "midwest", label: "Round of 64 (Midwest)" },
] as const;

interface StageTabsProps {
  activeStage: string;
  onStageChange: (stage: StageKey) => void;
  activeRegion?: string;
  onRegionChange?: (region: "east" | "south" | "west" | "midwest") => void;
  stageEnabled?: Record<StageKey, boolean>;
  stagePickCounts?: Record<StageKey, number>;
  stagePickTargets?: Record<StageKey, number>;
  picksRemaining?: number;
}

export const StageTabs = ({
  activeStage,
  onStageChange,
  activeRegion = "east",
  onRegionChange,
  stageEnabled,
  stagePickCounts,
  stagePickTargets,
  picksRemaining = 63,
}: StageTabsProps) => {
  const value = (String(activeStage || "R1").toUpperCase() as StageKey) || "R1";
  const canPickRegion = value === "R1" || value === "R2";

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto max-w-5xl px-4 py-3">
        <div className="mb-2 flex items-center gap-3">
          <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Round Navigation
          </span>
          <Badge variant="secondary" className="h-8 min-w-[5rem] justify-center px-3 font-display text-sm tabular-nums">
            {picksRemaining} left
          </Badge>
        </div>

        <div className="overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex min-w-max items-stretch gap-1 rounded-xl border border-border bg-muted/60 p-1.5 shadow-sm">
            {REGION_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                disabled={!canPickRegion || !onRegionChange}
                onClick={() => onRegionChange?.(tab.key)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-xs font-semibold transition-colors",
                  activeRegion === tab.key && canPickRegion
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground",
                  canPickRegion ? "hover:bg-background hover:text-foreground" : "cursor-not-allowed opacity-45",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <Tabs value={value} onValueChange={(v) => onStageChange(v as StageKey)} className="mt-2 w-full">
          <div className="overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="inline-flex h-auto min-h-11 w-max flex-nowrap gap-1 rounded-xl border border-border bg-muted/60 p-1.5 shadow-sm">
              {STAGES.map((s) => {
                const enabled = stageEnabled?.[s.key] ?? true;
                const count = stagePickCounts?.[s.key];
                const target = stagePickTargets?.[s.key];
                return (
                  <TabsTrigger
                    key={s.key}
                    value={s.key}
                    disabled={!enabled}
                    className={cn(
                      "group shrink-0 rounded-lg px-3 py-2 text-left data-[state=active]:shadow-md sm:px-4",
                      "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                      !enabled && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <span className="block font-display text-xs font-bold uppercase tracking-wide sm:text-sm">
                      {s.label}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] font-medium uppercase text-muted-foreground group-data-[state=active]:text-primary-foreground/80 sm:text-xs">
                      {typeof count === "number" && typeof target === "number" ? `${count}/${target}` : s.short}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </Tabs>
      </div>
    </div>
  );
};
