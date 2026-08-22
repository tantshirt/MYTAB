"use client";

import { useRef, type KeyboardEvent } from "react";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";

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

/**
 * `token-chip` — single-select, names and balances only, no logos (DESIGN.md; §1.8).
 *
 * `rounded/full`, because money is rectangles and this is a chip. A token the payer
 * cannot afford stays visible and disabled with its balance readable, so the reason
 * is legible rather than inferred from an absence.
 */
export function PaymentTokenSelector({
  tokens,
  selectedId,
  onSelect,
}: PaymentTokenSelectorProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectable = tokens.filter((token) => token.affordable);
  const focusToken = (tokenId: string) => {
    const index = tokens.findIndex((token) => token.id === tokenId);
    refs.current[index]?.focus();
    onSelect(tokenId);
  };

  // Arrow keys move between the affordable chips; the group is one stop in the tab order.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tokenId: string) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0 || selectable.length === 0) return;

    event.preventDefault();
    const current = selectable.findIndex((token) => token.id === tokenId);
    const next = selectable[(current + step + selectable.length) % selectable.length]!;
    focusToken(next.id);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Payment token"
      style={{ display: "flex", gap: "10px" }}
    >
      {tokens.map((token, index) => {
        const selected = token.id === selectedId;
        const disabled = !token.affordable;

        return (
          <button
            key={token.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            tabIndex={disabled ? -1 : selected || !selectable.some((t) => t.id === selectedId) ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, token.id)}
            onClick={() => {
              if (!disabled) onSelect(token.id);
            }}
            style={{
              flexGrow: 1,
              flexBasis: 0,
              minWidth: 0,
              minHeight: "44px",
              padding: "12px 14px",
              borderRadius: MYTAB_RADIUS.full,
              border: selected
                ? `1px solid ${MYTAB_COLORS.primary}`
                : `1px solid ${MYTAB_COLORS.border}`,
              background: selected ? MYTAB_COLORS.primarySoft : MYTAB_COLORS.surface,
              fontFamily: "inherit",
              color: MYTAB_COLORS.ink,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.55 : 1,
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: selected ? MYTAB_COLORS.primary : MYTAB_COLORS.ink,
              }}
            >
              {token.name}
            </div>
            <div
              className="mytab-tabular"
              style={{
                marginTop: "2px",
                fontSize: "12px",
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
