import type { BetSlipItem, KellyStrategy } from "@/types/betting";
import { kellyBetWithModifier } from "@/lib/oddsApi";
import { parseEspnDateToYyyymmdd } from "@/lib/tournamentRounds";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Label } from "@ui/label";

const ROUNDS = ["R64", "R32", "S16", "E8", "F4", "CHAMP"] as const;

function formatAmericanOdds(odds: number): string {
  const rounded = Math.round(odds * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

function mapOpportunityRound(r: string | undefined): (typeof ROUNDS)[number] | null {
  if (!r) return null;
  if (r === "R64") return "R64";
  if (r === "R32") return "R32";
  if (r === "S16") return "S16";
  if (r === "E8") return "E8";
  if (r === "F4") return "F4";
  if (r === "CHAMP") return "CHAMP";
  return null;
}

function getRoundAllocation(
  opportunities: BetSlipItem[],
  bankroll: number,
  modifier: number,
): Record<string, { recommended: number; count: number; picks: BetSlipItem[] }> {
  return Object.fromEntries(
    ROUNDS.map((round) => {
      const picks = opportunities.filter((o) => mapOpportunityRound(o.round) === round && o.edge > 0);
      const recommended = picks.reduce(
        (sum, p) => sum + kellyBetWithModifier(p.ourProb, p.americanOdds, bankroll, modifier),
        0,
      );
      return [round, { recommended: Math.round(recommended), count: picks.length, picks }];
    }),
  );
}

export function RoundPlanner({
  bankroll,
  strategy,
  onStrategyChange,
  opportunities,
  selectedRound,
}: {
  bankroll: number;
  strategy: KellyStrategy;
  onStrategyChange: (s: KellyStrategy) => void;
  opportunities: BetSlipItem[];
  selectedRound?: string;
}) {
  const mult =
    strategy === "conservative" ? 0.25 : strategy === "moderate" ? 0.5 : strategy === "aggressive" ? 1 : 0.25;

  const alloc = getRoundAllocation(opportunities, bankroll, strategy === "flat" ? 0.25 : mult);

  const s16Picks = opportunities.filter((o) => o.round === "S16" && o.edge > 0);
  const thu = s16Picks.filter((p) => parseEspnDateToYyyymmdd(p.game.commence_time) === "20260326");
  const fri = s16Picks.filter((p) => parseEspnDateToYyyymmdd(p.game.commence_time) === "20260327");
  const expectedProfit = s16Picks.reduce((s, p) => s + p.ev, 0);
  const s16Alloc = alloc.S16?.recommended ?? 0;

  return (
    <Card className="border-[#2a3860] bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-sm font-bold uppercase text-white">Round planner</CardTitle>
        <p className="text-xs text-muted-foreground">Kelly-style suggested allocation by round (+EV only)</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">Strategy</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            value={strategy}
            onChange={(e) => onStrategyChange(e.target.value as KellyStrategy)}
          >
            <option value="conservative">Conservative (¼ Kelly)</option>
            <option value="moderate">Moderate (½ Kelly)</option>
            <option value="aggressive">Aggressive (full Kelly)</option>
            <option value="flat">Flat (¼ Kelly baseline)</option>
          </select>
        </div>
        <ul className="space-y-2 text-sm">
          {ROUNDS.map((k) => {
            const row = alloc[k];
            const hasGames = row.count > 0;
            return (
              <li key={k} className="flex justify-between border-b border-border/60 py-1">
                <span className="text-muted-foreground">{k}</span>
                <span>
                  {hasGames ? (
                    <>
                      ${row.recommended} · {row.count} pick{row.count === 1 ? "" : "s"}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">No games available yet</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {selectedRound === "S16" ? (
          <div className="space-y-2 rounded-md border border-border p-3 text-xs">
            <div className="font-display font-bold uppercase text-white">Sweet 16 betting plan</div>
            <div className="text-muted-foreground">Bankroll: ${bankroll.toFixed(0)}</div>
            <div className="pt-1">
              <div className="font-semibold text-foreground">Thu Mar 26 ({thu.length} games)</div>
              {thu.slice(0, 4).map((p) => (
                <div key={`thu-${p.id}`} className="flex justify-between text-muted-foreground">
                  <span>{p.teamName} ML ({formatAmericanOdds(p.americanOdds)})</span>
                  <span>Kelly: ${kellyBetWithModifier(p.ourProb, p.americanOdds, bankroll, mult).toFixed(0)} · EV: +${Math.max(0, p.ev).toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div className="pt-1">
              <div className="font-semibold text-foreground">Fri Mar 27 ({fri.length} games)</div>
              {fri.slice(0, 4).map((p) => (
                <div key={`fri-${p.id}`} className="flex justify-between text-muted-foreground">
                  <span>{p.teamName} ML ({formatAmericanOdds(p.americanOdds)})</span>
                  <span>Kelly: ${kellyBetWithModifier(p.ourProb, p.americanOdds, bankroll, mult).toFixed(0)} · EV: +${Math.max(0, p.ev).toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-2 text-muted-foreground">
              Total Sweet 16 allocation: ${s16Alloc} / ${bankroll.toFixed(0)} ({((s16Alloc / Math.max(1, bankroll)) * 100).toFixed(0)}%)
              <br />
              Expected profit: +${expectedProfit.toFixed(0)} ({((expectedProfit / Math.max(1, bankroll)) * 100).toFixed(1)}% ROI)
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
