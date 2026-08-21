"use client";

import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";

export default function YouPage() {
  return (
    <AuthGate>
      <AppShell>
        <main style={{ paddingTop: "8px" }}>
          <h1 className="mytab-type-title">You</h1>
          <p className="mytab-type-meta" style={{ marginTop: "8px" }}>
            Your receiving preference and profile.
          </p>
        </main>
      </AppShell>
    </AuthGate>
  );
}
