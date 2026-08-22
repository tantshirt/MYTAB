"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronGlyph } from "@/components/primitives/glyphs";
import { ListCard } from "@/components/primitives/list-card";
import { ListRow } from "@/components/primitives/list-row";
import { ExternalWalletConnect, isExternalWalletEnabled } from "@/features/auth/ExternalWalletConnect";
import {
  MYTAB_COLORS,
  MYTAB_ELEVATION,
  MYTAB_RADIUS,
  MYTAB_TYPOGRAPHY,
} from "@/lib/theme/tokens";
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
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setShowConnect(false);
      return;
    }
    sheetRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onDismiss]);

  if (!open) {
    return null;
  }

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(10,32,56,0.38)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={YOU_COPY.sheet.title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          background: MYTAB_COLORS.surface,
          borderRadius: `${MYTAB_RADIUS.lg} ${MYTAB_RADIUS.lg} 0 0`,
          boxShadow: MYTAB_ELEVATION.sheetShadow,
          padding: "10px 20px 22px",
          maxHeight: "calc(100dvh - 64px)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          outline: "none",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: "36px",
            height: "4px",
            borderRadius: MYTAB_RADIUS.full,
            background: MYTAB_COLORS.border,
            margin: "0 auto 20px",
          }}
        />

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
      </div>
    </div>
  );
}
