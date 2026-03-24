import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { Label } from "@ui/label";
import { cn } from "@/lib/utils";
import type { RegionFilterKey } from "@/lib/bracket-regions";

interface RegionFilterTabsProps {
  value: RegionFilterKey;
  onValueChange: (v: RegionFilterKey) => void;
  className?: string;
}

const ITEMS: { value: RegionFilterKey; label: string }[] = [
  { value: "all", label: "All regions" },
  { value: "east", label: "East" },
  { value: "south", label: "South" },
  { value: "west", label: "West" },
  { value: "midwest", label: "Midwest" },
];

export function RegionFilterTabs({ value, onValueChange, className }: RegionFilterTabsProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs font-medium text-muted-foreground">Filter by region</Label>
      <Tabs
        value={value}
        onValueChange={(v) => onValueChange(v as RegionFilterKey)}
        className="w-full"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/80 p-1.5">
          {ITEMS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="rounded-md px-3 py-2 text-xs font-medium data-[state=active]:shadow-sm sm:text-sm"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
