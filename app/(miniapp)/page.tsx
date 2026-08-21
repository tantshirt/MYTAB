"use client";

import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import {
  TabsHomeSurface,
  FIXTURE_BALANCE_HERO,
  FIXTURE_OPEN_TABS,
  FIXTURE_ACTIVITY,
  FIXTURE_GROUP,
  FIXTURE_MEMBERS,
  FIXTURE_COMPRESSED_TRANSFERS,
  FIXTURE_GROUP_BALANCE,
  FIXTURE_VIEWER_USER_ID,
} from "@/features/balances";

export default function TabsHomePage() {
  const memberNames = Object.fromEntries(
    FIXTURE_MEMBERS.map((m) => [m.userId, m.displayName]),
  );

  const viewerComponents = FIXTURE_GROUP_BALANCE.components.filter(
    (c) => c.debtorUserId === FIXTURE_VIEWER_USER_ID,
  );

  return (
    <AuthGate>
      <AppShell>
        <TabsHomeSurface
          balanceHero={FIXTURE_BALANCE_HERO}
          openTabs={FIXTURE_OPEN_TABS}
          groups={[
            {
              id: FIXTURE_GROUP.id,
              name: FIXTURE_GROUP.name,
              memberCount: FIXTURE_MEMBERS.length,
            },
          ]}
          recentActivity={FIXTURE_ACTIVITY}
          balanceComponents={viewerComponents.map((c) => ({
            label: `Owe ${memberNames[c.creditorUserId] ?? c.creditorUserId}`,
            amountMinor: c.amountMinor,
            tabId: c.tabId,
            billId: c.billId,
          }))}
          compressedTransfers={FIXTURE_COMPRESSED_TRANSFERS}
          memberNames={memberNames}
          inTelegram
        />
      </AppShell>
    </AuthGate>
  );
}
