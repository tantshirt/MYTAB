"use client";

import { NoticeBar } from "@/components/primitives/notice-bar";
import {
  SkeletonBar,
  SkeletonCard,
  SkeletonCircle,
  SkeletonLine,
  SkeletonRegion,
} from "@/components/primitives/skeleton";
import { STATE_COPY } from "@/components/primitives/state-copy";
import { SURFACE_CARD_STYLE } from "@/components/primitives/list-card";

export type OfflineBarProps = {
  visible: boolean;
};

/**
 * §4.4 — one offline treatment, everywhere.
 *
 * The bar itself now lives in `components/primitives/notice-bar`; this is the
 * named call site the balances surfaces already used, kept so the string and
 * the geometry are defined once (POLISH-SPEC §4.4 asked for exactly that).
 */
export function OfflineBar({ visible }: OfflineBarProps) {
  if (!visible) {
    return null;
  }

  return (
    <NoticeBar tone="warning" fullBleed>
      {STATE_COPY.offline}
    </NoticeBar>
  );
}

export type OutsideTelegramBarProps = {
  visible: boolean;
};

/**
 * §4.5 — authenticated in a standalone browser: reads work, every mutation is
 * disabled. Same bar geometry as offline, in `colors/ink-muted` on
 * `colors/sunk`.
 */
export function OutsideTelegramBar({ visible }: OutsideTelegramBarProps) {
  if (!visible) {
    return null;
  }

  return (
    <NoticeBar tone="quiet" fullBleed>
      {STATE_COPY.outsideTelegram}
    </NoticeBar>
  );
}

/**
 * A `tab-card` placeholder at the card's real geometry: 96px tall, `spacing/5`
 * padding, a title bar, a `meta` sub-line, the reserved amount column at its
 * tabular width, and the 4px progress track.
 */
function TabCardSkeleton() {
  return (
    <SkeletonCard height={96}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          columnGap: "12px",
          alignItems: "start",
        }}
      >
        <span style={{ display: "block" }}>
          <SkeletonBar width="55%" height="16px" />
          <SkeletonBar width="70%" height="13px" style={{ marginTop: "6px" }} />
        </span>
        <span className="mytab-type-amount-row mytab-tabular" style={{ display: "block" }}>
          <SkeletonBar width="5.5ch" height="1em" />
        </span>
      </div>
      <SkeletonBar height="4px" radius="999px" style={{ marginTop: "16px" }} />
    </SkeletonCard>
  );
}

/** A `micro-label` bar at the real 11px cap height. */
function MicroLabelSkeleton() {
  return <SkeletonBar width="86px" height="11px" style={{ margin: "0 0 10px" }} />;
}

export type TabsHomeSkeletonProps = {
  /** Rows to reserve in the activity block — the last known count, or 3. */
  activityRows?: number;
};

/**
 * Tabs, first paint with no cache (§4.1): hero, a 2-up 48px action pair, a
 * micro-label + two 96px `tab-card`s, a 72px group block, three 56px activity
 * rows. Static `colors/sunk`, no shimmer.
 */
export function TabsHomeSkeleton({ activityRows = 3 }: TabsHomeSkeletonProps) {
  return (
    <SkeletonRegion label="Loading your tabs" style={{ paddingTop: "24px", paddingBottom: "32px" }}>
      {/* Hero: the `meta` label above, the figure alone below — the same two
          elements `BalanceHero` renders, so the figure lands where it paints. */}
      <SkeletonBar width="72px" height="13px" />
      <span
        className="mytab-type-amount-hero mytab-tabular"
        style={{
          display: "block",
          marginTop: "4px",
          fontSize: "clamp(32px, 10.8vw, 42px)",
          lineHeight: 1.1,
        }}
      >
        <SkeletonBar width="7ch" height="1em" />
      </span>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          marginTop: "28px",
        }}
      >
        <SkeletonBar height="48px" radius="10px" />
        <SkeletonBar height="48px" radius="10px" />
      </div>

      <div style={{ marginTop: "32px" }}>
        <MicroLabelSkeleton />
        <div style={{ display: "grid", gap: "12px" }}>
          <TabCardSkeleton />
          <TabCardSkeleton />
        </div>
      </div>

      <div style={{ marginTop: "32px" }}>
        <MicroLabelSkeleton />
        <div
          aria-hidden="true"
          style={{
            ...SURFACE_CARD_STYLE,
            display: "grid",
            gridTemplateColumns: "40px minmax(0, 1fr) auto",
            alignItems: "center",
            columnGap: "12px",
            minHeight: 56,
            padding: "12px 16px",
          }}
        >
          <SkeletonCircle size={40} />
          <span style={{ display: "block", minWidth: 0 }}>
            <SkeletonBar width="60%" height="15px" />
          </span>
          <SkeletonBar width="5.5ch" height="13px" />
        </div>
      </div>

      <div style={{ marginTop: "32px" }}>
        <MicroLabelSkeleton />
        <div style={{ ...SURFACE_CARD_STYLE, padding: "0 16px" }}>
          {Array.from({ length: activityRows }, (_, index) => (
            <SkeletonLine
              key={index}
              height={56}
              avatar={32}
              labelWidth="62%"
              hairline={index < activityRows - 1}
            />
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

export type GroupSkeletonProps = {
  memberCount?: number;
  activityRows?: number;
};

/**
 * Group, first paint with no cache (§4.1): a 96px balance card, five 48px
 * member circles, one 96px `tab-card`, four 56px activity rows.
 */
export function GroupSkeleton({ memberCount = 5, activityRows = 4 }: GroupSkeletonProps) {
  return (
    <SkeletonRegion label="Loading this group" style={{ paddingTop: "8px", paddingBottom: "24px" }}>
      <SkeletonBar width="55%" height="20px" />

      <div style={{ marginTop: "20px" }}>
        <SkeletonCard height={96}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              columnGap: "14px",
              alignItems: "center",
            }}
          >
            <span className="mytab-type-amount-lg mytab-tabular" style={{ display: "block" }}>
              <SkeletonBar width="7ch" height="1em" />
              <SkeletonBar width="90px" height="13px" style={{ marginTop: "5px" }} />
            </span>
            <SkeletonBar width="104px" height="48px" radius="10px" />
          </div>
        </SkeletonCard>
      </div>

      <div style={{ marginTop: "28px" }}>
        <MicroLabelSkeleton />
        <div aria-hidden="true" style={{ display: "flex", gap: "14px" }}>
          {Array.from({ length: memberCount }, (_, index) => (
            <span key={index} style={{ width: "60px", textAlign: "center" }}>
              <SkeletonCircle size={48} />
              <SkeletonBar width="80%" height="12px" style={{ margin: "6px auto 0" }} />
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "28px" }}>
        <MicroLabelSkeleton />
        <TabCardSkeleton />
      </div>

      <div style={{ marginTop: "28px" }}>
        <MicroLabelSkeleton />
        <div style={{ ...SURFACE_CARD_STYLE, padding: "0 16px" }}>
          {Array.from({ length: activityRows }, (_, index) => (
            <SkeletonLine
              key={index}
              height={56}
              avatar={32}
              labelWidth="58%"
              hairline={index < activityRows - 1}
            />
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

export type ActivitySkeletonProps = {
  /** Day groups to reserve. */
  groups?: number;
  rowsPerGroup?: number;
};

/** Activity, first paint with no cache (§4.1): three 56px rows per day group, two groups. */
export function ActivitySkeleton({ groups = 2, rowsPerGroup = 3 }: ActivitySkeletonProps) {
  return (
    <SkeletonRegion label="Loading your activity">
      {Array.from({ length: groups }, (_, groupIndex) => (
        <div key={groupIndex} style={{ marginBottom: "22px" }}>
          <MicroLabelSkeleton />
          <div style={{ ...SURFACE_CARD_STYLE, padding: "0 16px" }}>
            {Array.from({ length: rowsPerGroup }, (_, rowIndex) => (
              <SkeletonLine
                key={rowIndex}
                height={56}
                avatar={32}
                labelWidth="64%"
                hairline={rowIndex < rowsPerGroup - 1}
              />
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}
