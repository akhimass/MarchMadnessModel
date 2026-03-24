import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@ui/breadcrumb";

export type Crumb = { label: string; href?: string };

interface InnerPageShellProps {
  /** Page title (shown under global nav) */
  contextLabel: string;
  contextDescription?: string;
  endSlot?: ReactNode;
  /** Breadcrumbs after “Bracket” */
  crumbs: Crumb[];
  children: ReactNode;
  className?: string;
}

/**
 * Page chrome: optional title row + breadcrumbs + main.
 * Use under {@link AppLayout} — does not duplicate the top brand bar (MainNav handles global nav).
 */
export function InnerPageShell({
  contextLabel,
  contextDescription,
  endSlot,
  crumbs,
  children,
  className = "min-h-screen bg-muted/40 pb-16",
}: InnerPageShellProps) {
  return (
    <div className={className}>
      <div className="border-b border-border bg-[hsl(var(--bg-surface))]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{contextLabel}</p>
            {contextDescription ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{contextDescription}</p>
            ) : null}
          </div>
          {endSlot ? <div className="flex shrink-0 flex-wrap items-center gap-2">{endSlot}</div> : null}
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
              {crumbs.map((c) => (
                <span key={c.label} className="contents">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {c.href ? (
                      <BreadcrumbLink asChild>
                        <Link to={c.href}>{c.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{c.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      {children}
    </div>
  );
}
