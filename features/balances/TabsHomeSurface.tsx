"use client";

import Link from "next/link";
import { PlusIcon, TipIcon } from "@/components/icons";
import { AmountPair } from "@/components/primitives/amount-pair";
import { EmptyState } from "@/components/primitives/empty-state";
import { ErrorState } from "@/components/primitives/error-state";
import { SurfaceErrorBoundary } from "@/components/primitives/error-boundary";
import { ListCard } from "@/components/primitives/list-card";
import { showSkeleton, type LoadState } from "@/components/primitives/load-state";
import { STATE_COPY } from "@/components/primitives/state-copy";
import { BalanceHero } from "./BalanceHero";
import { TabCard } from "./TabCard";
import { ActivityFeed } from "./ActivityFeed";
import { AllSquareWatcher } from "./AllSquareWatcher";
import { BalanceLinkRow } from "./PaymentStateBadge";
import { TabsHomeSkeleton, OfflineBar, OutsideTelegramBar } from "./LoadingStates";
import { StartTabAction } from "./StartTabAction";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_SPACING } from "@/lib/theme/tokens";
import { monogram } from "./monogram";
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
  /**
   * The viewer's net position. **Absent when no position has been read yet.**
   *
   * `BalanceHeroState` has no "unknown" variant, so a required prop would force
   * every caller to assert `owed`, `settled` or `all_square` — and "All square"
   * over unread debt is the trust defect *Money Legibility* forbids. The card is
   * hidden when this is absent, exactly as `GroupSurface`'s `position` is.
   */
  balanceHero?: BalanceHeroState;
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

/**
 * The Telegram bot this deployment belongs to, from
 * `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`. Inlined at build time by Next; empty on
 * a deployment that has not set it, which is a real state and not an error.
 */
const BOT_HANDLE = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "").trim();

/** Artboard pairs a 48px *pair* with a 52px *single* (POLISH-SPEC §1.2). */
const PAIR_ACTION_STYLE = { minHeight: "48px" } as const;

/**
 * The two quick actions, and the two reasons they can be unavailable.
 *
 * `blockedReason` is never allowed to be silent: §4.5 requires every disabled
 * control to repeat the sentence on its own sub-line.
 *
 * These use the shared button classes so they pick up pressure, disabled
 * paper/ink-muted, and the inset edge — the previous inline skins had none of
 * those, and disabled was a 50% fade over Tab Blue.
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
      <div style={{ marginTop: MYTAB_SPACING["6"] }}>
        <p className="mytab-type-body" style={{ margin: 0, color: MYTAB_COLORS.inkMuted }}>
          {STATE_COPY.noGroupContext}
        </p>
        {/*
          The bot handle is deployment configuration, not a constant. Where it
          is unset there is no bot to open, so the sentence stands on its own
          rather than linking at a handle nobody registered.
        */}
        {BOT_HANDLE ? (
          <a
            href={`https://t.me/${BOT_HANDLE}`}
            className="mytab-button-primary"
            style={{ ...PAIR_ACTION_STYLE, marginTop: MYTAB_SPACING["3"] }}
          >
            {TABS_HOME_COPY.openBot}
          </a>
        ) : null}
      </div>
    );
  }

  const disabled = blockedReason !== undefined;

  return (
    <div style={{ marginTop: "28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        {disabled ? (
          <span className="mytab-button-primary" aria-disabled="true" style={PAIR_ACTION_STYLE}>
            <PlusIcon size={18} aria-hidden="true" />
            {TABS_HOME_COPY.startTab}
          </span>
        ) : (
          <StartTabAction
            groups={groups}
            className="mytab-button-primary"
            style={PAIR_ACTION_STYLE}
          >
            <PlusIcon size={18} aria-hidden="true" />
            {TABS_HOME_COPY.startTab}
          </StartTabAction>
        )}

        {disabled ? (
          <span className="mytab-button-secondary" aria-disabled="true" style={PAIR_ACTION_STYLE}>
            <TipIcon size={18} aria-hidden="true" style={{ color: MYTAB_COLORS.tip }} />
            {TABS_HOME_COPY.sendTip}
          </span>
        ) : (
          <Link href="/tips/new" className="mytab-button-secondary" style={PAIR_ACTION_STYLE}>
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

function GroupRow({
  group,
}: {
  group: { id: string; name: string; memberCount: number };
}) {
  return (
    <Link
      href={`/groups/${group.id}`}
      className="mytab-row"
      style={{
        padding: "12px 16px",
        minHeight: "56px",
        alignItems: "center",
        gridTemplateColumns: "40px minmax(0, 1fr) auto",
        textDecoration: "none",
        color: MYTAB_COLORS.ink,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          borderRadius: MYTAB_RADIUS.full,
          background: MYTAB_COLORS.primarySoft,
          color: MYTAB_COLORS.primary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "15px",
          fontWeight: 600,
        }}
      >
        {monogram(group.name)}
      </span>
      <span className="mytab-row__label mytab-name" style={{ fontWeight: 600 }}>
        {group.name}
      </span>
      <span className="mytab-type-meta mytab-row__amount">
        {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
      </span>
    </Link>
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
    <div style={{ paddingBottom: MYTAB_SPACING["7"] }}>
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
        <div style={{ paddingTop: MYTAB_SPACING["6"] }}>
        <AllSquareWatcher
          tabs={openTabs.map((tab) => ({
            tabId: tab.tabId,
            name: tab.name,
            totalLabel: tab.totalLabel,
          }))}
          members={allSquareCast}
          onShare={onShareAllSquare}
        />

        {balanceHero ? <BalanceHero state={balanceHero} /> : null}
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
          <div style={{ marginTop: "32px" }}>
            <ListCard label="Your balances">
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
            </ListCard>
          </div>
        ) : null}

        <section style={{ marginTop: "32px" }}>
          {noGroups ? (
            <>
              <SectionLabel>Groups</SectionLabel>
              <p className="mytab-type-meta" style={{ margin: 0 }}>
                No groups yet.
              </p>
            </>
          ) : (
            <ListCard label="Groups">
              {groups.map((group) => (
                <GroupRow key={group.id} group={group} />
              ))}
            </ListCard>
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
            <ListCard>
              {compressedTransfers.map((transfer, index) => (
                <div
                  key={index}
                  style={{ padding: "16px", minHeight: 56, display: "flex", alignItems: "center" }}
                >
                  <div style={{ width: "100%", minWidth: 0 }}>
                    <AmountPair
                      label={`${memberNames[transfer.fromUserId] ?? transfer.fromUserId} → ${
                        memberNames[transfer.toUserId] ?? transfer.toUserId
                      }`}
                      amount={formatFiatMinorThb(transfer.amountMinor)}
                      amountA11yLabel={formatThbMinorForA11y(transfer.amountMinor)}
                    />
                  </div>
                </div>
              ))}
            </ListCard>
          </section>
        ) : null}

        {/* §4.2: with no recent activity the section is omitted entirely. */}
        {recentActivity.length > 0 ? (
          <section style={{ marginTop: "32px" }}>
            <SectionLabel>Recent</SectionLabel>
            <ActivityFeed events={recentActivity.slice(0, 5)} grouped={false} />
          </section>
        ) : null}
        </div>
      </SurfaceErrorBoundary>
    </div>
  );
}
