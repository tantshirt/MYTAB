"use client";

import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";

export default function ActivityPage() {
  return (
    <AuthGate>
      <AppShell>
        <main style={{ paddingTop: "8px" }}>
          <h1 className="mytab-type-title">Activity</h1>
          <p className="mytab-type-meta" style={{ marginTop: "8px" }}>
            Recent group activity will appear here.
          </p>
        </main>
      </AppShell>
    </AuthGate>
  );
}
