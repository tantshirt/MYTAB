"use client";

import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type PaymentTokenOption = {
  id: string;
  name: string;
  balanceLabel: string;
  affordable: boolean;
};

export type PaymentTokenSelectorProps = {
  tokens: PaymentTokenOption[];
  selectedId: string;
  onSelect: (tokenId: string) => void;
};

/** Single-select token chips — names and balances only, no logos (Story 6.5). */
export function PaymentTokenSelector({
  tokens,
  selectedId,
  onSelect,
}: PaymentTokenSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Payment token"
      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
    >
      {tokens.map((token) => {
        const selected = token.id === selectedId;
        const disabled = !token.affordable;

        return (
          <button
            key={token.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                onSelect(token.id);
              }
            }}
            style={{
              minHeight: "44px",
              minWidth: "44px",
              padding: "10px 14px",
              borderRadius: MYTAB_RADIUS.sm,
              border: selected
                ? `1px solid ${MYTAB_COLORS.primary}`
                : `1px solid ${MYTAB_COLORS.border}`,
              background: selected ? MYTAB_COLORS.primarySoft : MYTAB_COLORS.surface,
              color: disabled ? MYTAB_COLORS.inkMuted : MYTAB_COLORS.ink,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.55 : 1,
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontSize: MYTAB_TYPOGRAPHY.label.size,
                fontWeight: 600,
              }}
            >
              {token.name}
            </div>
            <div
              style={{
                marginTop: "2px",
                fontSize: MYTAB_TYPOGRAPHY.meta.size,
                color: MYTAB_COLORS.inkMuted,
              }}
            >
              {token.balanceLabel}
            </div>
          </button>
        );
      })}
    </div>
  );
}
