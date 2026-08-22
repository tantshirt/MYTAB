"use client";

import type { PaymentTokenOption } from "@/components/settlement-sheet/PaymentTokenSelector";

export type SettleSheetData = {
  status: "loading" | "ready" | "unavailable";
  intentId: string;
  billAmountLabel: string;
  billAmount: string;
  recipientName: string;
  recipientId: string;
  destinationAsset: string;
  spendLabel: string;
  maximumSpend: string;
  minimumReceiveAmount: string;
  rateLabel: string;
  quoteRemainingMs: number;
  quoteExpired: boolean;
  /** `created` / `quoting` — the quote is not resolved yet and Pay is disabled. */
  quoteResolving: boolean;
  staleRevision: boolean;
  roundUpLabel: string;
  roundUpAmountLabel: string;
  tokens: PaymentTokenOption[];
};

/**
 * Single prop-resolution point for the Payment Sheet.
 *
 * BLOCKED on Convex, and it resolves `unavailable` while it is.
 *
 * There is no `settlements.getObligationQuote`, and nothing equivalent:
 *
 *   - `api.settlements.getIntent` projects five fields (status, failure code,
 *     signature, expiry) and none of the sheet's amounts, quote, rate or
 *     token balances.
 *   - `api.settlements.createObligationIntent` / `refreshObligationIntent`
 *     take an `obligationId`, and no query returns one for this key: the
 *     `?settle=` value the Claim Board passes today is the tab token, not an
 *     obligation id (see `TabDeepLinkSurface`).
 *   - Wallet token balances have no Convex surface at all; only
 *     `wallets.defaultReceivingWallet` (an address) exists.
 *
 * Needed before this can be swapped: an `obligations.forViewer(tabId)` query
 * returning the viewer's obligation id and amount, and a quote read that
 * projects the live intent's quote — spend, minimum receive, rate, TTL,
 * `staleRevision` and the affordable token list.
 *
 * Until then the sheet renders §4.3's "Couldn't get a price right now." with
 * "Try again". Every field on this sheet is money: a spend figure, a floor, a
 * rate and a balance. There is no honest placeholder for any of them, and a
 * sheet showing amounts nobody owes with a live Pay button under them is the
 * single most dangerous screen this product could ship.
 */
export function useSettleSheetData(obligationId: string): SettleSheetData {
  return {
    status: "unavailable",
    intentId: `intent_${obligationId}`,
    billAmountLabel: "",
    billAmount: "",
    recipientName: "",
    recipientId: "",
    destinationAsset: "USDC",
    spendLabel: "",
    maximumSpend: "",
    minimumReceiveAmount: "",
    rateLabel: "",
    quoteRemainingMs: 0,
    quoteExpired: false,
    quoteResolving: false,
    staleRevision: false,
    roundUpLabel: "",
    roundUpAmountLabel: "",
    tokens: [],
  };
}
