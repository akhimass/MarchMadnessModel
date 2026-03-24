import { Outlet } from "react-router-dom";
import { MainNav } from "@/components/layout/MainNav";

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <MainNav />
      <Outlet />
    </div>
  );
}
