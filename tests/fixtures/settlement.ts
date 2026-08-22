/**
 * Payment Sheet and Payment Progress fixtures — tests and the responsive sweep
 * only.
 *
 * Nothing under `app/`, `features/` or `components/` may import this file.
 * These are the densest money surfaces in the product, which is precisely why
 * the sweep has to measure them populated — and precisely why nothing that
 * ships may be able to reach these numbers.
 */
import type { PaymentProgressData } from "../../features/settlement/usePaymentProgressData";
import type { SettleSheetData } from "../../features/settlement/types";

export const FIXTURE_SETTLE_SHEET: SettleSheetData = {
  status: "ready",
  intentId: "intent_fixture",
  billAmountLabel: "your share of Sukhumvit Dinner",
  billAmount: "฿291.74",
  recipientName: "Maya",
  recipientId: "maya",
  destinationAsset: "USDC",
  spendLabel: "≈ 0.0412 SOL",
  maximumSpend: "0.0418 SOL",
  minimumReceiveAmount: "8.25 USDC",
  rateLabel: "฿35.36 per USDC",
  quoteRemainingMs: 42_000,
  quoteExpired: false,
  quoteResolving: false,
  staleRevision: false,
  held: false,
  roundUpLabel: "Round up to ฿300",
  roundUpAmountLabel: "+฿8.26",
  tokens: [
    { id: "usdc", name: "USDC", balanceLabel: "12.40 USDC", affordable: true },
    { id: "sol", name: "SOL", balanceLabel: "0.0612 SOL", affordable: true },
    { id: "usdt", name: "USDT", balanceLabel: "1.02 USDT", affordable: false },
  ],
  walletKind: null,
  walletProvider: null,
  preparedTxBase64: null,
};

export const FIXTURE_PAYMENT_PROGRESS: PaymentProgressData = {
  status: "submitted",
  recipientName: "Maya",
  failureCode: null,
  amountLabel: "฿291.74",
  billName: "Sukhumvit Dinner",
  recipientReceivesLabel: "8.25 USDC",
  tabHref: "/",
};
