import { useMemo, useState } from "react";

import {
  MASSEY_SYSTEMS,
  type MasseySystem,
  type SystemCategory,
  type SystemTier,
} from "@/lib/masseySystemsMeta";
import { Badge } from "@ui/badge";
import { Card, CardContent } from "@ui/card";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import { cn } from "@/lib/utils";

const CATEGORY_BADGE: Record<SystemCategory, string> = {
  official: "border-blue-500/50 bg-blue-600/25 text-blue-100",
  efficiency: "border-emerald-500/50 bg-emerald-600/25 text-emerald-100",
  margin: "border-orange-500/50 bg-orange-600/25 text-orange-100",
  human_poll: "border-violet-500/50 bg-violet-600/25 text-violet-100",
  composite: "border-teal-500/50 bg-teal-600/25 text-teal-100",
  independent: "border-slate-500/50 bg-slate-600/25 text-slate-200",
};

const TIER_BADGE: Record<SystemTier, string> = {
  1: "border-amber-500/60 bg-amber-500/25 text-amber-100",
  2: "border-slate-400/60 bg-slate-500/20 text-slate-100",
  3: "border-zinc-600 bg-zinc-800/80 text-zinc-300",
};

type FilterKey = "all" | "1" | "2" | "3" | "model";

function SystemCard({ s }: { s: MasseySystem }) {
  return (
    <Card className="border-border bg-card/90">
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-sm font-bold text-primary">{s.code}</span>
          <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", TIER_BADGE[s.tier])}>
            Tier {s.tier}
          </Badge>
        </div>
        <div className="font-display text-sm font-bold leading-tight text-foreground">{s.fullName}</div>
        <Badge variant="outline" className={cn("w-fit text-[10px] capitalize", CATEGORY_BADGE[s.category])}>
          {s.category.replace(/_/g, " ")}
        </Badge>
        <div className="my-1 border-t border-border" />
        <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{s.description}</p>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px]">
          {s.usedInModel && s.weight != null ? (
            <span className="text-muted-foreground">
              Weight in model: <span className="font-semibold text-foreground">{(s.weight * 100).toFixed(0)}%</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Reference only</span>
          )}
          {s.usedInModel ? (
            <Badge className="bg-emerald-700/40 text-[10px] text-emerald-100">✓ Used</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              —
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RatingSystemsTab() {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    return MASSEY_SYSTEMS.filter((s) => {
      if (filter === "all") return true;
      if (filter === "model") return s.usedInModel;
      return String(s.tier) === filter;
    });
  }, [filter]);

  const tier1InModel = useMemo(() => MASSEY_SYSTEMS.filter((s) => s.tier === 1 && s.usedInModel).length, []);
  const tier3Count = useMemo(() => MASSEY_SYSTEMS.filter((s) => s.tier === 3).length, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold uppercase tracking-wide text-white">Massey ordinals — 150+ expert systems</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Our model aggregates rankings from all sources below. Tier 1 systems carry most weight. Tier 3 are averaged into a
          single consensus signal to avoid noise.
        </p>
      </div>

      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(v) => v && setFilter(v as FilterKey)}
        className="flex flex-wrap justify-start gap-1"
      >
        {(
          [
            ["all", "All"],
            ["1", "Tier 1"],
            ["2", "Tier 2"],
            ["3", "Tier 3"],
            ["model", "In model"],
          ] as const
        ).map(([k, label]) => (
          <ToggleGroupItem key={k} value={k} className="font-display text-[10px] font-bold uppercase">
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => (
          <SystemCard key={s.code} s={s} />
        ))}
      </div>

      <Card className="border-border bg-card/60">
        <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
          <p>
            Our model uses <span className="font-semibold text-foreground">{tier1InModel}</span> Tier 1 systems as primary
            features. <span className="font-semibold text-foreground">{tier3Count}</span> Tier 3 systems are averaged into a
            single &quot;minor consensus&quot; feature that has ~3% weight in the ensemble.
          </p>
          <p>
            The key insight: <span className="font-semibold text-foreground">POM (KenPom)</span> +{" "}
            <span className="font-semibold text-foreground">NET</span> (official NCAA) together explain a large share of the
            GBM&apos;s margin / efficiency signal — on the order of <span className="font-semibold text-foreground">~45%</span> of
            tree splits that lean on ordinal differentials.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
