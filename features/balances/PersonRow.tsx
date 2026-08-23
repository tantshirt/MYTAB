"use client";

import Link from "next/link";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import { avatarTintForUserId, MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import { monogram } from "./monogram";

export const PERSON_ROW_COPY = {
  owe: "you owe",
  owed: "owes you",
} as const;

export type PersonRowProps = {
  userId: string;
  name: string;
  direction: "owe" | "owed";
  /** Already formatted, e.g. "฿291.74". */
  amount: string;
  amountA11yLabel?: string;
  href: string;
};

/**
 * One counterparty, in the People section.
 *
 * This replaces `BalanceLinkRow`'s "Owe Maya" line. The change is not
 * cosmetic: the person is now the subject of the row and carries their own
 * colour — the same tint their avatar has on the Claim Board and in the
 * presence stack — so a name is recognisable before it is read.
 *
 * Direction is a WORD, never only a colour. `colors/owed` and `colors/settled`
 * do the fast reading; "you owe" and "owes you" do the actual telling
 * (EXPERIENCE, *Accessibility Floor*).
 */
export function PersonRow({
  userId,
  name,
  direction,
  amount,
  amountA11yLabel,
  href,
}: PersonRowProps) {
  return (
    <Link
      href={href}
      style={{
        display: "grid",
        gridTemplateColumns: "32px minmax(0, 1fr) auto",
        columnGap: "12px",
        alignItems: "center",
        padding: "14px 16px",
        minHeight: "56px",
        textDecoration: "none",
        color: MYTAB_COLORS.ink,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          borderRadius: MYTAB_RADIUS.full,
          background: avatarTintForUserId(userId),
          color: MYTAB_COLORS.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "13px",
          fontWeight: 600,
        }}
      >
        {monogram(name)}
      </span>

      <span style={{ minWidth: 0 }}>
        <span
          className="mytab-type-body mytab-row__label mytab-name"
          style={{ display: "block", fontWeight: 500 }}
        >
          {name}
        </span>
        <span
          className="mytab-type-meta"
          style={{ display: "block", marginTop: "2px", fontSize: "12px" }}
        >
          {PERSON_ROW_COPY[direction]}
        </span>
      </span>

      <span
        className="mytab-type-amount-row mytab-tabular mytab-row__amount"
        data-mytab-amount
        aria-label={amountA11yLabel ?? formatAmountLabelForA11y(amount)}
        style={{
          fontWeight: 600,
          color: direction === "owe" ? MYTAB_COLORS.owed : MYTAB_COLORS.settled,
        }}
      >
        {amount}
      </span>
    </Link>
  );
}
