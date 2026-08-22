"use client";

import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/features/auth/AuthGate";
import { YouSurfaceContainer } from "@/features/you";

export default function YouPage() {
  return (
    <AuthGate>
      <AppShell>
        <YouSurfaceContainer />
      </AppShell>
    </AuthGate>
  );
}
