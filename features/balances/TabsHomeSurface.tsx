"use client";

import Link from "next/link";
import { PlusIcon, TipIcon } from "@/components/icons";
import { AmountPair } from "@/components/primitives/amount-pair";
import { EmptyState } from "@/components/primitives/empty-state";
import { ErrorState } from "@/components/primitives/error-state";
import { SurfaceErrorBoundary } from "@/components/primitives/error-boundary";
import { showSkeleton, type LoadState } from "@/components/primitives/load-state";
import { STATE_COPY } from "@/components/primitives/state-copy";
import { BalanceHero } from "./BalanceHero";
import { TabCard } from "./TabCard";
import { ActivityFeed } from "./ActivityFeed";
import { AllSquareWatcher } from "./AllSquareWatcher";
import { BalanceLinkRow } from "./PaymentStateBadge";
import { TabsHomeSkeleton, OfflineBar, OutsideTelegramBar } from "./LoadingStates";
import { StartTabAction } from "./StartTabAction";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_ELEVATION } from "@/lib/theme/tokens";
import { formatFiatMinorThb } from "@/lib/domain/format";
import { formatThbMinorForA11y } from "@/lib/domain/a11yAmount";
import type { BalanceHeroState } from "@/lib/domain/balance";
import type { FiatMinor } from "@/lib/domain/money";
import type { ActivityRowData } from "./ActivityFeed";
import type { TabCardProps } from "./TabCard";
import { DEBT_COMPRESSION_DISCLAIMER } from "@/lib/domain/debtCompression";
import type { CompressedTransfer } from "@/lib/domain/debtCompression";

export const TABS_HOME_COPY = {
  /** §4.2 — no groups and no tabs. */
  emptyNoGroups: "No tabs yet. Start one from any Telegram group.",
  /** §4.2 — groups exist, none has an open tab. */
  emptyNoOpenTabs: "No open tabs in your groups.",
  /** §4.3 — query error. */
  error: "Couldn't load your tabs.",
  retry: STATE_COPY.retry,
  startTab: "Start a tab",
  sendTip: "Send a tip",
  openBot: "Open bot",
} as const;

export type TabsHomeSurfaceProps = LoadState & {
  balanceHero: BalanceHeroState;
  openTabs: TabCardProps[];
  groups: Array<{ id: string; name: string; memberCount: number }>;
  recentActivity: ActivityRowData[];
  balanceComponents?: Array<{
    label: string;
    amountMinor: FiatMinor;
    tabId: string;
    billId: string;
  }>;
  compressedTransfers?: CompressedTransfer[];
  memberNames?: Record<string, string>;
  /** The read failed. Renders §4.3 copy with a retry, in the flow. */
  error?: boolean;
  onRetry?: () => void;
  offline?: boolean;
  /**
   * Posts the completion card to the group when the all-square moment fires.
   * Absent → the moment offers only `Done` rather than a dead `Share to group`.
   */
  onShareAllSquare?: () => void;
  inTelegram?: boolean;
};

const ACTION_BASE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  minHeight: "48px",
  borderRadius: MYTAB_RADIUS.sm,
  fontWeight: 600,
  fontSize: "15px",
} as const;

/**
 * The two quick actions, and the two reasons they can be unavailable.
 *
 * `blockedReason` is never allowed to be silent: §4.5 requires every disabled
 * control to repeat the sentence on its own sub-line.
 */
function PrimaryActions({
  groups,
  blockedReason,
}: {
  groups: Array<{ id: string; name: string; memberCount: number }>;
  blockedReason?: string;
}) {
  /*
   * No verified group is a different state from "outside Telegram" and must not
   * be conflated with it (§4.5). There is nowhere to start a tab, so we never
   * offer an action that cannot be completed.
   */
  if (groups.length === 0) {
    return (
      <div style={{ marginTop: "24px" }}>
        <p className="mytab-type-body" style={{ margin: 0, color: MYTAB_COLORS.inkMuted }}>
          {STATE_COPY.noGroupContext}
        </p>
        <a
          href="https://t.me/mytab_fixture_bot"
          style={{
            ...ACTION_BASE,
            display: "inline-flex",
            marginTop: "12px",
            padding: "0 20px",
            background: MYTAB_COLORS.primary,
            color: "#fff",
            textDecoration: "none",
            boxShadow: MYTAB_ELEVATION.buttonInset,
          }}
        >
          {TABS_HOME_COPY.openBot}
        </a>
      </div>
    );
  }

  const disabled = blockedReason !== undefined;

  return (
    <div style={{ marginTop: "28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        {disabled ? (
          <span
            aria-disabled="true"
            style={{
              ...ACTION_BASE,
              background: MYTAB_COLORS.primary,
              color: "#fff",
              border: "none",
              opacity: 0.5,
            }}
          >
            <PlusIcon size={18} aria-hidden="true" />
            {TABS_HOME_COPY.startTab}
          </span>
        ) : (
          <StartTabAction
            groups={groups}
            style={{
              ...ACTION_BASE,
              background: MYTAB_COLORS.primary,
              color: "#fff",
              border: "none",
              boxShadow: MYTAB_ELEVATION.buttonInset,
              cursor: "pointer",
            }}
          >
            <PlusIcon size={18} aria-hidden="true" />
            {TABS_HOME_COPY.startTab}
          </StartTabAction>
        )}

        {disabled ? (
          <span
            aria-disabled="true"
            style={{
              ...ACTION_BASE,
              background: MYTAB_COLORS.surface,
              color: MYTAB_COLORS.ink,
              border: `1px solid ${MYTAB_COLORS.border}`,
              opacity: 0.5,
            }}
          >
            <TipIcon size={18} aria-hidden="true" style={{ color: MYTAB_COLORS.tip }} />
            {TABS_HOME_COPY.sendTip}
          </span>
        ) : (
          <Link
            href="/tips/new"
            style={{
              ...ACTION_BASE,
              background: MYTAB_COLORS.surface,
              color: MYTAB_COLORS.ink,
              textDecoration: "none",
              border: `1px solid ${MYTAB_COLORS.border}`,
            }}
          >
            <TipIcon size={18} aria-hidden="true" style={{ color: MYTAB_COLORS.tip }} />
            {TABS_HOME_COPY.sendTip}
          </Link>
        )}
      </div>

      {disabled ? (
        <p
          className="mytab-type-meta"
          style={{ margin: "8px 0 0", textAlign: "center" }}
        >
          {blockedReason}
        </p>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mytab-type-micro-label" style={{ margin: "0 0 10px" }}>
      {children}
    </h2>
  );
}

/** Tabs home — hero → actions → tabs → groups → transfers → activity (Story 7.2, §1.2). */
export function TabsHomeSurface({
  balanceHero,
  openTabs,
  groups,
  recentActivity,
  balanceComponents = [],
  compressedTransfers = [],
  memberNames = {},
  loading = false,
  hasCachedData = false,
  error = false,
  onRetry,
  offline = false,
  onShareAllSquare,
  inTelegram = true,
}: TabsHomeSurfaceProps) {
  /*
   * The all-square moment is no longer a `showAllSquare` prop nobody ever
   * passed. `AllSquareWatcher` subscribes each open tab to
   * `balances.billCompletion` and fires on the live completion EDGE — never on
   * mount over an already-complete bill, and never on the group net position,
   * which is a different fact (EXPERIENCE, *Money Legibility*).
   */
  const allSquareCast = Object.entries(memberNames).map(([userId, displayName]) => ({
    userId,
    displayName,
  }));

  // A skeleton only on a first paint with nothing cached — never on a tab
  // switch, never over data we already have (§2.9).
  if (showSkeleton({ loading, hasCachedData })) {
    return <TabsHomeSkeleton />;
  }

  const blockedReason = !inTelegram
    ? STATE_COPY.outsideTelegram
    : offline
      ? STATE_COPY.needsConnection
      : undefined;

  const noGroups = groups.length === 0;

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "24px" }}>
      <OfflineBar visible={offline} />
      <OutsideTelegramBar visible={!inTelegram} />

      {error ? (
        <div style={{ marginTop: "16px" }}>
          <ErrorState
            headline={TABS_HOME_COPY.error}
            actions={[{ label: TABS_HOME_COPY.retry, onPress: onRetry }]}
          />
        </div>
      ) : null}

      <SurfaceErrorBoundary headline={TABS_HOME_COPY.error} retryLabel={TABS_HOME_COPY.retry}>
        <AllSquareWatcher
          tabs={openTabs.map((tab) => ({
            tabId: tab.tabId,
            name: tab.name,
            totalLabel: tab.totalLabel,
          }))}
          members={allSquareCast}
          onShare={onShareAllSquare}
        />

        <BalanceHero state={balanceHero} />
        <PrimaryActions groups={groups} blockedReason={blockedReason} />

        <section style={{ marginTop: "32px" }}>
          <SectionLabel>Open tabs</SectionLabel>
          {noGroups ? (
            <EmptyState headline={TABS_HOME_COPY.emptyNoGroups} />
          ) : openTabs.length === 0 ? (
            <p className="mytab-type-meta" style={{ margin: 0 }}>
              {TABS_HOME_COPY.emptyNoOpenTabs}
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "12px" }}>
              {openTabs.map((tab) => (
                <li key={tab.tabId}>
                  <TabCard {...tab} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {balanceComponents.length > 0 ? (
          <section style={{ marginTop: "32px" }}>
            <SectionLabel>Your balances</SectionLabel>
            {balanceComponents.map((component) => (
              <BalanceLinkRow
                key={`${component.tabId}-${component.billId}`}
                label={component.label}
                amount={formatFiatMinorThb(component.amountMinor)}
                amountA11yLabel={formatThbMinorForA11y(component.amountMinor)}
                tabId={component.tabId}
                billId={component.billId}
              />
            ))}
          </section>
        ) : null}

        <section style={{ marginTop: "32px" }}>
          <SectionLabel>Groups</SectionLabel>
          {noGroups ? (
            <p className="mytab-type-meta" style={{ margin: 0 }}>
              No groups yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "8px" }}>
              {groups.map((group) => (
                <li key={group.id}>
                  <Link
                    href={`/groups/${group.id}`}
                    className="mytab-type-body mytab-row"
                    style={{
                      padding: "12px 0",
                      minHeight: "44px",
                      alignItems: "center",
                      textDecoration: "none",
                      color: MYTAB_COLORS.ink,
                      borderBottom: `1px solid ${MYTAB_COLORS.border}`,
                    }}
                  >
                    {/* `mytab-row__label` carries `min-width: 0`: a long group
                        name ellipses instead of pushing the member count out
                        past AppShell's `overflow-x: hidden` (§2.3). */}
                    <span className="mytab-row__label">{group.name}</span>
                    <span className="mytab-type-meta mytab-row__amount">
                      {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Not in the artboard, but real product value — kept, and moved below
            Groups so the amounts land in the reserved column (§1.2). */}
        {compressedTransfers.length > 0 ? (
          <section style={{ marginTop: "32px" }}>
            <SectionLabel>Suggested transfers</SectionLabel>
            <p className="mytab-type-meta" style={{ margin: "0 0 12px" }}>
              {DEBT_COMPRESSION_DISCLAIMER}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "8px" }}>
              {compressedTransfers.map((transfer, index) => (
                <li key={index}>
                  <AmountPair
                    label={`${memberNames[transfer.fromUserId] ?? transfer.fromUserId} → ${
                      memberNames[transfer.toUserId] ?? transfer.toUserId
                    }`}
                    amount={formatFiatMinorThb(transfer.amountMinor)}
                    amountA11yLabel={formatThbMinorForA11y(transfer.amountMinor)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* §4.2: with no recent activity the section is omitted entirely. */}
        {recentActivity.length > 0 ? (
          <section style={{ marginTop: "32px" }}>
            <SectionLabel>Recent</SectionLabel>
            <ActivityFeed events={recentActivity.slice(0, 5)} grouped={false} />
          </section>
        ) : null}
      </SurfaceErrorBoundary>
    </div>
  );
}
