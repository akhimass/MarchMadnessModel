/**
 * ESPN-style bracket connectors: two feed lines merge to one output per pair.
 * `matchupCount` = games in the left column; pairs are (0,1), (2,3), …
 */
const SLOT_H = 52;
const SLOT_GAP = 4;
const PAIR_H = SLOT_H * 2 + SLOT_GAP; // 108
const INTER_PAIR_GAP = 8;

function pairHeightForRound(round: number): number {
  const scale = Math.pow(2, round);
  return PAIR_H * scale + INTER_PAIR_GAP * (scale - 1);
}

function getPairMidY(pairIndex: number, round: number): number {
  const h = pairHeightForRound(round);
  return pairIndex * (h + INTER_PAIR_GAP) + h / 2;
}

export function ConnectorLines({
  matchupCount,
  round = 0,
}: {
  matchupCount: number;
  /** 0=R64→R32, 1=R32→S16, 2=S16→E8 */
  round?: number;
}) {
  if (matchupCount < 2) {
    return <div className="w-10 shrink-0" aria-hidden />;
  }

  const centers = Array.from({ length: matchupCount }, (_, i) => getPairMidY(i, round));
  const pairs: [number, number][] = [];
  for (let i = 0; i < matchupCount; i += 2) {
    pairs.push([i, i + 1]);
  }

  const h = centers.length ? centers[centers.length - 1] + pairHeightForRound(round) / 2 : 0;
  const midX = 18;
  const outX = 36;

  return (
    <svg
      width={outX}
      height={h}
      className="shrink-0 text-[#2a3860]"
      aria-hidden
    >
      {pairs.map(([a, b], idx) => {
        const y1 = centers[a];
        const y2 = centers[b];
        const ym = (y1 + y2) / 2;
        return (
          <g key={idx}>
            <line x1={0} y1={y1} x2={midX} y2={y1} stroke="currentColor" strokeWidth={1.25} />
            <line x1={0} y1={y2} x2={midX} y2={y2} stroke="currentColor" strokeWidth={1.25} />
            <line x1={midX} y1={y1} x2={midX} y2={y2} stroke="currentColor" strokeWidth={1.25} />
            <line x1={midX} y1={ym} x2={outX} y2={ym} stroke="currentColor" strokeWidth={1.25} />
          </g>
        );
      })}
    </svg>
  );
}
