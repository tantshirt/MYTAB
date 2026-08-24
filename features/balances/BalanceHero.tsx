import type { BalanceHeroState } from "@/lib/domain/balance";
import { formatBalanceHeroParts, formatBalanceHeroText } from "@/lib/domain/balance";
import { formatCurrencyMinorForA11y, formatUsdcAtomicForA11y } from "@/lib/domain/a11yAmount";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

export type BalanceHeroProps = {
  state: BalanceHeroState;
};

/**
 * One-line position summary — display only, not interactive (Story 7.1).
 *
 * The label sits **above** the figure so the figure is the only thing competing for
 * the column width. Amounts are never truncated in this product (DESIGN.md), so there
 * is no `overflow: hidden` and no `text-overflow` here — the type scales down instead.
 */
export function BalanceHero({ state }: BalanceHeroProps) {
  const { label, figure } = formatBalanceHeroParts(state);

  const color =
    state.kind === "owed"
      ? MYTAB_COLORS.owed
      : state.kind === "settled"
        ? MYTAB_COLORS.settled
        : MYTAB_COLORS.ink;

  const ariaLabel =
    state.kind === "owed"
      ? `You owe ${formatCurrencyMinorForA11y(state.amountMinor, state.currency ?? "THB")}`
      : state.kind === "settled"
        ? `You are owed ${formatUsdcAtomicForA11y(state.amountAtomic)}`
        : formatBalanceHeroText(state);

  return (
    <div style={{ minWidth: 0 }}>
      {label ? (
        <p
          aria-hidden
          className="mytab-type-meta"
          style={{ margin: "0 0 4px", color: MYTAB_COLORS.inkMuted }}
        >
          {label}
        </p>
      ) : null}
      <p
        className="mytab-type-amount-hero mytab-tabular"
        data-mytab-amount
        aria-label={ariaLabel}
        style={{
          margin: 0,
          color,
          whiteSpace: "nowrap",
          fontSize: "clamp(32px, 10.8vw, 42px)",
          lineHeight: 1.1,
        }}
      >
        {figure}
      </p>
    </div>
  );
}
