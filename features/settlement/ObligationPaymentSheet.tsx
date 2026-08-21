"use client";

import { PaymentSheet, type PaymentSheetProps } from "@/components/settlement-sheet/PaymentSheet";
import { PaymentTokenSelector, type PaymentTokenOption } from "@/components/settlement-sheet/PaymentTokenSelector";
import { RoundUpControl } from "@/components/settlement-sheet/RoundUpControl";
import { StaleRevisionBanner } from "@/components/settlement-sheet/RoundUpControl";

export type ObligationPaymentSheetProps = PaymentSheetProps & {
  tokens: PaymentTokenOption[];
  selectedTokenId: string;
  onSelectToken: (tokenId: string) => void;
  routedPayment?: boolean;
  staleRevision?: boolean;
  onRefreshStale?: () => void;
  roundUpEnabled?: boolean;
  roundUpLabel?: string;
  roundUpAmountLabel?: string;
  onToggleRoundUp?: (enabled: boolean) => void;
};

/**
 * Obligation payment sheet — token selector, round-up, stale revision (Stories 6.5, 6.6, 6.9).
 */
export function ObligationPaymentSheet({
  tokens,
  selectedTokenId,
  onSelectToken,
  routedPayment = false,
  staleRevision = false,
  onRefreshStale,
  roundUpEnabled = false,
  roundUpLabel = "Round up for the organizer",
  roundUpAmountLabel,
  onToggleRoundUp,
  minimumReceive,
  recipientName,
  ...sheetProps
}: ObligationPaymentSheetProps) {
  const minimumReceiveLabel = routedPayment
    ? `${recipientName} receives at least ${minimumReceive.replace(/^Minimum they receive · /, "")}`
    : minimumReceive;

  return (
    <div>
      <div style={{ padding: "16px 16px 0" }}>
        <p
          style={{
            margin: "0 0 10px",
            fontSize: "13px",
            fontWeight: 600,
            color: "#5A6672",
          }}
        >
          Pay with
        </p>
        <PaymentTokenSelector
          tokens={tokens}
          selectedId={selectedTokenId}
          onSelect={onSelectToken}
        />
      </div>

      {staleRevision ? (
        <div style={{ padding: "0 16px" }}>
          <StaleRevisionBanner onRefresh={onRefreshStale ?? (() => undefined)} />
        </div>
      ) : (
        <>
          <PaymentSheet
            {...sheetProps}
            recipientName={recipientName}
            minimumReceive={minimumReceiveLabel}
            roundUpTip={roundUpEnabled ? roundUpAmountLabel ?? null : null}
          />
          {onToggleRoundUp ? (
            <div style={{ padding: "0 16px" }}>
              <RoundUpControl
                label={roundUpLabel}
                amountLabel={roundUpAmountLabel ?? ""}
                enabled={roundUpEnabled}
                onToggle={onToggleRoundUp}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
