import type { PaymentTokenOption } from "@/components/settlement-sheet/PaymentTokenSelector";

export type SettleSheetData = {
  status: "loading" | "ready" | "unavailable";
  unavailableReason?: "NO_WALLET" | "RPC_FAILED";
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
  /** Persisted `unknown` intent — last figures hold (D-30). */
  held: boolean;
  roundUpLabel: string;
  roundUpAmountLabel: string;
  tokens: PaymentTokenOption[];
  walletKind: "embedded" | "external" | null;
  walletProvider: string | null;
  preparedTxBase64: string | null;
};
