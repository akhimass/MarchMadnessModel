import type { QueryClient } from "@tanstack/react-query";

import {
  fetchFirstRoundMatchupsTyped,
  fetchModelPerformance,
  fetchOrdinalSystems,
  fetchTeams2026,
  fetchTournamentResults,
} from "@/lib/api";

function apiOrigin(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
  const base = raw.replace(/\/$/, "");
  return base || "http://127.0.0.1:8000";
}

/** Cheap wake-up for sleeping hosts (Render free tier, etc.). */
export async function pingBackendHealth(): Promise<void> {
  await fetch(`${apiOrigin()}/api/health`, { cache: "no-store" }).catch(() => undefined);
}

/**
 * Fire-and-forget: primes React Query caches and TLS/DNS so first navigation feels instant.
 * Safe if the API is cold (503): prefetch uses retry:0 so we do not hammer the server.
 */
export function prefetchDeploymentData(queryClient: QueryClient): void {
  void pingBackendHealth();

  const tasks = [
    queryClient.prefetchQuery({
      queryKey: ["teams-2026", "M"],
      queryFn: () => fetchTeams2026("M"),
      staleTime: 60 * 60_000,
      retry: 0,
    }),
    queryClient.prefetchQuery({
      queryKey: ["teams-field-2026", "W", "bracket-page"],
      queryFn: () => fetchTeams2026("W"),
      staleTime: 60 * 60_000,
      retry: 0,
    }),
    queryClient.prefetchQuery({
      queryKey: ["first-round", "M"],
      queryFn: () => fetchFirstRoundMatchupsTyped("M"),
      staleTime: 5 * 60_000,
      retry: 0,
    }),
    queryClient.prefetchQuery({
      queryKey: ["first-round", "W"],
      queryFn: () => fetchFirstRoundMatchupsTyped("W"),
      staleTime: 5 * 60_000,
      retry: 0,
    }),
    queryClient.prefetchQuery({
      queryKey: ["results", 2026, "M"],
      queryFn: () => fetchTournamentResults(2026, "M"),
      staleTime: 60_000,
      retry: 0,
    }),
    queryClient.prefetchQuery({
      queryKey: ["results", 2026, "W"],
      queryFn: () => fetchTournamentResults(2026, "W"),
      staleTime: 60_000,
      retry: 0,
    }),
    queryClient.prefetchQuery({
      queryKey: ["model-performance"],
      queryFn: fetchModelPerformance,
      staleTime: 300_000,
      retry: 0,
    }),
    queryClient.prefetchQuery({
      queryKey: ["model-ordinal-systems"],
      queryFn: fetchOrdinalSystems,
      staleTime: 300_000,
      retry: 0,
    }),
  ];

  void Promise.allSettled(tasks);
}
