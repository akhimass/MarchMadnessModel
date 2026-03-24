import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">Error</p>
      <h1 className="mt-2 font-display text-6xl font-bold text-foreground">404</h1>
      <p className="mt-4 max-w-md text-muted-foreground">That page doesn&apos;t exist. Pick a tab above or go to the bracket.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Button asChild className="font-display font-bold uppercase tracking-wider">
          <Link to="/bracket">Bracket</Link>
        </Button>
        <Button asChild variant="outline" className="font-display font-bold uppercase tracking-wider">
          <Link to="/home">Landing</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
