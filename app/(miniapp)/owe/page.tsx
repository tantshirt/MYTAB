"use client";

import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/features/auth/AuthGate";
import { OweSurface } from "@/features/balances/OweSurface";
import { useOweData } from "@/features/balances/useOweData";
import { SettleSheetHost } from "@/features/settlement/SettleSheetHost";

/**
 * "What I owe" — where the bot's button lands (it used to land on `/you`,
 * which is wallet settings and answered a question nobody asked).
 *
 * `SettleSheetHost` mounts here so a row can open the Payment Sheet in place:
 * the sheet is keyed only by `?settle=<obligationId>` and is a sheet, not a
 * route (POLISH-SPEC §1.0).
 */
export default function OwePage() {
  const data = useOweData();

  return (
    <AuthGate>
      <AppShell>
        <OweSurface
          status={data.status}
          rows={data.rows}
          owedRows={data.owedRows}
          retry={data.retry}
        />
        <SettleSheetHost />
      </AppShell>
    </AuthGate>
  );
}
