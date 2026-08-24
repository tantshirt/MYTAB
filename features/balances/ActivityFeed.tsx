"use client";

import { useState } from "react";
import { ACTIVITY_ICON } from "@/components/icons";
import { AmountPair } from "@/components/primitives/amount-pair";
import { EmptyState } from "@/components/primitives/empty-state";
import { ErrorState } from "@/components/primitives/error-state";
import { SurfaceErrorBoundary } from "@/components/primitives/error-boundary";
import { showSkeleton, type LoadState } from "@/components/primitives/load-state";
import { ACTIVITY_EVENT_TYPE, type ActivityEventType } from "@/lib/domain/activityTypes";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import { SURFACE_CARD_STYLE } from "@/components/primitives/list-card";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import { ActivitySkeleton, OfflineBar } from "./LoadingStates";

export const ACTIVITY_COPY = {
  empty: "Nothing yet. Claims and payments show up here.",
  error: "Couldn't load your activity.",
  retry: "Try again",
  from: "From",
  received: "Received",
  networkFee: "Network fee",
  networkFeeCovered: "Covered by My Tab",
  explorer: "View on explorer",
} as const;

export type ActivityRowData = {
  id: string;
  type: ActivityEventType;
  summary: string;
  /** Rendered figure. Quiet events (a lock, a claim) have none. */
  amountLabel?: string;
  /** Spoken form. Derived from `amountLabel` when omitted. */
  amountA11yLabel?: string;
  createdAt: number;
  /** The tab this happened on, when it happened on one. */
  tabId?: string;
  detail?: string;
  /** The three disclosed lines of a settlement (§1.12). */
  breakdown?: {
    from?: string;
    received?: string;
    /** Defaults to "Covered by My Tab", in `colors/settled`. */
    networkFeeLabel?: string;
  };
  transactionSignature?: string;
  explorerUrl?: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const deltaMs = now - timestamp;
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

/** Local calendar-day key, so a day group never straddles midnight. */
function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * How long an event stays worth a day of its own.
 *
 * Inside a week, "Tuesday's payments" is a thing a person remembers, so the
 * day is the useful bucket. Past that nobody is looking for a day — they are
 * looking for a tab, and a screen of fourteen one-row day headers is a worse
 * index than four month headers. So the grouping widens rather than staying
 * uniformly wrong at one end.
 */
const DAY_BUCKET_WINDOW_MS = 7 * 86_400_000;

/**
 * The bucket an event belongs to: a day near the top of the feed, a month once
 * it is history.
 *
 * Returned as `{ key, label }` together so the grouping and the heading can
 * never disagree about where a boundary is.
 *
 * `toLocaleDateString` is deliberately not used — with no locale argument it
 * resolves differently on the server and in the webview, which is a hydration
 * mismatch (POLISH-SPEC §1.3).
 */
export function activityBucket(
  timestamp: number,
  now: number,
): { key: string; label: string } {
  if (dayKey(timestamp) === dayKey(now)) {
    return { key: `d:${dayKey(timestamp)}`, label: "Today" };
  }
  if (dayKey(timestamp) === dayKey(now - 86_400_000)) {
    return { key: `d:${dayKey(timestamp)}`, label: "Yesterday" };
  }

  const date = new Date(timestamp);

  if (now - timestamp < DAY_BUCKET_WINDOW_MS) {
    return {
      key: `d:${dayKey(timestamp)}`,
      label: `${date.getDate()} ${MONTHS[date.getMonth()]}`,
    };
  }

  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const name = MONTH_NAMES[date.getMonth()]!;

  return {
    key: `m:${date.getFullYear()}-${date.getMonth()}`,
    label: sameYear ? name : `${name} ${date.getFullYear()}`,
  };
}

type ActivityTone = "settle" | "quiet";

/** §1.12 — three tones, and the amount colour follows the icon tint. */
function toneForType(type: ActivityEventType): ActivityTone {
  switch (type) {
    case ACTIVITY_EVENT_TYPE.PAYMENT:
    case ACTIVITY_EVENT_TYPE.CASH_ACKNOWLEDGED:
      return "settle";
    default:
      return "quiet";
  }
}

const TONES: Record<ActivityTone, { background: string; foreground: string; amount: string }> = {
  settle: {
    background: MYTAB_COLORS.settledSoft,
    foreground: MYTAB_COLORS.settled,
    amount: MYTAB_COLORS.settled,
  },
  quiet: {
    background: MYTAB_COLORS.sunk,
    foreground: MYTAB_COLORS.inkMuted,
    amount: MYTAB_COLORS.inkMuted,
  },
};

export type ActivityRowProps = {
  event: ActivityRowData;
  now?: number;
  /** Hairline beneath — omitted on the last row of a card. */
  divided?: boolean;
};

/** Expandable activity row (Story 7.3 AC3, AC4; POLISH-SPEC §1.12). */
export function ActivityRow({ event, now = Date.now(), divided = true }: ActivityRowProps) {
  const [expanded, setExpanded] = useState(false);
  const tone = TONES[toneForType(event.type)];
  const Glyph = ACTIVITY_ICON[event.type];
  const timestamp = formatRelativeTime(event.createdAt, now);
  const breakdown = event.breakdown;

  return (
    <article style={{ borderBottom: divided ? `1px solid ${MYTAB_COLORS.border}` : undefined }}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        style={{
          display: "grid",
          // `minmax(0, 1fr)` on the summary track: a long sentence ellipses and
          // never squeezes the amount column (POLISH-SPEC §2.3).
          gridTemplateColumns: "32px minmax(0, 1fr) auto",
          gap: "12px",
          alignItems: "center",
          width: "100%",
          padding: "12px 0",
          minHeight: "56px",
          border: "none",
          background: "transparent",
          textAlign: "left",
          cursor: "pointer",
          color: MYTAB_COLORS.ink,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: MYTAB_RADIUS.full,
            background: tone.background,
            color: tone.foreground,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Glyph size={16} />
        </span>

        <span
          className="mytab-row__label"
          style={{ fontSize: "14px", lineHeight: 1.4, display: "block" }}
        >
          {event.summary}
        </span>

        {/*
         * The amount and the timestamp are two elements stacked, not
         * alternatives: the old row put the relative time inside the tabular
         * amount column whenever there was no figure (POLISH-SPEC §1.12).
         */}
        <span style={{ flex: "none", textAlign: "right", whiteSpace: "nowrap" }}>
          {event.amountLabel ? (
            <span
              className="mytab-tabular"
              data-mytab-amount
              aria-label={event.amountA11yLabel ?? formatAmountLabelForA11y(event.amountLabel)}
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: tone.amount,
              }}
            >
              {event.amountLabel}
            </span>
          ) : null}
          <span
            suppressHydrationWarning
            style={{
              display: "block",
              marginTop: event.amountLabel ? "2px" : 0,
              fontSize: "12px",
              fontWeight: 400,
              color: MYTAB_COLORS.inkMuted,
            }}
          >
            {timestamp}
          </span>
        </span>
      </button>

      {expanded ? (
        <div style={{ padding: "2px 16px 16px 60px" }}>
          {breakdown?.from ? (
            <AmountPair size="meta" label={ACTIVITY_COPY.from} amount={breakdown.from} />
          ) : null}
          {breakdown?.received ? (
            <AmountPair size="meta" label={ACTIVITY_COPY.received} amount={breakdown.received} />
          ) : null}
          {breakdown ? (
            <div
              className="mytab-row"
              style={{ fontSize: "13px", color: MYTAB_COLORS.inkMuted }}
            >
              <span className="mytab-row__label">{ACTIVITY_COPY.networkFee}</span>
              <span
                /*
                 * "Covered by My Tab" is a sentence, not a figure, so it takes
                 * the prose modifier and is allowed to wrap. A real
                 * `networkFeeLabel` IS a figure and keeps the nowrap column.
                 */
                className={
                  breakdown.networkFeeLabel
                    ? "mytab-row__amount mytab-tabular"
                    : "mytab-row__amount mytab-row__amount--text"
                }
                style={{ color: MYTAB_COLORS.settled }}
              >
                {breakdown.networkFeeLabel ?? ACTIVITY_COPY.networkFeeCovered}
              </span>
            </div>
          ) : null}
          {event.detail ? (
            <p className="mytab-type-meta" style={{ margin: breakdown ? "8px 0 0" : 0 }}>
              {event.detail}
            </p>
          ) : null}
          {event.explorerUrl && event.transactionSignature ? (
            <a
              href={event.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "44px",
                fontSize: "13px",
                fontWeight: 500,
                color: MYTAB_COLORS.primary,
                textDecoration: "none",
              }}
            >
              {ACTIVITY_COPY.explorer}
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function RowCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        ...SURFACE_CARD_STYLE,
        padding: "0 16px",
      }}
    >
      {children}
    </div>
  );
}

export type ActivityFeedProps = LoadState & {
  events: ActivityRowData[];
  /** The read failed. Renders §4.3 copy with a retry. */
  error?: boolean;
  onRetry?: () => void;
  offline?: boolean;
  /**
   * Day-grouped micro-labels. Off inside the Tabs "RECENT" block, which is
   * already a labelled section showing only the newest few (§1.2).
   */
  grouped?: boolean;
};

/** Reverse-chronological activity feed (Story 7.3; POLISH-SPEC §1.12). */
export function ActivityFeed({
  events,
  loading = false,
  hasCachedData = false,
  error = false,
  onRetry,
  offline = false,
  grouped = true,
}: ActivityFeedProps) {
  const now = Date.now();

  if (showSkeleton({ loading, hasCachedData })) {
    return <ActivitySkeleton />;
  }

  if (error) {
    return (
      <ErrorState
        headline={ACTIVITY_COPY.error}
        actions={[{ label: ACTIVITY_COPY.retry, onPress: onRetry }]}
      />
    );
  }

  if (events.length === 0) {
    return (
      <>
        <OfflineBar visible={offline} />
        <EmptyState headline={ACTIVITY_COPY.empty} />
      </>
    );
  }

  const sorted = [...events].sort((a, b) => b.createdAt - a.createdAt);

  const body = grouped ? (
    groupByBucket(sorted, now).map((group) => (
      <section key={group.key} style={{ marginBottom: "22px" }}>
        <h2 className="mytab-type-micro-label" suppressHydrationWarning style={{ margin: "0 0 10px" }}>
          {group.label}
        </h2>
        <RowCard>
          {group.events.map((event, index) => (
            <ActivityRow
              key={event.id}
              event={event}
              now={now}
              divided={index < group.events.length - 1}
            />
          ))}
        </RowCard>
      </section>
    ))
  ) : (
    <RowCard>
      {sorted.map((event, index) => (
        <ActivityRow
          key={event.id}
          event={event}
          now={now}
          divided={index < sorted.length - 1}
        />
      ))}
    </RowCard>
  );

  return (
    <SurfaceErrorBoundary headline={ACTIVITY_COPY.error} retryLabel={ACTIVITY_COPY.retry}>
      <OfflineBar visible={offline} />
      <div role="feed" aria-label="Recent activity">
        {body}
      </div>
    </SurfaceErrorBoundary>
  );
}

function groupByBucket(
  sorted: ActivityRowData[],
  now: number,
): Array<{ key: string; label: string; events: ActivityRowData[] }> {
  const groups: Array<{ key: string; label: string; events: ActivityRowData[] }> = [];
  for (const event of sorted) {
    const { key, label } = activityBucket(event.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.events.push(event);
    } else {
      groups.push({ key, label, events: [event] });
    }
  }
  return groups;
}
