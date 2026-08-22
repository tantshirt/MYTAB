"use client";

import { useState } from "react";
import type { ActivityEventType } from "@/lib/domain/activityTypes";
import { activityIconGlyph, activityIconTint } from "@/lib/domain/activityTypes";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";

export type ActivityRowData = {
  id: string;
  type: ActivityEventType;
  summary: string;
  amountLabel?: string;
  createdAt: number;
  detail?: string;
  transactionSignature?: string;
  explorerUrl?: string;
};

function formatRelativeTime(timestamp: number): string {
  const deltaMs = Date.now() - timestamp;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

export type ActivityRowProps = {
  event: ActivityRowData;
};

/** Expandable activity row (Story 7.3 AC3, AC4). */
export function ActivityRow({ event }: ActivityRowProps) {
  const [expanded, setExpanded] = useState(false);
  const tint = activityIconTint(event.type);
  const glyph = activityIconGlyph(event.type);

  return (
    <article
      style={{
        borderBottom: `1px solid ${MYTAB_COLORS.border}`,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        style={{
          display: "grid",
          gridTemplateColumns: "32px minmax(0, 1fr) auto",
          gap: "12px",
          alignItems: "center",
          width: "100%",
          padding: "12px 0",
          minHeight: "44px",
          border: "none",
          background: "transparent",
          textAlign: "left",
          cursor: "pointer",
          color: MYTAB_COLORS.ink,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: MYTAB_RADIUS.full,
            background: `${tint}18`,
            color: tint,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
          }}
        >
          {glyph}
        </span>
        <span className="mytab-type-body mytab-row__label">{event.summary}</span>
        <span
          className="mytab-type-amount-row mytab-tabular mytab-row__amount"
          data-mytab-amount
          style={{ color: MYTAB_COLORS.inkMuted }}
        >
          {event.amountLabel ?? formatRelativeTime(event.createdAt)}
        </span>
      </button>

      {expanded ? (
        <div
          style={{
            padding: "0 0 12px 44px",
          }}
        >
          {event.detail ? (
            <p className="mytab-type-meta" style={{ margin: "0 0 8px" }}>
              {event.detail}
            </p>
          ) : null}
          <p className="mytab-type-meta" style={{ margin: 0 }}>
            {formatRelativeTime(event.createdAt)}
          </p>
          {event.explorerUrl && event.transactionSignature ? (
            <a
              href={event.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mytab-type-label"
              style={{ color: MYTAB_COLORS.primary, display: "inline-block", marginTop: "8px" }}
            >
              View on explorer
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export type ActivityFeedProps = {
  events: ActivityRowData[];
  loading?: boolean;
};

/** Reverse-chronological activity feed (Story 7.3). */
export function ActivityFeed({ events, loading = false }: ActivityFeedProps) {
  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading activity">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 56,
              marginBottom: 8,
              background: MYTAB_COLORS.sunk,
              borderRadius: MYTAB_RADIUS.sm,
            }}
          />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="mytab-type-body" style={{ color: MYTAB_COLORS.inkMuted }}>
        Nothing yet. Claims, tips and payments show up here.
      </p>
    );
  }

  const sorted = [...events].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div role="feed" aria-label="Recent activity">
      {sorted.map((event) => (
        <ActivityRow key={event.id} event={event} />
      ))}
    </div>
  );
}
