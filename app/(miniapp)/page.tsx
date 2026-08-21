"use client";

import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { GroupSurface, FIXTURE_GROUP_SURFACE } from "@/features/groups/GroupSurface";

export default function TabsHomePage() {
  return (
    <AuthGate>
      <AppShell>
        <GroupSurface {...FIXTURE_GROUP_SURFACE} />
      </AppShell>
    </AuthGate>
  );
}
