import type { BetSlipItem } from "@/types/betting";
import type { NarrativeApiResponse } from "@/lib/api";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";

function formatAmericanOdds(odds: number): string {
  const rounded = Math.round(odds * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

function stakeSizeLabel(
  band: BetSlipItem["stakeBand"],
  stake: number,
  bankroll?: number,
): string {
  const pct = bankroll && bankroll > 0 ? (stake / bankroll) * 100 : null;
  const pctBit = pct != null ? `${pct.toFixed(1)}% of bankroll` : "bankroll % n/a";
  // Band is position-sizing only (not upset or model risk): ≥6% = large, 3–6% = medium, <3% = small.
  const bandWord =
    band === "high" ? "Large stake" : band === "medium" ? "Medium stake" : band === "low" ? "Small stake" : "Stake size n/a";
  return `${bandWord} · ${pctBit}`;
}

export function BetSlip({
  items,
  bankroll,
  onRemove,
  onStakeChange,
  onAnalyze,
  analyzing,
  narratives,
  analysisError,
}: {
  items: BetSlipItem[];
  /** Used to show "% of bankroll" next to stake-size bands (bands are sizing, not model risk). */
  bankroll?: number;
  onRemove: (id: string) => void;
  onStakeChange: (id: string, stake: number) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  narratives?: NarrativeApiResponse[];
  analysisError?: string | null;
}) {
  const totalWager = items.reduce((s, i) => s + i.stake, 0);
  const totalEv = items.reduce((s, i) => s + i.ev, 0);

  return (
    <Card className="border-[#2a3860] bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-sm font-bold uppercase text-white">My bet slip</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add picks from the board.</p>
        ) : (
          <ul className="space-y-4">
            {items.map((it, idx) => {
              const n = narratives?.[idx];
              return (
                <li key={it.id} className="border-b border-border pb-4 last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-foreground">
                      {it.teamName} ({formatAmericanOdds(it.americanOdds)})
                    </span>
                    <input
                      type="number"
                      value={it.stake}
                      min={0}
                      step={1}
                      onChange={(e) => onStakeChange(it.id, Math.max(0, Number(e.target.value) || 0))}
                      className="h-7 w-20 rounded border border-border bg-background px-2 text-right text-xs text-muted-foreground"
                    />
                    <span className="text-xs text-emerald-400">EV ${it.ev.toFixed(2)}</span>
                    <span
                      title="How big this bet is vs your bankroll (not model upset risk). ≥6% = large, 3–6% = medium, under 3% = small."
                      className={`max-w-[140px] text-[10px] leading-tight ${
                        it.stakeBand === "high"
                          ? "text-amber-400"
                          : it.stakeBand === "medium"
                            ? "text-sky-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {it.stakeBand ? stakeSizeLabel(it.stakeBand, it.stake, bankroll) : "Stake size n/a"}
                    </span>
                    <Button variant="ghost" size="sm" type="button" className="h-7 px-2 text-xs" onClick={() => onRemove(it.id)}>
                      ✕
                    </Button>
                  </div>
                  {!analyzing && n ? (
                    <div className="mt-3 space-y-2">
                      {n.betting_narrative ? (
                        <p className="text-xs text-emerald-200/90">
                          <span className="font-semibold text-emerald-400">Betting: </span>
                          {n.betting_narrative}
                        </p>
                      ) : null}
                      {n.team1_narrative ? (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-semibold text-foreground">Team analysis</summary>
                          <p className="mt-1 whitespace-pre-wrap">{n.team1_narrative}</p>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {items.length > 0 && analyzing ? (
          <div className="space-y-2 py-2">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-[75%] animate-pulse rounded bg-muted" />
          </div>
        ) : null}
        {!analyzing && (narratives?.length ?? 0) > 0 ? (
          <div className="space-y-3 rounded-md border border-border bg-card/40 p-3">
            <p className="font-display text-xs font-bold uppercase text-foreground">Claude analysis</p>
            {items.map((it, idx) => {
              const n = narratives?.[idx];
              const narrative =
                n?.betting_narrative?.trim() ||
                n?.team1_narrative?.trim() ||
                n?.matchup_narrative?.trim() ||
                "Model analysis unavailable.";
              return (
                <details key={`analysis-${it.id}`} className="rounded border border-border/70 p-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-semibold text-foreground">
                    {it.teamName} ML ({formatAmericanOdds(it.americanOdds)}) · ${Math.round(it.stake)} suggested
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap leading-relaxed">{narrative}</p>
                </details>
              );
            })}
          </div>
        ) : null}
        {analysisError ? <p className="text-xs text-amber-500">{analysisError}</p> : null}
        {items.length > 0 ? (
          <div className="space-y-1 border-t border-border pt-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total wagered</span>
              <span>${totalWager.toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Combined EV (est.)</span>
              <span className="text-emerald-400">${totalEv.toFixed(2)}</span>
            </div>
          </div>
        ) : null}
        <Button
          type="button"
          className="w-full font-display uppercase"
          disabled={items.length === 0 || analyzing}
          onClick={onAnalyze}
        >
          {analyzing ? "Loading…" : "Get Claude analysis"}
        </Button>
      </CardContent>
    </Card>
  );
}
