import { useMemo, useState } from "react";
import type { BetSlipItem } from "@/types/betting";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Label } from "@ui/label";

export function TopValuePicks({ items, selectedRound }: { items: BetSlipItem[]; selectedRound?: string }) {
  const [showAll, setShowAll] = useState(false);
  const byRound = useMemo(
    () => (selectedRound ? items.filter((x) => (x.round ?? "R64") === selectedRound) : items),
    [items, selectedRound],
  );
  const sorted = [...byRound].sort((a, b) => b.edge - a.edge);
  const filtered = showAll ? sorted : sorted.filter((x) => x.edge > 0);
  const top = filtered.slice(0, 10);

  return (
    <Card className="border-[#2a3860] bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-sm font-bold uppercase tracking-wide text-white">Top value picks</CardTitle>
        <p className="text-xs text-muted-foreground">Model edge vs implied probability (top 10)</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="show-all-ev"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="show-all-ev" className="text-xs font-normal text-muted-foreground">
            Show all edges (incl. negative)
          </Label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">No edges found with current odds.</p>
        ) : (
          <ol className="list-decimal space-y-4 pl-4">
            {top.map((it, i) => (
              <li key={`${it.id}-${i}`} className="text-sm">
                <div className="font-display font-bold text-white">
                  {it.teamName} ML ({it.americanOdds > 0 ? "+" : ""}
                  {it.americanOdds})
                </div>
                <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
                  <span>
                    Our prob: {(it.ourProb * 100).toFixed(1)}% | Market implied: {(it.impliedProb * 100).toFixed(1)}%
                  </span>
                  <span className={it.edge > 0 ? "font-semibold text-emerald-400" : "text-rose-400"}>
                    Edge: {it.edge > 0 ? "+" : ""}
                    {(it.edge * 100).toFixed(1)}%
                  </span>
                  <span>
                    On $100: EV ≈ ${it.ev.toFixed(2)} · Kelly (¼): ${Math.max(0, it.ev).toFixed(0)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
