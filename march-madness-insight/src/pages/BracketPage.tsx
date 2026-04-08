import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { RegionFilterTabs } from "@/components/bracket/RegionFilterTabs";
import { useBracketMatchupsForPicks } from "@/hooks/useBracketMatchups";
import { useBracketPicks } from "@/hooks/useBracketPicks";
import {
  fetchFirstRoundMatchupsTyped,
  fetchMatchupStandardProb,
  fetchRoundMatchups,
  fetchTeams2026,
  fetchTournamentResults,
  type TournamentResultRow,
} from "@/lib/api";
import { apiTeamDisplay } from "@/lib/bracketFieldDisplay";
import { scoreBracketAgainstResults } from "@/lib/bracketScore";
import { STAGE_TITLE, type StageKey } from "@/lib/bracket-stages";
import {
  countPicksForStage,
  isRegionR1Complete,
  REGION_LABEL,
  type RegionLetter,
  slotToStage,
  stageTotal,
} from "@/lib/bracketRoundUtils";
import { addSavedBracket, loadSavedBrackets, type SavedBracket } from "@/lib/savedBrackets";
import { isMens2026TournamentPastChampionshipEt } from "@/lib/tournamentRounds";
import { cn } from "@/lib/utils";
import { teamsById } from "@/data/teams2026";
import { logoUrlFromTeamName } from "@/lib/teamLogo";
import { Button } from "@ui/button";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import { Card, CardContent } from "@ui/card";

const ROUND_TABS: { stage: StageKey; label: string }[] = [
  { stage: "R1", label: "Round of 64" },
  { stage: "R2", label: "Round of 32" },
  { stage: "R3", label: "Sweet 16" },
  { stage: "R4", label: "Elite 8" },
  { stage: "R5", label: "Final Four" },
  { stage: "R6", label: "Championship" },
];

const POST_STAGES: Exclude<StageKey, "R1">[] = ["R2", "R3", "R4", "R5", "R6"];

const PREV_COMPLETE: Partial<Record<StageKey, StageKey | null>> = {
  R1: null,
  R2: "R1",
  R3: "R2",
  R4: "R3",
  R5: "R4",
  R6: "R5",
};

function parseBracketStageParam(v: string | null): StageKey | null {
  if (!v) return null;
  const allowed: StageKey[] = ["R1", "R2", "R3", "R4", "R5", "R6"];
  return allowed.includes(v as StageKey) ? (v as StageKey) : null;
}

function stageLocked(stage: StageKey, picks: Record<string, number>): boolean {
  const prev = PREV_COMPLETE[stage];
  if (!prev) return false;
  return countPicksForStage(picks, prev) < stageTotal(prev);
}

function SavedBracketRow({
  sb,
  gender,
  results,
  onView,
  onEdit,
}: {
  sb: SavedBracket;
  gender: "M" | "W";
  results: TournamentResultRow[];
  onView: () => void;
  onEdit: () => void;
}) {
  const { allMatchups, loading } = useBracketMatchupsForPicks(sb.picks, gender);
  const scored = useMemo(
    () => scoreBracketAgainstResults(sb.picks, allMatchups, results),
    [sb.picks, allMatchups, results],
  );

  return (
    <Card className="border-border">
      <CardContent className="space-y-2 p-4">
        <div className="font-display text-sm font-bold uppercase text-white">{sb.name}</div>
        <div className="text-xs text-muted-foreground">
          {Object.keys(sb.picks).length} picks · Saved {new Date(sb.savedAt).toLocaleString()}
        </div>
        <div className="text-xs text-muted-foreground">
          {loading ? (
            <span>Scoring…</span>
          ) : results.length === 0 ? (
            <span>Score: — (add games to results JSON)</span>
          ) : (
            <span>
              {scored.correct}/{scored.total} correct · {scored.points} pts
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="font-display text-[10px] uppercase"
            type="button"
            onClick={onView}
          >
            View
          </Button>
          <Button size="sm" variant="outline" className="font-display text-[10px] uppercase" type="button" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const BracketPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const genderParam = (searchParams.get("gender") || "M").toUpperCase();
  const gender: "M" | "W" = genderParam === "W" ? "W" : "M";

  const { picks, setPick, setPicks, clearPicks } = useBracketPicks();
  const [activeRound, setActiveRound] = useState<StageKey>(() => {
    const fromUrl = parseBracketStageParam(searchParams.get("stage"));
    if (fromUrl) return fromUrl;
    return isMens2026TournamentPastChampionshipEt() ? "R6" : "R1";
  });
  const [regionFilter, setRegionFilter] = useState<"all" | "east" | "south" | "west" | "midwest">("all");
  const [flashSlot, setFlashSlot] = useState<string | null>(null);
  const [view, setView] = useState<"pick" | "saved">("pick");
  const [saved, setSaved] = useState<SavedBracket[]>(() => loadSavedBrackets());
  const [readOnlySnapshot, setReadOnlySnapshot] = useState<SavedBracket | null>(null);

  const effectivePicks = readOnlySnapshot?.picks ?? picks;
  const effectiveReadOnly = readOnlySnapshot != null;

  const { data: first, isLoading: loadingFirst } = useQuery({
    queryKey: ["first-round", gender],
    queryFn: () => fetchFirstRoundMatchupsTyped(gender),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      const s = String((err as Error)?.message ?? "");
      if (/\b(503|502|504)\b/.test(s)) return failureCount < 10;
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 30_000),
  });

  const { data: womenFieldRows = [] } = useQuery({
    queryKey: ["teams-field-2026", "W", "bracket-page"],
    queryFn: () => fetchTeams2026("W"),
    enabled: gender === "W",
    staleTime: 60 * 60 * 1000,
  });

  const womenById = useMemo(() => {
    const m = new Map<number, { teamName?: string | null; seed?: number }>();
    for (const r of womenFieldRows) {
      if (r.teamId) m.set(r.teamId, { teamName: r.teamName, seed: r.seed });
    }
    return m;
  }, [womenFieldRows]);

  const r1Flat = useMemo(() => {
    if (!first?.matchupsByRegion) return [];
    const { east, south, west, midwest } = first.matchupsByRegion;
    return [...(east ?? []), ...(south ?? []), ...(west ?? []), ...(midwest ?? [])];
  }, [first]);

  const probQueries = useQueries({
    queries: r1Flat.map((m) => {
      const a = Number(m.team1?.teamId ?? 0);
      const b = Number(m.team2?.teamId ?? 0);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return {
        queryKey: ["r1prob", gender, lo, hi],
        queryFn: () => fetchMatchupStandardProb(lo, hi, gender),
        enabled: Boolean(a && b && m.slot),
      };
    }),
  });

  const probBySlot = useMemo(() => {
    const out: Record<string, { lo: number; pLo: number }> = {};
    r1Flat.forEach((m, i) => {
      const a = Number(m.team1?.teamId ?? 0);
      const b = Number(m.team2?.teamId ?? 0);
      const lo = Math.min(a, b);
      const p = probQueries[i]?.data;
      if (p == null || !m.slot) return;
      out[String(m.slot)] = { lo, pLo: p };
    });
    return out;
  }, [r1Flat, probQueries]);

  const postQueries = useQueries({
    queries: POST_STAGES.map((stage) => ({
      queryKey: ["round-matchups", stage, gender, effectivePicks],
      queryFn: () => fetchRoundMatchups(stage, gender, effectivePicks, 2026),
      enabled: Object.keys(effectivePicks).length > 0,
      staleTime: 2 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount: number, err: Error) => {
        const s = String(err?.message ?? "");
        if (/\b(503|502|504)\b/.test(s)) return failureCount < 10;
        return failureCount < 3;
      },
      retryDelay: (attempt: number) => Math.min(1500 * 2 ** attempt, 30_000),
    })),
  });

  const r2 = postQueries[0]?.data?.matchups ?? [];
  const r3 = postQueries[1]?.data?.matchups ?? [];
  const r4 = postQueries[2]?.data?.matchups ?? [];
  const r5 = postQueries[3]?.data?.matchups ?? [];
  const r6 = postQueries[4]?.data?.matchups ?? [];

  const pickCount = Object.keys(picks).length;

  const { data: tournamentResults = [] } = useQuery({
    queryKey: ["results", 2026, gender],
    queryFn: () => fetchTournamentResults(2026, gender),
    enabled: true,
    staleTime: 60_000,
  });

  const winnerByPair = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of tournamentResults) {
      const lo = Math.min(g.wTeamId, g.lTeamId);
      const hi = Math.max(g.wTeamId, g.lTeamId);
      out[`${lo}-${hi}`] = g.wTeamId;
    }
    return out;
  }, [tournamentResults]);

  const prevPickCount = useRef(pickCount);
  useEffect(() => {
    if (pickCount === 63 && prevPickCount.current < 63 && !readOnlySnapshot) {
      toast.success("Bracket complete! Click Save to keep it.");
    }
    prevPickCount.current = pickCount;
  }, [pickCount, readOnlySnapshot]);

  useEffect(() => {
    const s = parseBracketStageParam(searchParams.get("stage"));
    if (s) setActiveRound(s);
  }, [searchParams]);

  // Auto-fill picks from completed tournament results so R32+ tabs unlock automatically.
  // Uses setPicks (not setPick) to avoid cascading downstream-pick deletion.
  useEffect(() => {
    if (gender !== "M") return; // Women's bracket doesn't use Kaggle IDs
    if (Object.keys(winnerByPair).length === 0) return;

    // Collect all matchup slots we know about so far (R1 always available;
    // R2/R3/R4 become available as prior-round picks cascade in).
    const allMatchups = [...r1Flat, ...r2, ...r3, ...r4];
    const resultPicks: Record<string, number> = {};

    for (const m of allMatchups) {
      if (!m.slot || !m.team1?.teamId || !m.team2?.teamId) continue;
      const a = Number(m.team1.teamId);
      const b = Number(m.team2.teamId);
      if (!a || !b) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const winner = winnerByPair[`${lo}-${hi}`];
      if (winner != null) {
        resultPicks[String(m.slot)] = winner;
      }
    }

    if (Object.keys(resultPicks).length === 0) return;

    setPicks((prev) => {
      const changed = Object.entries(resultPicks).some(([k, v]) => prev[k] !== v);
      if (!changed) return prev;
      return { ...prev, ...resultPicks };
    });
  }, [gender, winnerByPair, r1Flat, r2, r3, r4, setPicks]);

  const setGender = (g: "M" | "W") => {
    const next = new URLSearchParams(searchParams);
    next.set("gender", g);
    setSearchParams(next);
  };

  const scrollToRound = (stage: StageKey) => {
    setActiveRound(stage);
    const id = `round-anchor-${stage}`;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const roundLoading = useMemo(() => postQueries.some((q) => q.isPending), [postQueries]);

  const handlePick = useCallback(
    (slot: string, teamId: number) => {
      if (effectiveReadOnly) return;
      const roundMatch = slot.match(/^R(\d+)/);
      const roundNum = roundMatch ? parseInt(roundMatch[1], 10) : 0;
      let cleared = 0;
      for (const k of Object.keys(picks)) {
        const m = k.match(/^R(\d+)/);
        const r = m ? parseInt(m[1], 10) : 0;
        if (r > roundNum) cleared++;
      }
      setPick(slot, teamId);
      if (cleared > 0) {
        toast.message(`Pick changed — cleared ${cleared} later round picks`);
      }
      setFlashSlot(slot);
      window.setTimeout(() => setFlashSlot(null), 700);

      const st = slotToStage(slot);
      if (st === "R1") {
        const letter = slot[2] as RegionLetter;
        const next = { ...picks, [slot]: teamId };
        if (letter && ["W", "X", "Y", "Z"].includes(letter) && isRegionR1Complete(next, letter)) {
          toast.success(`${REGION_LABEL[letter]} R64 complete! Open Round of 32 →`, { duration: 4000 });
        }
      }
    },
    [picks, setPick, effectiveReadOnly],
  );

  const saveBracket = () => {
    if (pickCount < 63) {
      toast.message(`Complete your bracket (${pickCount}/63)`);
      return;
    }
    const name = window.prompt("Bracket name", "My Bracket");
    if (!name) return;
    addSavedBracket(name, picks, gender);
    setSaved(loadSavedBrackets());
    toast.success("Bracket saved");
  };

  useEffect(() => {
    setSaved(loadSavedBrackets());
  }, [view]);

  const champTeamId = effectivePicks["R6CH"];

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <div className="border-b border-border bg-[hsl(var(--bg-surface))]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="font-display text-xl font-bold uppercase tracking-tight text-white">BRACKET PICKER</h1>
            <p className="text-xs text-muted-foreground">
              Pick winners · {pickCount}/63 picks
              {champTeamId ? ` · Champ #${champTeamId}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setView("pick");
                  setReadOnlySnapshot(null);
                }}
                className={cn(
                  "rounded px-3 py-1 font-display text-[10px] font-bold uppercase",
                  view === "pick" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                Picks
              </button>
              <button
                type="button"
                onClick={() => setView("saved")}
                className={cn(
                  "rounded px-3 py-1 font-display text-[10px] font-bold uppercase",
                  view === "saved" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                My brackets
              </button>
            </div>
            <span className="font-display text-xs font-bold tracking-wider text-muted-foreground">{pickCount}/63</span>
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
            <Button variant="outline" size="sm" className="font-display text-xs font-bold uppercase" onClick={clearPicks}>
              Clear picks
            </Button>
            <Button variant="default" size="sm" className="font-display text-xs font-bold uppercase" onClick={saveBracket}>
              Save bracket
            </Button>
          </div>
        </div>
      </div>

      {view === "saved" ? (
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saved.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved brackets yet. Complete picks and tap Save.</p>
            ) : (
              saved.map((s) => (
                <SavedBracketRow
                  key={s.id}
                  sb={s}
                  gender={gender}
                  results={tournamentResults}
                  onView={() => {
                    setReadOnlySnapshot(s);
                    setView("pick");
                    toast.message(`Viewing “${s.name}” read-only`);
                  }}
                  onEdit={() => {
                    setPicks(s.picks);
                    setReadOnlySnapshot(null);
                    setView("pick");
                    toast.success(`Loaded “${s.name}” for editing`);
                  }}
                />
              ))
            )}
          </div>
        </div>
      ) : null}

      {view === "pick" ? (
        <>
          <div className="sticky top-0 z-10 border-b border-border bg-[hsl(var(--bg-base))]/95 px-4 py-2 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-wrap gap-2">
              {ROUND_TABS.map(({ stage, label }) => {
                const locked = stageLocked(stage, effectivePicks);
                const cnt = countPicksForStage(effectivePicks, stage);
                const tot = stageTotal(stage);
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => !locked && scrollToRound(stage)}
                    disabled={locked}
                    className={cn(
                      "border-b-2 px-2 py-2 font-display text-[11px] font-bold uppercase tracking-wide transition-colors sm:text-xs",
                      locked ? "cursor-not-allowed border-transparent text-muted-foreground/50" : "",
                      activeRound === stage
                        ? "border-[hsl(var(--predict-blue))] text-white"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                    title={locked ? "Complete the previous round first" : label}
                  >
                    {label}{" "}
                    <span className="text-[10px] opacity-80">
                      ({cnt}/{tot})
                    </span>
                    {locked ? " 🔒" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
            {readOnlySnapshot ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Viewing saved bracket: {readOnlySnapshot.name}{" "}
                <button type="button" className="ml-2 underline" onClick={() => setReadOnlySnapshot(null)}>
                  Exit
                </button>
              </p>
            ) : null}
            {loadingFirst ? (
              <p className="font-display text-sm text-muted-foreground">Loading bracket…</p>
            ) : null}
            {roundLoading ? (
              <p className="font-display text-xs text-muted-foreground">Updating later rounds…</p>
            ) : null}
            <div id="round-anchor-R1" className="sr-only" />
            <div id="round-anchor-R2" className="sr-only" />
            <div id="round-anchor-R3" className="sr-only" />
            <div id="round-anchor-R4" className="sr-only" />
            <div id="round-anchor-R5" className="sr-only" />
            <div id="round-anchor-R6" className="sr-only" />
            {first?.matchupsByRegion ? (
              <div className="space-y-4">
                {(activeRound === "R1" || activeRound === "R2") ? (
                  <RegionFilterTabs value={regionFilter} onValueChange={setRegionFilter} />
                ) : null}
                <div className="grid gap-3 md:grid-cols-2">
                  {(() => {
                    const regionLetter = regionFilter === "east" ? "W" : regionFilter === "south" ? "X" : regionFilter === "west" ? "Z" : regionFilter === "midwest" ? "Y" : null;
                    const rows =
                      activeRound === "R1"
                        ? [
                            ...(regionFilter === "all" || regionFilter === "east" ? first.matchupsByRegion.east ?? [] : []),
                            ...(regionFilter === "all" || regionFilter === "south" ? first.matchupsByRegion.south ?? [] : []),
                            ...(regionFilter === "all" || regionFilter === "west" ? first.matchupsByRegion.west ?? [] : []),
                            ...(regionFilter === "all" || regionFilter === "midwest" ? first.matchupsByRegion.midwest ?? [] : []),
                          ]
                        : activeRound === "R2"
                          ? r2.filter((m) => (regionLetter ? String(m.slot ?? "").includes(regionLetter) : true))
                          : activeRound === "R3"
                            ? r3
                            : activeRound === "R4"
                              ? r4
                              : activeRound === "R5"
                                ? r5
                                : r6;
                    return rows.map((m) => {
                      const slot = String(m.slot ?? m.id ?? "");
                      const a = Number(m.team1?.teamId ?? 0);
                      const b = Number(m.team2?.teamId ?? 0);
                      const lo = Math.min(a, b);
                      const hi = Math.max(a, b);
                      const rw = a && b ? winnerByPair[`${lo}-${hi}`] : undefined;
                      const isFinal = rw != null;
                      const locked = effectiveReadOnly || isFinal;
                      const d1 = apiTeamDisplay(gender, m.team1, womenById);
                      const d2 = apiTeamDisplay(gender, m.team2, womenById);
                      const teamMetaA = gender === "M" && a ? teamsById.get(a) : undefined;
                      const teamMetaB = gender === "M" && b ? teamsById.get(b) : undefined;
                      const logoA = logoUrlFromTeamName(d1.name);
                      const logoB = logoUrlFromTeamName(d2.name);
                      const pa = probBySlot?.[slot] && a ? (probBySlot[slot].lo === a ? probBySlot[slot].pLo * 100 : (1 - probBySlot[slot].pLo) * 100) : null;
                      const pb = probBySlot?.[slot] && b ? (probBySlot[slot].lo === b ? probBySlot[slot].pLo * 100 : (1 - probBySlot[slot].pLo) * 100) : null;
                      return (
                        <Card key={slot} className="border-border">
                          <CardContent className="space-y-2 p-3">
                            <div className="flex items-center justify-between">
                              <div className="font-display text-[10px] font-bold uppercase text-muted-foreground">{slot}</div>
                              {isFinal ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">Final</span> : null}
                            </div>
                            <button
                              type="button"
                              disabled={locked || !a}
                              onClick={() => a && handlePick(slot, a)}
                              className={cn(
                                "flex w-full items-center justify-between rounded border px-2 py-2 text-left",
                                picks[slot] === a ? "border-primary bg-primary/10" : "border-border",
                                rw === a ? "border-l-4 border-l-emerald-500" : "",
                                rw && rw !== a ? "opacity-60 line-through" : "",
                              )}
                            >
                              <span className="flex items-center gap-2">
                                {logoA ? (
                                  <img
                                    src={logoA}
                                    alt=""
                                    className="h-6 w-6 rounded-full bg-muted/40 p-0.5"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).style.display = "none";
                                    }}
                                  />
                                ) : null}
                                <span>
                                  <span className="font-semibold font-display uppercase">
                                    #{d1.seed > 0 ? d1.seed : "?"} {d1.name}
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground">
                                    {gender === "M" && teamMetaA
                                      ? `${teamMetaA.record ?? "—"} · ${teamMetaA.conference ?? ""}`
                                      : gender === "W"
                                        ? `Seed ${d1.seed}`
                                        : ""}
                                  </span>
                                </span>
                              </span>
                              <span className="text-xs text-muted-foreground">{pa != null ? `${pa.toFixed(1)}%` : ""}</span>
                            </button>
                            <button
                              type="button"
                              disabled={locked || !b}
                              onClick={() => b && handlePick(slot, b)}
                              className={cn(
                                "flex w-full items-center justify-between rounded border px-2 py-2 text-left",
                                picks[slot] === b ? "border-primary bg-primary/10" : "border-border",
                                rw === b ? "border-l-4 border-l-emerald-500" : "",
                                rw && rw !== b ? "opacity-60 line-through" : "",
                              )}
                            >
                              <span className="flex items-center gap-2">
                                {logoB ? (
                                  <img
                                    src={logoB}
                                    alt=""
                                    className="h-6 w-6 rounded-full bg-muted/40 p-0.5"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).style.display = "none";
                                    }}
                                  />
                                ) : null}
                                <span>
                                  <span className="font-semibold font-display uppercase">
                                    #{d2.seed > 0 ? d2.seed : "?"} {d2.name}
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground">
                                    {gender === "M" && teamMetaB
                                      ? `${teamMetaB.record ?? "—"} · ${teamMetaB.conference ?? ""}`
                                      : gender === "W"
                                        ? `Seed ${d2.seed}`
                                        : ""}
                                  </span>
                                </span>
                              </span>
                              <span className="text-xs text-muted-foreground">{pb != null ? `${pb.toFixed(1)}%` : ""}</span>
                            </button>
                            {a && b ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-1 w-full text-[10px] uppercase"
                                onClick={() => window.location.assign(`/predictor/${lo}/${hi}`)}
                              >
                                Predictive model snapshot
                              </Button>
                            ) : null}
                          </CardContent>
                        </Card>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : !loadingFirst ? (
              <p className="text-sm text-muted-foreground">Could not load first-round matchups.</p>
            ) : null}

            <div className="rounded-lg border border-border bg-card/50 p-4 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Stages</span>:{" "}
              {POST_STAGES.map((s) => STAGE_TITLE[s]).join(" · ")}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default BracketPage;
