import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import {
  fetchFirstRoundMatchupsTyped,
  fetchRoundMatchups,
  fetchTeams2026,
  type Team2026Row,
} from "@/lib/api";
import { useTournamentResults } from "@/hooks/useTournamentResults";
import { teamsById } from "@/data/teams2026";
import { cn } from "@/lib/utils";
import { isMens2026TournamentPastChampionshipEt } from "@/lib/tournamentRounds";
import { LiveCompressedBracket } from "@/components/compressed-bracket/LiveCompressedBracket";
import {
  buildCompressedBracketModelFromLive,
  type FieldTeamEnricher,
} from "@/lib/buildLiveCompressedBracket";
import type { Game } from "@/lib/compressedBracketTypes";
import { Badge } from "@ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import { Skeleton } from "@ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveMatchupRow {
  id?: string;
  slot?: string;
  team1?: { teamId?: number; teamName?: string; seed?: number };
  team2?: { teamId?: number; teamName?: string; seed?: number };
}

type LiveRoundRow = LiveMatchupRow;

function appendWinnersBySlot(
  base: Record<string, number>,
  rows: LiveRoundRow[],
  winnersByPair: Record<string, number>,
): Record<string, number> {
  const next = { ...base };
  for (const row of rows) {
    const a = Number(row.team1?.teamId ?? 0);
    const b = Number(row.team2?.teamId ?? 0);
    if (!a || !b || !row.slot) continue;
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    const winner = winnersByPair[key];
    if (winner) next[String(row.slot)] = winner;
  }
  return next;
}

function womenFieldEnricher(rows: Team2026Row[] | undefined): FieldTeamEnricher {
  const byId = new Map<number, Team2026Row>();
  for (const r of rows ?? []) {
    if (r.teamId) byId.set(r.teamId, r);
  }
  return (id: number) => {
    const t = byId.get(id);
    if (!t) return null;
    const name = String(t.teamName ?? "TBD");
    const parts = name.trim().split(/\s+/);
    const last = parts[parts.length - 1] ?? "";
    const abbreviation = last.replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase() || "TBD";
    return { name, abbreviation, seed: Number(t.seed ?? 0) };
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const LiveBracketPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const genderParam = (searchParams.get("gender") || "M").toUpperCase();
  const gender: "M" | "W" = genderParam === "W" ? "W" : "M";

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const { data: first, isLoading: loadingFirst } = useQuery({
    queryKey: ["first-round", gender],
    queryFn: () => fetchFirstRoundMatchupsTyped(gender),
  });

  const { data: womenField } = useQuery({
    queryKey: ["teams-field-2026", "W", "live-bracket"],
    queryFn: () => fetchTeams2026("W"),
    enabled: gender === "W",
    staleTime: 60 * 60 * 1000,
  });

  const completedQ = useTournamentResults(gender);

  const r1Flat = useMemo(() => {
    if (!first?.matchupsByRegion) return [];
    const { east, south, west, midwest } = first.matchupsByRegion;
    return [...(east ?? []), ...(south ?? []), ...(west ?? []), ...(midwest ?? [])];
  }, [first]);

  type WinnerRow = { wTeamId: number; lTeamId: number };
  const liveWinnerRows = useMemo<WinnerRow[]>(() => {
    const games = completedQ.data ?? [];
    const out: WinnerRow[] = [];
    for (const g of games) {
      if (!g.winnerKaggleId || !g.homeKaggleId || !g.awayKaggleId) continue;
      const loser = g.winnerKaggleId === g.homeKaggleId ? g.awayKaggleId : g.homeKaggleId;
      if (!loser) continue;
      out.push({ wTeamId: g.winnerKaggleId, lTeamId: loser });
    }
    return out;
  }, [completedQ.data]);

  const winnerByPair = useMemo(() => {
    const o: Record<string, number> = {};
    for (const g of liveWinnerRows) {
      o[`${Math.min(g.wTeamId, g.lTeamId)}-${Math.max(g.wTeamId, g.lTeamId)}`] = g.wTeamId;
    }
    return o;
  }, [liveWinnerRows]);

  /**
   * Slot winners from API for R64 only — enough for the backend to advance round-matchups.
   * (Full pair→slot map including R32+ is merged below after those rows exist.)
   */
  const picksR1Only = useMemo(() => {
    const out: Record<string, number> = {};
    const slotByPair = new Map<string, string>();
    for (const m of r1Flat as LiveMatchupRow[]) {
      const a = Number(m.team1?.teamId ?? 0);
      const b = Number(m.team2?.teamId ?? 0);
      if (!a || !b || !m.slot) continue;
      slotByPair.set(`${Math.min(a, b)}-${Math.max(a, b)}`, String(m.slot));
    }
    for (const g of liveWinnerRows) {
      const key = `${Math.min(g.wTeamId, g.lTeamId)}-${Math.max(g.wTeamId, g.lTeamId)}`;
      const slot = slotByPair.get(key);
      if (slot) out[slot] = g.wTeamId;
    }
    return out;
  }, [r1Flat, liveWinnerRows]);

  const r2Q = useQuery({
    queryKey: ["round-matchups", "live", "R2", gender, picksR1Only],
    queryFn: () => fetchRoundMatchups("R2", gender, picksR1Only, 2026, { strictLive: true }),
    enabled: !loadingFirst && r1Flat.length > 0,
  });
  const r2 = (r2Q.data?.matchups ?? []) as LiveMatchupRow[];

  const picksThroughR2 = useMemo(() => appendWinnersBySlot(picksR1Only, r2, winnerByPair), [picksR1Only, r2, winnerByPair]);

  const r3Q = useQuery({
    queryKey: ["round-matchups", "live", "R3", gender, picksThroughR2],
    queryFn: () => fetchRoundMatchups("R3", gender, picksThroughR2, 2026, { strictLive: true }),
    enabled: !loadingFirst && r2.length > 0,
  });
  const r3 = (r3Q.data?.matchups ?? []) as LiveMatchupRow[];

  const picksThroughR3 = useMemo(() => appendWinnersBySlot(picksThroughR2, r3, winnerByPair), [picksThroughR2, r3, winnerByPair]);

  const r4Q = useQuery({
    queryKey: ["round-matchups", "live", "R4", gender, picksThroughR3],
    queryFn: () => fetchRoundMatchups("R4", gender, picksThroughR3, 2026, { strictLive: true }),
    enabled: !loadingFirst && r3.length > 0,
  });
  const r4 = (r4Q.data?.matchups ?? []) as LiveMatchupRow[];

  const picksThroughR4 = useMemo(() => appendWinnersBySlot(picksThroughR3, r4, winnerByPair), [picksThroughR3, r4, winnerByPair]);

  const r5Q = useQuery({
    queryKey: ["round-matchups", "live", "R5", gender, picksThroughR4],
    queryFn: () => fetchRoundMatchups("R5", gender, picksThroughR4, 2026, { strictLive: true }),
    enabled: !loadingFirst && r4.length > 0,
  });
  const r5 = (r5Q.data?.matchups ?? []) as LiveMatchupRow[];

  const picksThroughR5 = useMemo(() => appendWinnersBySlot(picksThroughR4, r5, winnerByPair), [picksThroughR4, r5, winnerByPair]);

  const r6Q = useQuery({
    queryKey: ["round-matchups", "live", "R6", gender, picksThroughR5],
    queryFn: () => fetchRoundMatchups("R6", gender, picksThroughR5, 2026, { strictLive: true }),
    enabled: !loadingFirst && r5.length > 0,
  });
  const r6 = (r6Q.data?.matchups ?? []) as LiveMatchupRow[];

  const stageMatchups = useMemo(() => ({ r2, r3, r4, r5, r6 }), [r2, r3, r4, r5, r6]);

  /** Full slot picks for display + slotWinner(); winners also resolved via winnerByPair. */
  const mergedPicksBySlot = useMemo(() => {
    const out: Record<string, number> = {};
    const slotByPair = new Map<string, string>();
    for (const m of r1Flat as LiveMatchupRow[]) {
      const a = Number(m.team1?.teamId ?? 0);
      const b = Number(m.team2?.teamId ?? 0);
      if (!a || !b || !m.slot) continue;
      slotByPair.set(`${Math.min(a, b)}-${Math.max(a, b)}`, String(m.slot));
    }
    for (const row of [...stageMatchups.r2, ...stageMatchups.r3, ...stageMatchups.r4, ...stageMatchups.r5, ...stageMatchups.r6]) {
      const a = Number(row.team1?.teamId ?? 0);
      const b = Number(row.team2?.teamId ?? 0);
      if (!a || !b || !row.slot) continue;
      slotByPair.set(`${Math.min(a, b)}-${Math.max(a, b)}`, String(row.slot));
    }
    for (const g of liveWinnerRows) {
      const key = `${Math.min(g.wTeamId, g.lTeamId)}-${Math.max(g.wTeamId, g.lTeamId)}`;
      const slot = slotByPair.get(key);
      if (slot) out[slot] = g.wTeamId;
    }
    return out;
  }, [r1Flat, stageMatchups, liveWinnerRows]);

  const allMatchupsBySlot = useMemo(() => {
    const out: Record<string, LiveMatchupRow> = {};
    for (const m of r1Flat as LiveMatchupRow[]) {
      if (m.slot) out[String(m.slot)] = m;
    }
    for (const s of [...stageMatchups.r2, ...stageMatchups.r3, ...stageMatchups.r4, ...stageMatchups.r5, ...stageMatchups.r6]) {
      if (s.slot) out[String(s.slot)] = s;
    }
    return out;
  }, [r1Flat, stageMatchups]);

  const enrichFieldTeam: FieldTeamEnricher = useMemo(() => {
    if (gender === "M") {
      return (id: number) => {
        const t = teamsById.get(id);
        if (!t) return null;
        return { name: t.name, abbreviation: t.abbreviation, seed: t.seed };
      };
    }
    return womenFieldEnricher(womenField);
  }, [gender, womenField]);

  const compressedBracketModel = useMemo(
    () =>
      buildCompressedBracketModelFromLive(allMatchupsBySlot, winnerByPair, mergedPicksBySlot, enrichFieldTeam),
    [allMatchupsBySlot, winnerByPair, mergedPicksBySlot, enrichFieldTeam],
  );

  const setGender = (g: "M" | "W") => {
    const next = new URLSearchParams(searchParams);
    next.set("gender", g);
    setSearchParams(next);
  };

  const completedCount = completedQ.data?.length ?? 0;
  const menTournamentFinal =
    gender === "M" && isMens2026TournamentPastChampionshipEt();

  const onSelectGame = (game: Game) => {
    setSelectedGameId(game.id);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-muted/40 pb-16">
      {/* Header bar */}
      <div className="border-b border-border bg-[hsl(var(--bg-surface))]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-bold uppercase tracking-tight text-white">LIVE BRACKET</h1>
            {menTournamentFinal ? (
              <Badge className="bg-muted font-display text-[10px] font-bold uppercase text-foreground">Final bracket</Badge>
            ) : (
              <Badge className="bg-destructive font-display text-[10px] font-bold uppercase animate-pulse">● Live</Badge>
            )}
          </div>
          <p className="max-w-xl text-xs text-muted-foreground">
            Tournament bracket + seeds match the published field. Winners and scores from{" "}
            <span className="font-semibold text-foreground">live scoreboard sync</span> — not model picks.{" "}
            {menTournamentFinal
              ? "2026 men's tournament complete — full bracket reflects final results."
              : `${completedCount} completed games.`}
          </p>
          <ToggleGroup
            type="single"
            value={gender}
            variant="outline"
            size="sm"
            onValueChange={(v) => {
              if (v === "M" || v === "W") setGender(v);
            }}
          >
            <ToggleGroupItem value="M" className="font-display text-xs font-bold uppercase">
              Men&apos;s
            </ToggleGroupItem>
            <ToggleGroupItem value="W" className="font-display text-xs font-bold uppercase">
              Women&apos;s
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="border-b border-border bg-[hsl(var(--bg-base))]/95 px-4 py-2">
        <p className="mx-auto max-w-7xl font-display text-[10px] uppercase text-muted-foreground">
          {menTournamentFinal
            ? "Final tree — all rounds filled from completed games."
            : "Scroll horizontally on smaller screens · Later rounds fill as games finish (e.g. Sweet 16 stays TBD until R32 is complete)."}{" "}
          {completedQ.isFetching ? "Updating results…" : ""}
        </p>
      </div>

      {/* Compressed bracket */}
      <div className="mx-auto w-full max-w-[100vw] px-2 py-4 md:px-4">
        {loadingFirst ? (
          <div className="mx-auto flex max-w-7xl flex-col gap-2">
            <Skeleton className="h-8 w-48 rounded-md" />
            <Skeleton className="h-[min(70vh,720px)] w-full min-w-[800px] rounded-xl" />
          </div>
        ) : (
          <div
            className={cn(
              "overflow-x-auto overflow-y-visible rounded-xl border border-border/60 bg-card/30 pb-4 pt-2 shadow-inner",
            )}
          >
            <LiveCompressedBracket
              model={compressedBracketModel}
              selectedGameId={selectedGameId}
              onSelectGame={onSelectGame}
            />
          </div>
        )}
      </div>

      {completedCount > 0 ? (
        <div className="mx-auto mt-6 max-w-7xl px-4">
          <div className="rounded-lg border border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{completedCount}</span> games synced from live results ·{" "}
            <span className="font-semibold text-foreground">{liveWinnerRows.length}</span> winner rows resolved to Kaggle IDs
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LiveBracketPage;
