import { useMemo } from "react";

import { getSystem, PREDICTOR_ORDINAL_CODES } from "@/lib/masseySystemsMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";

type OrdinalPair = { team1: number; team2: number };

function disagreementLabel(rows: { r1: number; r2: number }[]): "LOW" | "MEDIUM" | "HIGH" {
  if (rows.length === 0) return "LOW";
  const n1 = rows.filter((x) => x.r1 < x.r2).length;
  const n2 = rows.filter((x) => x.r2 < x.r1).length;
  const split = Math.min(n1, n2);
  if (split === 0) return "LOW";
  if (split <= Math.ceil(rows.length * 0.15)) return "MEDIUM";
  return "HIGH";
}

export function SystemOrdinalRankings({
  team1Abbrev,
  team2Abbrev,
  ordinalRanks,
}: {
  team1Abbrev: string;
  team2Abbrev: string;
  ordinalRanks: Record<string, OrdinalPair> | undefined;
}) {
  const rows = useMemo(() => {
    const list: {
      code: string;
      label: string;
      r1: number;
      r2: number;
      favors: 1 | 2;
    }[] = [];
    for (const code of PREDICTOR_ORDINAL_CODES) {
      const pair = ordinalRanks?.[code];
      if (!pair) continue;
      const meta = getSystem(code);
      const label = meta?.fullName ?? code;
      const favors: 1 | 2 = pair.team1 < pair.team2 ? 1 : 2;
      list.push({ code, label, r1: pair.team1, r2: pair.team2, favors });
    }
    return list;
  }, [ordinalRanks]);

  const consensus = useMemo(() => {
    if (rows.length === 0) return null;
    const a1 = rows.reduce((s, x) => s + x.r1, 0) / rows.length;
    const a2 = rows.reduce((s, x) => s + x.r2, 0) / rows.length;
    const favors: 1 | 2 = a1 < a2 ? 1 : 2;
    return { a1, a2, favors };
  }, [rows]);

  const disagreement = useMemo(
    () => disagreementLabel(rows.map((x) => ({ r1: x.r1, r2: x.r2 }))),
    [rows],
  );

  if (!ordinalRanks || rows.length === 0) {
    return (
      <Card className="rounded-xl border bg-card shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-base tracking-tight">SYSTEM RANKINGS</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Ordinal ranks load when the API has MMasseyOrdinals data (skipped on some deploys). Try again after the full
            model pipeline finishes.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-base tracking-tight">SYSTEM RANKINGS</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          National ranks per system (lower = better). Compares consensus across Tier 1 ordinals.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <th className="px-2 py-2 font-semibold">System</th>
                <th className="px-2 py-2 font-semibold">{team1Abbrev}</th>
                <th className="px-2 py-2 font-semibold">{team2Abbrev}</th>
                <th className="px-2 py-2 font-semibold">Favors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const strength = Math.abs(row.r1 - row.r2);
                const maxSpread = 150;
                const barPct = Math.min(100, Math.round((strength / maxSpread) * 100));
                const favName = row.favors === 1 ? team1Abbrev : team2Abbrev;
                return (
                  <tr key={row.code} className="border-b border-border/60">
                    <td className="px-2 py-1.5 font-medium text-foreground">{row.label}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">#{row.r1}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">#{row.r2}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-foreground">{favName}</span>
                        <div className="h-1.5 min-w-[48px] flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {consensus ? (
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-2 py-2">Consensus</td>
                  <td className="px-2 py-2 font-mono">#{consensus.a1.toFixed(1)}</td>
                  <td className="px-2 py-2 font-mono">#{consensus.a2.toFixed(1)}</td>
                  <td className="px-2 py-2 text-xs">
                    {consensus.favors === 1 ? team1Abbrev : team2Abbrev} favored
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Disagreement score: {disagreement}</span>
          {" — "}
          {disagreement === "LOW"
            ? "all systems agree on the direction of the edge."
            : disagreement === "MEDIUM"
              ? "some systems disagree — worth a closer look."
              : "high split across systems — upset risk signal."}
        </div>
      </CardContent>
    </Card>
  );
}
