import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { StageTabs } from "@/components/bracket/StageTabs";
import { RegionFilterTabs } from "@/components/bracket/RegionFilterTabs";
import { MatchupPicker } from "@/components/predictor/MatchupPicker";
import { PredictionGauge } from "@/components/predictor/PredictionGauge";
import { ModelBreakdownTable } from "@/components/predictor/ModelBreakdownTable";
import { SystemOrdinalRankings } from "@/components/predictor/SystemOrdinalRankings";
import { TeamStatHighlights } from "@/components/predictor/TeamStatHighlights";
import { InjuryBanner } from "@/components/predictor/InjuryBanner";
import { UpsetAlert } from "@/components/predictor/UpsetAlert";

import { fetchMatchup, fetchRoundMatchups } from "@/lib/api";
import { parseStageParam, STAGE_TITLE, type StageKey } from "@/lib/bracket-stages";
import {
  filterMatchupsByRegion,
  groupMatchupsByRegion,
  type RegionFilterKey,
} from "@/lib/bracket-regions";
import type { BracketMatchup, Team, UserPick } from "@/types/bracket";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@ui/breadcrumb";
import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import { Badge } from "@ui/badge";
import { loadBracketPicks } from "@/lib/bracketPicksStorage";
import type { ApiBracketMatchupRow, ApiBracketTeamRow } from "@/lib/bracketApiTypes";
import { getLogoFilenameFromName } from "@/lib/teamLogo";

const deriveAbbreviation = (name: string): string => {
  const cleaned = String(name ?? "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const abb = parts
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase();
  return abb.length ? abb : "TEAM";
};

const colorFromId = (teamId: number): string => {
  const hue = Math.abs(teamId) % 360;
  return `hsl(${hue} 70% 45%)`;
};

const PredictorPage = () => {
  const { team1Id, team2Id } = useParams<{ team1Id: string; team2Id: string }>();
  const matchupId =
    team1Id && team2Id ? `${team1Id}-${team2Id}` : undefined;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const stage: StageKey = parseStageParam(searchParams.get("stage"));
  const showSideRegion = stage === "R1" || stage === "R2";
  const [sideRegion, setSideRegion] = useState<RegionFilterKey>("all");

  const [currentPick, setCurrentPick] = useState<number | undefined>();

  useEffect(() => {
    if (!showSideRegion) setSideRegion("all");
  }, [showSideRegion]);

  const {
    data: matchup,
    isLoading: matchupLoading,
  } = useQuery({
    queryKey: ["matchup", matchupId],
    queryFn: () => fetchMatchup(matchupId || "1181-1234"),
  });

  const inferredGender: "M" | "W" | null = useMemo(() => {
    const raw = String(matchupId || "");
    const m = raw.match(/^(\d+)-(\d+)$/);
    if (!m) return null;
    const t1 = parseInt(m[1], 10);
    const t2 = parseInt(m[2], 10);
    return Math.max(t1, t2) >= 3000 ? "W" : "M";
  }, [matchupId]);

  const genderForSidePanel: "M" | "W" | null = useMemo(() => {
    if (matchup) return Math.max(matchup.team1.id, matchup.team2.id) >= 3000 ? "W" : "M";
    return inferredGender;
  }, [inferredGender, matchup]);

  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

  const toTeam = useCallback(
    (t: ApiBracketTeamRow | undefined): Team => {
      const tid = Number(t?.teamId ?? 0);
      const name = String(t?.teamName ?? `Team ${tid}`);
      const seedNum = typeof t?.seed === "number" ? t.seed : 0;
      const region = (String(t?.region ?? "East") as Team["region"]) ?? "East";
      return {
        id: tid,
        name,
        nickname: "",
        abbreviation: deriveAbbreviation(name),
        seed: Math.max(0, seedNum),
        region,
        record: "",
        conference: "",
        color: colorFromId(tid),
        logoUrl: `${apiBase}/teamlogo/${encodeURIComponent(getLogoFilenameFromName(name))}.png`,
      };
    },
    [apiBase],
  );

  const picksForGender = useMemo(() => {
    if (!genderForSidePanel) return {};
    return loadBracketPicks();
  }, [genderForSidePanel]);

  const picksKey = useMemo(() => {
    return Object.entries(picksForGender)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}:${v}`)
      .join("|");
  }, [picksForGender]);

  const {
    data: sidePanelData,
    isPending: sidePanelPending,
    isPlaceholderData: sidePanelIsPlaceholder,
  } = useQuery({
    queryKey: ["round-matchups-side", genderForSidePanel, stage, picksKey],
    queryFn: () =>
      fetchRoundMatchups(stage, genderForSidePanel as "M" | "W", picksForGender, 2026),
    enabled: Boolean(matchup && genderForSidePanel),
    placeholderData: (previousData, previousQuery) => {
      const pk = previousQuery?.queryKey as readonly unknown[] | undefined;
      if (!previousData || !pk || pk.length < 3) return undefined;
      if (pk[1] === genderForSidePanel && pk[2] === stage) return previousData;
      return undefined;
    },
  });

  const sidePanelLoading = sidePanelPending && !sidePanelIsPlaceholder;

  const leftMatchups: BracketMatchup[] = useMemo(() => {
    const list: ApiBracketMatchupRow[] = sidePanelData?.matchups ?? [];
    return list.map(
      (m): BracketMatchup => ({
        id: String(m.id),
        slot: String(m.slot ?? m.id),
        team1: toTeam(m.team1),
        team2: toTeam(m.team2),
        prob: Number(m.prob ?? 0),
        upsetFlag: Boolean(m.upsetFlag ?? false),
        gameTime: m.gameTime ?? undefined,
      }),
    );
  }, [sidePanelData, toTeam]);

  type SidePanelDisplay =
    | { kind: "flat"; items: BracketMatchup[] }
    | { kind: "grouped"; groups: { region: Team["region"]; items: BracketMatchup[] }[] };

  const sidePanelDisplay: SidePanelDisplay = useMemo(() => {
    if (!showSideRegion) return { kind: "flat", items: leftMatchups };
    if (sideRegion === "all") return { kind: "grouped", groups: groupMatchupsByRegion(leftMatchups) };
    return { kind: "flat", items: filterMatchupsByRegion(leftMatchups, sideRegion) };
  }, [leftMatchups, showSideRegion, sideRegion]);

  const bracketHref = useMemo(() => {
    if (!genderForSidePanel) return "/bracket";
    const qs = new URLSearchParams({ stage, gender: genderForSidePanel });
    if (showSideRegion) qs.set("region", sideRegion);
    return `/bracket?${qs.toString()}`;
  }, [genderForSidePanel, stage, showSideRegion, sideRegion]);

  const genderToggle = genderForSidePanel ? (
    <ToggleGroup
      type="single"
      value={genderForSidePanel}
      variant="outline"
      size="sm"
      onValueChange={(v) => {
        if (v !== "M" && v !== "W") return;
        const qs = new URLSearchParams({ stage, gender: v });
        if (showSideRegion) qs.set("region", sideRegion);
        navigate(`/bracket?${qs.toString()}`);
      }}
      className="rounded-xl border border-border bg-muted/40 p-1 shadow-sm"
    >
      <ToggleGroupItem
        value="M"
        className="rounded-lg px-3 font-display text-xs font-bold uppercase data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        Men&apos;s
      </ToggleGroupItem>
      <ToggleGroupItem
        value="W"
        className="rounded-lg px-3 font-display text-xs font-bold uppercase data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        Women&apos;s
      </ToggleGroupItem>
    </ToggleGroup>
  ) : null;

  if (!team1Id || !team2Id) {
    return (
      <div className="min-h-screen bg-muted/40 p-8">
        <p className="font-display text-lg text-white">Invalid predictor URL. Use /predictor/team1Id/team2Id</p>
      </div>
    );
  }

  if (matchupLoading || !matchup || !genderForSidePanel) {
    return (
      <div className="min-h-screen bg-muted/40">
        <div className="border-b border-border bg-[hsl(var(--bg-surface))] px-4 py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
            <div>
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Matchup</p>
              <p className="font-display text-sm font-bold text-white">Loading…</p>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-5xl space-y-4 p-4">
          <Skeleton className="h-8 w-full max-w-md rounded-lg" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-96 rounded-xl lg:col-span-1" />
            <Skeleton className="h-96 rounded-xl lg:col-span-1" />
            <Skeleton className="h-96 rounded-xl lg:col-span-1" />
          </div>
        </div>
      </div>
    );
  }

  const {
    team1,
    team2,
    standardProb,
    modelBreakdown,
    upsetAlert,
    giantKillerScore,
    injuryImpact,
    ordinalRanks,
    degraded,
  } = matchup;

  const totalPicks = Object.keys(picksForGender ?? {}).length;
  const picksRemaining = 63 - totalPicks;

  const matchupShort = `${team1.abbreviation} vs ${team2.abbreviation}`;

  const renderSideRow = (m: BracketMatchup) => {
    const selected = String(m.id) === String(matchupId);
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => {
          const p = String(m.id).split("-");
          if (p.length >= 2) navigate(`/predictor/${p[0]}/${p[1]}?stage=${encodeURIComponent(stage)}`);
        }}
        className={[
          "w-full rounded-xl border p-3 text-left transition-colors",
          selected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:bg-muted/50",
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 gap-1.5">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-transparent">
              {m.team1.logoUrl ? (
                <img
                  src={m.team1.logoUrl}
                  alt=""
                  className="h-8 w-8 object-contain"
                  loading="lazy"
                  draggable={false}
                />
              ) : (
                <span className="font-display text-sm font-bold">{m.team1.abbreviation.charAt(0)}</span>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-transparent">
              {m.team2.logoUrl ? (
                <img
                  src={m.team2.logoUrl}
                  alt=""
                  className="h-8 w-8 object-contain"
                  loading="lazy"
                  draggable={false}
                />
              ) : (
                <span className="font-display text-sm font-bold">{m.team2.abbreviation.charAt(0)}</span>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold uppercase tracking-wide text-foreground">
              {m.team1.name} vs {m.team2.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              #{m.team1.seed} · #{m.team2.seed}
            </div>
          </div>
          {m.upsetFlag ? (
            <Badge variant="destructive" className="shrink-0 text-[10px]">
              Upset
            </Badge>
          ) : null}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <div className="border-b border-border bg-[hsl(var(--bg-surface))]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Matchup preview</p>
            <p className="truncate font-display text-sm font-bold text-white">{matchupShort}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {genderToggle}
            <Button variant="outline" size="sm" className="font-display text-xs font-bold uppercase" asChild>
              <Link to={bracketHref}>Bracket</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-muted/20">
        <div className="mx-auto max-w-5xl px-4 py-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/bracket">Bracket</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={bracketHref}>Bracket</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={bracketHref}>{STAGE_TITLE[stage]}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{matchupShort}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      <StageTabs
        activeStage={stage}
        onStageChange={(s) => {
          if (team1Id && team2Id) {
            navigate(`/predictor/${team1Id}/${team2Id}?stage=${encodeURIComponent(s)}`);
          }
        }}
        picksRemaining={picksRemaining}
      />

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <aside className="lg:col-span-1">
            <Card className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <CardHeader className="space-y-3 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg font-semibold tracking-tight">{STAGE_TITLE[stage]}</CardTitle>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    Games
                  </Badge>
                </div>
                <CardDescription>Jump between matchups in this round.</CardDescription>
                {showSideRegion ? <RegionFilterTabs value={sideRegion} onValueChange={setSideRegion} /> : null}
              </CardHeader>
              <CardContent className="pt-0">
                {sidePanelLoading ? (
                  <div className="space-y-2 py-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : leftMatchups.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No matchups resolved for this stage yet.</p>
                ) : sidePanelDisplay.kind === "flat" && sidePanelDisplay.items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No games in this region.</p>
                ) : sidePanelDisplay.kind === "grouped" ? (
                  <ScrollArea className="h-[min(70vh,32rem)] pr-3">
                    <div className="space-y-6 pb-2">
                      {sidePanelDisplay.groups.map(({ region, items }) => (
                        <div key={region} className="space-y-2">
                          <div className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            {region}
                          </div>
                          <div className="space-y-2">{items.map(renderSideRow)}</div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <ScrollArea className="h-[min(70vh,32rem)] pr-3">
                    <div className="space-y-2 pb-2">{sidePanelDisplay.items.map(renderSideRow)}</div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </aside>

          <section className="space-y-4 lg:col-span-1">
            <MatchupPicker team1={team1} team2={team2} onPick={setCurrentPick} currentPick={currentPick} />

            <Card className="rounded-xl border bg-card shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base tracking-tight">Overall prediction</CardTitle>
              </CardHeader>
              <CardContent>
                <PredictionGauge
                  prob={standardProb}
                  team1={team1.name}
                  team2={team2.name}
                  team1Abbrev={team1.abbreviation}
                  team2Abbrev={team2.abbreviation}
                  team1Color={team1.color}
                  team1LogoUrl={team1.logoUrl}
                  team2LogoUrl={team2.logoUrl}
                />
              </CardContent>
            </Card>

            <InjuryBanner injury={injuryImpact} teamName={team1.name} />
            <UpsetAlert show={upsetAlert} score={giantKillerScore} teamName={team2.name} />

            <Card className="rounded-xl border bg-card shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base tracking-tight">Model breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ModelBreakdownTable
                  breakdown={modelBreakdown}
                  team1Abbrev={team1.abbreviation}
                  team2Abbrev={team2.abbreviation}
                  team1Color={team1.color}
                  degraded={degraded}
                />
              </CardContent>
            </Card>

            <SystemOrdinalRankings
              team1Abbrev={team1.abbreviation}
              team2Abbrev={team2.abbreviation}
              ordinalRanks={ordinalRanks}
            />
          </section>

          <aside className="lg:col-span-1">
            <Card className="rounded-xl border bg-card shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base tracking-tight">Team highlights</CardTitle>
                <CardDescription>Compact stat view for both sides.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScrollArea className="h-[min(70vh,40rem)] pr-3">
                  <div className="space-y-3 pb-2">
                    <TeamStatHighlights
                      team={team1}
                      stats={matchup.team1Stats}
                      narrative={matchup.team1Narrative}
                      teamSide={1}
                      ordinalRanks={ordinalRanks}
                    />
                    <Separator />
                    <TeamStatHighlights
                      team={team2}
                      stats={matchup.team2Stats}
                      narrative={matchup.team2Narrative}
                      teamSide={2}
                      ordinalRanks={ordinalRanks}
                    />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default PredictorPage;
