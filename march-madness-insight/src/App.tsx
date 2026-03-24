import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { prefetchDeploymentData } from "@/lib/apiWarmup";
import LandingPage from "./pages/LandingPage";
import BracketPage from "./pages/BracketPage";
import LiveBracketPage from "./pages/LiveBracketPage";
import BettingAssistantPage from "./pages/BettingAssistantPage";
import PredictorPage from "./pages/PredictorPage";
import AnalyzerPage from "./pages/AnalyzerPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import ModelAccuracyPage from "./pages/ModelAccuracyPage";
import ScoreboardPage from "./pages/ScoreboardPage";
import NotFound from "./pages/NotFound";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, err) => {
        const s = String((err as Error)?.message ?? "");
        if (/\b(503|502|504)\b/.test(s)) return failureCount < 12;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 20_000),
    },
  },
});

function DeploymentWarmup() {
  const qc = useQueryClient();
  useEffect(() => {
    prefetchDeploymentData(qc);
  }, [qc]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DeploymentWarmup />
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<LandingPage />} />
        <Route path="/accuracy" element={<Navigate to="/model" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/bracket" element={<BracketPage />} />
          <Route path="/bracket/live" element={<LiveBracketPage />} />
          <Route path="/betting" element={<BettingAssistantPage />} />
          <Route path="/scoreboard" element={<ScoreboardPage />} />
          <Route path="/live" element={<Navigate to="/scoreboard" replace />} />
          <Route path="/model" element={<ModelAccuracyPage />} />
          <Route path="/analyzer" element={<AnalyzerPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/predictor/:team1Id/:team2Id" element={<PredictorPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
