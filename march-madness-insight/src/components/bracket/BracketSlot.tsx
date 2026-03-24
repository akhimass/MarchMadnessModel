import clsx from "clsx";
import { logoUrlFromTeamName } from "@/lib/teamLogo";

export const SLOT_WIDTH = 200;
export const SLOT_HEIGHT = 52;

type Props = {
  seed?: number;
  name: string;
  teamId?: number;
  selected?: boolean;
  empty?: boolean;
  readOnly?: boolean;
  /** Override logo URL */
  logoUrl?: string;
  /** Survival % for live bracket */
  survivalPct?: number;
  /** Championship win probability (0–1), live bracket bar */
  champProb?: number;
  maxChampProb?: number;
  liveMode?: boolean;
  eliminated?: boolean;
  /** Model win % for this team in this matchup (0–100) */
  modelWinPct?: number;
  /** Brief highlight after pick */
  flash?: boolean;
  /** Known tournament winner for this matchup */
  resultWinnerId?: number | null;
  onSelect?: () => void;
};

export function BracketSlot({
  seed,
  name,
  teamId,
  selected,
  empty,
  readOnly,
  logoUrl,
  survivalPct,
  champProb,
  maxChampProb,
  liveMode,
  eliminated,
  modelWinPct,
  flash,
  resultWinnerId,
  onSelect,
}: Props) {
  const img = logoUrl ?? (name && name !== "TBD" ? logoUrlFromTeamName(name) : undefined);

  const resultWin =
    teamId != null && resultWinnerId != null && resultWinnerId > 0 ? resultWinnerId === teamId : undefined;
  const resultLose =
    teamId != null && resultWinnerId != null && resultWinnerId > 0 ? resultWinnerId !== teamId : undefined;

  const content = (
    <div
      className={clsx(
        "flex h-[52px] w-[200px] shrink-0 items-center gap-2 rounded border px-2 transition-colors",
        empty && "border-dashed border-muted-foreground/40 bg-muted/20",
        !empty && "border-[#2a3860] bg-card",
        eliminated && "bg-muted/30",
        selected && "border-l-4 border-l-[hsl(var(--predict-blue))] bg-primary/10",
        flash && "ring-2 ring-[hsl(var(--predict-blue))]/60",
        eliminated && "opacity-50",
        resultWin && "border-emerald-500/80 bg-emerald-500/10",
        resultLose && "opacity-60 line-through",
      )}
    >
      {!readOnly && !empty ? (
        <span
          className={clsx(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-[hsl(var(--predict-blue))] bg-[hsl(var(--predict-blue))]" : "border-muted-foreground/50",
          )}
          aria-hidden
        >
          {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
        </span>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      {!empty && img ? (
        <img
          src={img}
          alt=""
          className={clsx("h-8 w-8 shrink-0 rounded-full object-contain", eliminated && "opacity-50")}
          loading="lazy"
        />
      ) : !empty ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
          {name.charAt(0)}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {!empty ? (
          <>
            <div className="font-display text-[10px] font-bold tabular-nums text-muted-foreground">
              {seed != null && seed > 0 ? Math.round(seed) : ""}
            </div>
            <div
              className={clsx(
                "truncate font-display text-sm font-semibold uppercase leading-tight tracking-tight text-foreground",
                eliminated && "line-through text-gray-500",
              )}
            >
              {name}
            </div>
            {modelWinPct != null && modelWinPct > 0 ? (
              <div className="text-[10px] font-medium tabular-nums text-muted-foreground">{modelWinPct.toFixed(0)}%</div>
            ) : null}
            {survivalPct != null ? (
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-[hsl(var(--predict-blue))]"
                  style={{ width: `${Math.min(100, Math.max(0, survivalPct))}%` }}
                />
              </div>
            ) : null}
            {liveMode && champProb != null && champProb >= 0 ? (
              <>
                <div className="mt-1 h-1 w-full overflow-hidden rounded bg-gray-800">
                  <div
                    className="h-full rounded bg-blue-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        maxChampProb && maxChampProb > 0 ? (champProb / maxChampProb) * 100 : champProb * 100,
                      )}%`,
                    }}
                  />
                </div>
                <div className="text-[10px] font-medium tabular-nums text-muted-foreground">
                  {(champProb * 100).toFixed(1)}%
                </div>
              </>
            ) : null}
          </>
        ) : (
          <span className="font-display text-xs uppercase text-muted-foreground">TBD</span>
        )}
      </div>
    </div>
  );

  if (readOnly || empty || !onSelect) {
    return <div className="shrink-0">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="shrink-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {content}
    </button>
  );
}
