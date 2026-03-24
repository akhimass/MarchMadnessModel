import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const links = [
  { to: "/bracket", label: "Bracket Picker" },
  { to: "/bracket/live", label: "Live Bracket" },
  { to: "/scoreboard", label: "Scoreboard" },
  { to: "/model", label: "Model Analyzer" },
  { to: "/betting", label: "Betting Assistant" },
  { to: "/leaderboard", label: "Leaderboard" },
] as const;

export function MainNav() {
  const { pathname } = useLocation();

  return (
    <header className="border-b border-black/20 bg-[#1a5276] text-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link
          to="/bracket"
          className="font-display text-lg font-bold uppercase tracking-tight text-white hover:opacity-90"
        >
          March Madness
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto sm:gap-2" aria-label="Main">
          {links.map(({ to, label }) => {
            const active =
              to === "/bracket"
                ? pathname === "/bracket"
                : to === "/bracket/live"
                  ? pathname.startsWith("/bracket/live")
                  : pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "rounded-md px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide transition-colors sm:text-sm",
                  active ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10 hover:text-white",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
