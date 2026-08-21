"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BalanceHero } from "./BalanceHero";
import { TabCard } from "./TabCard";
import { ActivityFeed } from "./ActivityFeed";
import { AllSquareCard, hasSeenAllSquare, markAllSquareSeen } from "./AllSquareCard";
import { BalanceLinkRow } from "./PaymentStateBadge";
import { TabsHomeSkeleton, OfflineBar } from "./LoadingStates";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import { formatFiatMinorThb } from "@/lib/domain/format";
import type { BalanceHeroState } from "@/lib/domain/balance";
import type { FiatMinor } from "@/lib/domain/money";
import type { ActivityRowData } from "./ActivityFeed";
import type { TabCardProps } from "./TabCard";
import { DEBT_COMPRESSION_DISCLAIMER } from "@/lib/domain/debtCompression";
import type { CompressedTransfer } from "@/lib/domain/debtCompression";

export type TabsHomeSurfaceProps = {
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
  loading?: boolean;
  offline?: boolean;
  showAllSquare?: boolean;
  allSquareBill?: { billId: string; name: string; amountLabel: string };
  allSquareMembers?: Array<{ userId: string; displayName: string }>;
  inTelegram?: boolean;
};

function PrimaryActions({ inTelegram }: { inTelegram: boolean }) {
  if (!inTelegram) {
    return (
      <div style={{ marginTop: "24px" }}>
        <p className="mytab-type-body" style={{ color: MYTAB_COLORS.inkMuted }}>
          Open My Tab from a Telegram group to start a tab.
        </p>
        <a
          href="https://t.me/mytab_fixture_bot"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "12px",
            minHeight: "52px",
            padding: "0 20px",
            borderRadius: MYTAB_RADIUS.sm,
            background: MYTAB_COLORS.primary,
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Open bot
        </a>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px",
        marginTop: "24px",
      }}
    >
      <Link
        href="/groups/picker"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "52px",
          borderRadius: MYTAB_RADIUS.sm,
          background: MYTAB_COLORS.primary,
          color: "#fff",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "15px",
        }}
      >
        Start a tab
      </Link>
      <Link
        href="/tips/new"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "52px",
          borderRadius: MYTAB_RADIUS.sm,
          background: MYTAB_COLORS.surface,
          color: MYTAB_COLORS.ink,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "15px",
          border: `1px solid ${MYTAB_COLORS.border}`,
        }}
      >
        Send a tip
      </Link>
    </div>
  );
}

/** Tabs home — balance hero → actions → tabs → groups → activity (Story 7.2). */
export function TabsHomeSurface({
  balanceHero,
  openTabs,
  groups,
  recentActivity,
  balanceComponents = [],
  compressedTransfers = [],
  memberNames = {},
  loading = false,
  offline = false,
  showAllSquare = false,
  allSquareBill,
  allSquareMembers = [],
  inTelegram = true,
}: TabsHomeSurfaceProps) {
  const [allSquareVisible, setAllSquareVisible] = useState(false);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (showAllSquare && allSquareBill && !hasSeenAllSquare(allSquareBill.billId)) {
      setAllSquareVisible(true);
      markAllSquareSeen(allSquareBill.billId);
    }
  }, [showAllSquare, allSquareBill]);

  if (loading) {
    return <TabsHomeSkeleton />;
  }

  const emptyGroups = groups.length === 0 && openTabs.length === 0;

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "24px" }}>
      <OfflineBar visible={offline} />

      {allSquareVisible && allSquareBill ? (
        <div style={{ marginBottom: "24px" }}>
          <AllSquareCard
            billName={allSquareBill.name}
            amountLabel={allSquareBill.amountLabel}
            members={allSquareMembers}
            reduceMotion={reduceMotion}
            onDismiss={() => setAllSquareVisible(false)}
          />
        </div>
      ) : null}

      <BalanceHero state={balanceHero} />
      <PrimaryActions inTelegram={inTelegram} />

      <section style={{ marginTop: "32px" }}>
        <h2 className="mytab-type-micro-label">Open tabs</h2>
        {emptyGroups ? (
          <div style={{ marginTop: "12px" }}>
            <p className="mytab-type-body" style={{ color: MYTAB_COLORS.inkMuted }}>
              No tabs yet. Start one from any Telegram group.
            </p>
            <Link
              href={inTelegram ? "/groups/picker" : "https://t.me/mytab_fixture_bot"}
              style={{
                display: "inline-flex",
                marginTop: "12px",
                minHeight: "44px",
                alignItems: "center",
                color: MYTAB_COLORS.primary,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Start a tab
            </Link>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: "12px" }}>
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
          <h2 className="mytab-type-micro-label">Your balances</h2>
          <div style={{ marginTop: "8px" }}>
            {balanceComponents.map((component) => (
              <BalanceLinkRow
                key={`${component.tabId}-${component.billId}`}
                label={component.label}
                amount={formatFiatMinorThb(component.amountMinor)}
                tabId={component.tabId}
                billId={component.billId}
              />
            ))}
          </div>
        </section>
      ) : null}

      {compressedTransfers.length > 0 ? (
        <section style={{ marginTop: "32px" }}>
          <h2 className="mytab-type-micro-label">Suggested transfers</h2>
          <p className="mytab-type-meta" style={{ margin: "8px 0 12px" }}>
            {DEBT_COMPRESSION_DISCLAIMER}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {compressedTransfers.map((transfer, index) => (
              <li key={index} className="mytab-type-body" style={{ padding: "8px 0" }}>
                {memberNames[transfer.fromUserId] ?? transfer.fromUserId} →{" "}
                {memberNames[transfer.toUserId] ?? transfer.toUserId}:{" "}
                <span className="mytab-tabular" data-mytab-amount>
                  {formatFiatMinorThb(transfer.amountMinor)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ marginTop: "32px" }}>
        <h2 className="mytab-type-micro-label">Groups</h2>
        {groups.length === 0 ? (
          <p className="mytab-type-body" style={{ marginTop: "12px", color: MYTAB_COLORS.inkMuted }}>
            No groups yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: "8px" }}>
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  className="mytab-type-body"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "12px 0",
                    minHeight: "44px",
                    alignItems: "center",
                    textDecoration: "none",
                    color: MYTAB_COLORS.ink,
                    borderBottom: `1px solid ${MYTAB_COLORS.border}`,
                  }}
                >
                  <span>{group.name}</span>
                  <span className="mytab-type-meta">{group.memberCount} members</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2 className="mytab-type-micro-label">Recent activity</h2>
        <div style={{ marginTop: "12px" }}>
          <ActivityFeed events={recentActivity.slice(0, 5)} />
        </div>
      </section>
    </div>
  );
}
