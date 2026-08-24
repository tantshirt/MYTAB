import type { PaymentTokenOption } from "@/components/settlement-sheet/PaymentTokenSelector";

export type SettleSheetData = {
  status: "loading" | "ready" | "unavailable";
  unavailableReason?: "NO_WALLET" | "RPC_FAILED" | "TOKEN_METADATA_UNAVAILABLE";
  intentId: string;
  activeInputMint: string;
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
  /** Failed/expired setup has one explicit, replacement-safe recovery action. */
  recoveryRequired: boolean;
  /** `created` / `quoting` — the quote is not resolved yet and Pay is disabled. */
  quoteResolving: boolean;
  staleRevision: boolean;
  /** Persisted `unknown` intent — last figures hold (D-30). */
  held: boolean;
  /** Only a fully prepared `ready_for_signature` intent may expose Pay. */
  payable: boolean;
  roundUpLabel: string;
  roundUpAmountLabel: string;
  tokens: PaymentTokenOption[];
  walletKind: "embedded" | "external" | null;
  walletProvider: string | null;
  preparedTxBase64: string | null;
};
