import type { CompressedRegionData, Game } from "@/lib/compressedBracketTypes";
import { CompressedMatchup } from "./CompressedMatchup";
import styles from "./compressed-bracket.module.css";
import {
  ConnectorRailsLeft,
  ConnectorRailsFinalLeft,
  ConnectorRailsRight,
  ConnectorRailsFinalRight,
} from "./ConnectorRails";

function R32S16Group({
  r32Top,
  s16,
  r32Bot,
  selectedGameId,
  onSelectGame,
  side,
}: {
  r32Top: Game;
  s16: Game;
  r32Bot: Game;
  selectedGameId: string | null;
  onSelectGame?: (game: Game) => void;
  side: "left" | "right";
}) {
  return (
    <div className={styles.r32S16Group}>
      <div className={`${styles.r32S16Card} ${styles.r32S16Top}`}>
        <CompressedMatchup
          game={r32Top}
          variant="inner"
          selected={selectedGameId === r32Top.id}
          onSelect={onSelectGame}
        />
      </div>
      <div
        className={`${styles.r32S16Card} ${styles.r32S16Mid} ${
          side === "left" ? styles.s16IndentLeft : styles.s16IndentRight
        }`}
      >
        <CompressedMatchup
          game={s16}
          variant="inner"
          selected={selectedGameId === s16.id}
          onSelect={onSelectGame}
        />
      </div>
      <div className={`${styles.r32S16Card} ${styles.r32S16Bot}`}>
        <CompressedMatchup
          game={r32Bot}
          variant="inner"
          selected={selectedGameId === r32Bot.id}
          onSelect={onSelectGame}
        />
      </div>
    </div>
  );
}

export function CompressedRegion({
  data,
  side,
  selectedGameId = null,
  onSelectGame,
}: {
  data: CompressedRegionData;
  side: "left" | "right";
  selectedGameId?: string | null;
  onSelectGame?: (game: Game) => void;
}) {
  const r32S16Content = (
    <div className={styles.r32S16Wrapper}>
      <R32S16Group
        r32Top={data.r32[0]}
        s16={data.s16[0]}
        r32Bot={data.r32[1]}
        selectedGameId={selectedGameId}
        onSelectGame={onSelectGame}
        side={side}
      />
      <R32S16Group
        r32Top={data.r32[2]}
        s16={data.s16[1]}
        r32Bot={data.r32[3]}
        selectedGameId={selectedGameId}
        onSelectGame={onSelectGame}
        side={side}
      />
    </div>
  );

  if (side === "left") {
    return (
      <div className={styles.regionBlock}>
        <div className={`${styles.regionLabel} ${styles.regionLabelLeft}`}>{data.label}</div>
        <div className={styles.regionGrid}>
          {data.r64.map((g, i) => (
            <div key={g.id} className={styles.r64Left} style={{ gridRow: i + 1 }}>
              <CompressedMatchup
                game={g}
                variant="outer"
                selected={selectedGameId === g.id}
                onSelect={onSelectGame}
              />
            </div>
          ))}
          <div className={styles.connectorL1}>
            <ConnectorRailsLeft />
          </div>
          <div className={styles.r32S16ColLeft}>{r32S16Content}</div>
          <div className={styles.connectorL3}>
            <ConnectorRailsFinalLeft />
          </div>
          <div className={styles.e8Left}>
            <CompressedMatchup
              game={data.e8}
              variant="inner"
              selected={selectedGameId === data.e8.id}
              onSelect={onSelectGame}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.regionBlock}>
      <div className={`${styles.regionLabel} ${styles.regionLabelRight}`}>{data.label}</div>
      <div className={styles.regionGrid}>
        <div className={styles.e8Right}>
          <CompressedMatchup
            game={data.e8}
            variant="inner"
            selected={selectedGameId === data.e8.id}
            onSelect={onSelectGame}
          />
        </div>
        <div className={styles.connectorR3}>
          <ConnectorRailsFinalRight />
        </div>
        <div className={styles.r32S16ColRight}>{r32S16Content}</div>
        <div className={styles.connectorR1}>
          <ConnectorRailsRight />
        </div>
        {data.r64.map((g, i) => (
          <div key={g.id} className={styles.r64Right} style={{ gridRow: i + 1 }}>
            <CompressedMatchup game={g} variant="outer" selected={selectedGameId === g.id} onSelect={onSelectGame} />
          </div>
        ))}
      </div>
    </div>
  );
}
