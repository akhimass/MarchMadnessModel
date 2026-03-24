import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchMatchupStandardProb } from "@/lib/api";
import { womenTeamIdFromEspnTeam, type ApiTeamRow } from "@/lib/marchMadnessFilter";
import { resolveMenKaggleId } from "@/lib/espnTeamToKaggle";
import type { LiveGame } from "@/lib/espnApi";

import { LiveGameCard } from "./LiveGameCard";
import { LiveInGamePredictor } from "./LiveInGamePredictor";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@ui/accordion";

export type LiveGameCardWithModelProps = {
  game: LiveGame;
  gender: "M" | "W";
  /** Open the live predictor accordion by default (e.g. Model / Live AI tab) */
  defaultOpenLivePredictor?: boolean;
};

function useWomenFieldTeams(enabled: boolean) {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  return useQuery({
    queryKey: ["tournament-field-teams", 2026, "W"],
    queryFn: async (): Promise<ApiTeamRow[]> => {
      const res = await fetch(`${apiBase}/api/teams/2026?gender=W`);
      if (!res.ok) throw new Error(`teams W failed (${res.status})`);
      return res.json();
    },
    enabled,
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * March Madness score row + ensemble win probability whenever both teams resolve to model IDs
 * (men: Kaggle IDs; women: API team IDs).
 */
export function LiveGameCardWithModel({
  game,
  gender,
  defaultOpenLivePredictor = false,
}: LiveGameCardWithModelProps) {
  const { data: wTeams } = useWomenFieldTeams(gender === "W");

  const ka = useMemo(() => {
    if (gender === "M") return resolveMenKaggleId(game.away);
    return womenTeamIdFromEspnTeam(wTeams, game.away.name);
  }, [gender, wTeams, game.away]);

  const kh = useMemo(() => {
    if (gender === "M") return resolveMenKaggleId(game.home);
    return womenTeamIdFromEspnTeam(wTeams, game.home.name);
  }, [gender, wTeams, game.home]);

  const womenPending = gender === "W" && wTeams === undefined;
  const modelEnabled = !womenPending && ka != null && kh != null;

  const { data: pLo } = useQuery({
    queryKey: ["live-ensemble-prob", game.espnId, ka, kh, gender],
    queryFn: () => fetchMatchupStandardProb(ka!, kh!, gender),
    enabled: modelEnabled,
    staleTime: 20_000,
  });

  const awayWin = useMemo(() => {
    if (pLo == null || ka == null || kh == null) return null;
    const lo = Math.min(ka, kh);
    return ka === lo ? pLo : 1 - pLo;
  }, [pLo, ka, kh]);

  const showLivePanel = modelEnabled && game.state === "in";

  const card = (
    <LiveGameCard
      game={game}
      awayModelWinProb={awayWin}
      attachLivePanel={showLivePanel}
      gender={gender}
    />
  );

  if (!showLivePanel) {
    return card;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border shadow-sm">
      {card}
      <Accordion
        type="single"
        collapsible
        defaultValue={defaultOpenLivePredictor ? "live-pred" : undefined}
        className="border-t border-border bg-muted/20 px-2"
      >
        <AccordionItem value="live-pred" className="border-0">
          <AccordionTrigger className="py-2.5 text-left text-xs font-semibold hover:no-underline">
            Live predictor — decision tree &amp; submodels (updates with score &amp; clock)
          </AccordionTrigger>
          <AccordionContent className="pb-3 pt-0">
            <LiveInGamePredictor
              game={game}
              awayKaggleId={ka!}
              homeKaggleId={kh!}
              verbose={defaultOpenLivePredictor}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
