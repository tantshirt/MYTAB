"use client";

import { useRef, type KeyboardEvent } from "react";
import { JUPITER_ATTRIBUTION } from "@/lib/tokens/jupiter";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type PaymentTokenOption = {
  id: string;
  name: string;
  balanceLabel: string;
  affordable: boolean;
  logoUri?: string | null;
  /** Badge only when `=== true`. Missing or false is unverified (D-09). */
  isVerified?: boolean;
};

export type PaymentTokenSelectorProps = {
  tokens: PaymentTokenOption[];
  selectedId: string;
  onSelect: (tokenId: string) => void;
};

/** Contractual footer. This is the only surface that may render it (U-1). */
export const JUPITER_PICKER_FOOTER = JUPITER_ATTRIBUTION;

function VerifiedBadge() {
  return (
    <span
      aria-label="Verified"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "14px",
        height: "14px",
        flex: "none",
        borderRadius: MYTAB_RADIUS.full,
        background: MYTAB_COLORS.settled,
        color: MYTAB_COLORS.surface,
        fontSize: "9px",
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      ✓
    </span>
  );
}

/**
 * D-22 token picker — names, balances, logos, and a verified badge only when
 * `isVerified === true`. Unaffordable tokens stay visible and disabled.
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
    <div>
      <div
        role="radiogroup"
        aria-label="Payment token"
        style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}
      >
        {tokens.map((token, index) => {
          const selected = token.id === selectedId;
          const disabled = !token.affordable;
          const showBadge = token.isVerified === true;

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
              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                {token.logoUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={token.logoUri}
                    alt=""
                    width={22}
                    height={22}
                    style={{
                      flex: "none",
                      width: "22px",
                      height: "22px",
                      borderRadius: MYTAB_RADIUS.full,
                      objectFit: "cover",
                    }}
                  />
                ) : null}
                <div
                  style={{
                    minWidth: 0,
                    fontSize: "15px",
                    fontWeight: 600,
                    color: selected ? MYTAB_COLORS.primary : MYTAB_COLORS.ink,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {token.name}
                </div>
                {showBadge ? <VerifiedBadge /> : null}
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
      <p
        style={{
          margin: "10px 0 0",
          textAlign: "center",
          fontSize: MYTAB_TYPOGRAPHY.meta.size,
          color: MYTAB_COLORS.inkSubtle,
        }}
      >
        {JUPITER_PICKER_FOOTER}
      </p>
    </div>
  );
}
