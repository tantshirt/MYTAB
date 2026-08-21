"use client";

import Link from "next/link";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";

export type TabCardProps = {
  tabId: string;
  name: string;
  status: string;
  settledCount: number;
  totalCount: number;
  submittedCount?: number;
  href: string;
};

/** Open tab card — whole surface is one tap target (Story 7.2 AC3). */
export function TabCard({
  name,
  status,
  settledCount,
  totalCount,
  submittedCount = 0,
  href,
}: TabCardProps) {
  const progress = totalCount > 0 ? settledCount / totalCount : 0;

  return (
    <Link
      href={href}
      className="mytab-card"
      aria-label={`${name}, ${settledCount} of ${totalCount} settled`}
      style={{
        display: "block",
        padding: "20px",
        textDecoration: "none",
        color: "inherit",
        minHeight: "44px",
      }}
    >
      <p className="mytab-type-label" style={{ margin: 0 }}>
        {name}
      </p>
      <p className="mytab-type-meta" style={{ margin: "4px 0 12px" }}>
        {status}
        {submittedCount > 0 ? ` · ${submittedCount} submitted (not counted)` : null}
      </p>
      <div
        role="progressbar"
        aria-valuenow={settledCount}
        aria-valuemin={0}
        aria-valuemax={totalCount}
        aria-label={`${settledCount} of ${totalCount} obligations confirmed settled`}
        style={{
          height: "4px",
          borderRadius: MYTAB_RADIUS.full,
          background: MYTAB_COLORS.sunk,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(progress * 100)}%`,
            height: "100%",
            background: MYTAB_COLORS.settled,
            transition: "none",
          }}
        />
      </div>
      <p className="mytab-type-meta" style={{ margin: "8px 0 0" }}>
        {settledCount} of {totalCount} settled
      </p>
    </Link>
  );
}
