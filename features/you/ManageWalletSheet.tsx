"use client";

import { useEffect, useState } from "react";
import { ChevronGlyph } from "@/components/primitives/glyphs";
import { ListCard } from "@/components/primitives/list-card";
import { ListRow } from "@/components/primitives/list-row";
import { SheetContainer } from "@/components/settlement-sheet/SheetContainer";
import { ExternalWalletConnect, isExternalWalletEnabled } from "@/features/auth/ExternalWalletConnect";
import { MYTAB_COLORS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { YOU_COPY } from "./copy";
import { WalletKeyRow } from "./WalletKeyRow";

export type ManageWalletSheetProps = {
  open: boolean;
  publicKey: string;
  onDismiss: () => void;
  onExportWallet?: () => void;
  exportDisabled?: boolean;
  /** Stated reason, on the sub-line — never a silent grey row. */
  exportDisabledReason?: string;
  onConnectExternalWallet?: () => void;
};

/**
 * "Manage wallet" — a dismissible bottom sheet with no commit step (POLISH-SPEC §3.2).
 * There is no Disconnect, no Sign out, no Delete account.
 *
 * The shell — scrim, radius, grab handle, shadow, focus trap, Escape, scroll lock and
 * drag-to-dismiss — is `SheetContainer`, the one bottom-sheet implementation in the
 * product. This file used to hand-roll a second, shallower copy of it.
 */
export function ManageWalletSheet({
  open,
  publicKey,
  onDismiss,
  onExportWallet,
  exportDisabled = false,
  exportDisabledReason,
  onConnectExternalWallet,
}: ManageWalletSheetProps) {
  const [showConnect, setShowConnect] = useState(false);

  // Re-opening the sheet starts from the list, never mid-flow.
  useEffect(() => {
    if (!open) {
      setShowConnect(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <SheetContainer label={YOU_COPY.sheet.title} onDismiss={onDismiss}>
      <p className="mytab-type-micro-label" style={{ margin: 0 }}>
        {YOU_COPY.sheet.microLabel}
      </p>
      <p
        className="mytab-tabular"
        style={{
          margin: "8px 0 16px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: MYTAB_TYPOGRAPHY.meta.size,
          lineHeight: 1.5,
          color: MYTAB_COLORS.inkMuted,
          wordBreak: "break-all",
        }}
      >
        {publicKey}
      </p>

      <ListCard>
        <WalletKeyRow
          label={YOU_COPY.sheet.copyKey}
          publicKey={publicKey}
          ariaLabel={YOU_COPY.sheet.copyKeyAriaLabel}
        />
        <ListRow
          label={YOU_COPY.sheet.exportLabel}
          sub={exportDisabled ? exportDisabledReason : YOU_COPY.sheet.exportSub}
          disabled={exportDisabled}
          onPress={onExportWallet}
          trailing={<ChevronGlyph />}
        />
        {isExternalWalletEnabled() ? (
          <ListRow
            label={YOU_COPY.sheet.connectOther}
            onPress={() => {
              setShowConnect(true);
              onConnectExternalWallet?.();
            }}
            trailing={<ChevronGlyph />}
          />
        ) : null}
      </ListCard>

      {showConnect ? (
        <div style={{ marginTop: "16px" }}>
          <ExternalWalletConnect onConnect={onConnectExternalWallet} />
        </div>
      ) : null}
    </SheetContainer>
  );
}
