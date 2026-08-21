"use client";

import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { ActivityFeed, FIXTURE_ACTIVITY } from "@/features/balances";

export default function ActivityPage() {
  return (
    <AuthGate>
      <AppShell>
        <main style={{ paddingTop: "8px", paddingBottom: "24px" }}>
          <h1 className="mytab-type-title" style={{ margin: 0 }}>
            Activity
          </h1>
          <div style={{ marginTop: "16px" }}>
            <ActivityFeed events={FIXTURE_ACTIVITY} />
          </div>
        </main>
      </AppShell>
    </AuthGate>
  );
}
