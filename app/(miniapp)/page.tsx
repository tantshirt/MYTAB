"use client";

import { AuthGate } from "@/features/auth/AuthGate";

export default function TabsHomePage() {
  return (
    <AuthGate>
      <main style={{ padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 600, margin: 0 }}>My Tab</h1>
        <p style={{ marginTop: "8px", color: "#57534e" }}>
          Start a tab, claim yours, settle without leaving the chat.
        </p>
      </main>
    </AuthGate>
  );
}
