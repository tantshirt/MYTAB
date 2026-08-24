"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ObligationPaymentSheet } from "./ObligationPaymentSheet";
import { usePayObligation } from "./usePayObligation";
import { useSettleSheetData } from "@/features/settlement/useSettleSheetData";
import { useLiveMutation } from "@/features/convex/useConvexData";
import { SheetContainer } from "@/components/settlement-sheet/SheetContainer";
import { ErrorState } from "@/components/primitives/error-state";
import { STATE_COPY } from "@/components/primitives/state-copy";
import { WalletConnectHost } from "@/features/auth/WalletConnectHost";
import { writePendingWalletAction } from "@/features/auth/pendingWalletAction";
import { submitPaymentIntent } from "./intentSubmission";
import { claimAutomaticSettlementCreation, isCurrentSettlementOperation } from "./operationFence";

/**
 * The Payment Sheet is a *sheet*, not a route (POLISH-SPEC §1.0).
 *
 * It is dismissible until Pay is tapped, so it must not own a URL of its own —
 * but it still has to survive a reload and answer to Telegram's BackButton,
 * so it is keyed on a search param: `?settle=<obligationId>`.
 *
 * Mount `<SettleSheetHost />` on any surface that can open it (Claim Board,
 * Group, Activity) and open it with `settleSearch(obligationId)`.
 */
export const SETTLE_PARAM = "settle";

/** Build the query string that opens the sheet on the current surface. */
export function settleSearch(obligationId: string): string {
  return `?${SETTLE_PARAM}=${encodeURIComponent(obligationId)}`;
}

/** §4.3, Payment Sheet — the sheet exists, and there is no price to put in it. */
export const NO_QUOTE_MESSAGE = "Couldn't get a price right now.";

function SettleSheet({ obligationId }: { obligationId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const data = useSettleSheetData(obligationId, refreshNonce);
  const createIntent = useLiveMutation(api.settlements.createObligationIntent);
  const refreshIntent = useLiveMutation(api.settlements.refreshObligationIntent);
  const { pay } = usePayObligation();

  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [creatingTokenId, setCreatingTokenId] = useState("");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [automaticCreationFailed, setAutomaticCreationFailed] = useState(false);
  const [retryTokenId, setRetryTokenId] = useState("");
  // Once Pay is tapped the sheet is committed: scrim tap, swipe-down and Escape all
  // come off together, and it transitions forward to Payment Progress (EXPERIENCE,
  // `payment-sheet`). It is never dismissible backward again.
  const [committed, setCommitted] = useState(false);
  const operationGeneration = useRef(0);
  const activeObligationId = useRef(obligationId);
  const automaticCreationKeys = useRef(new Set<string>());
  if (activeObligationId.current !== obligationId) {
    activeObligationId.current = obligationId;
    operationGeneration.current += 1;
    automaticCreationKeys.current = new Set();
  }

  const isCurrentOperation = useCallback(
    (generation: number, expectedObligationId: string) =>
      isCurrentSettlementOperation(
        activeObligationId.current,
        operationGeneration.current,
        expectedObligationId,
        generation,
      ),
    [],
  );

  useEffect(() => {
    setSelectedTokenId("");
    setCreatingTokenId("");
    setSelectionError(null);
    setAutomaticCreationFailed(false);
    setRetryTokenId("");
    setCommitted(false);
  }, [obligationId]);

  useEffect(() => {
    if (data.intentId && data.activeInputMint) {
      setSelectedTokenId(data.activeInputMint);
    }
  }, [data.intentId, data.activeInputMint]);

  const dismiss = useCallback(() => {
    // Dismissal removes the key rather than pushing a new entry, so Telegram's
    // BackButton does not have to walk back through the sheet twice.
    router.replace(pathname);
  }, [router, pathname]);

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    const first = data.tokens.find((token) => token.affordable);
    if (
      data.status !== "ready" ||
      data.intentId ||
      !first ||
      !createIntent ||
      creatingTokenId ||
      automaticCreationFailed
    ) {
      return;
    }
    if (!claimAutomaticSettlementCreation(automaticCreationKeys.current, obligationId, first.id)) return;
    const generation = operationGeneration.current;
    setCreatingTokenId(first.id);
    setRetryTokenId(first.id);
    setSelectionError(null);
    void submitPaymentIntent({
      obligationId,
      inputMint: first.id,
      idempotencyKey: crypto.randomUUID(),
      writer: (args) => createIntent(args as never),
    }).then(({ inputMint }) => {
      if (!isCurrentOperation(generation, obligationId)) return;
      setSelectedTokenId(inputMint);
      refresh();
    }).catch(() => {
      if (!isCurrentOperation(generation, obligationId)) return;
      setAutomaticCreationFailed(true);
      setSelectionError("Could not prepare that payment token. Try again.");
    }).finally(() => {
      if (isCurrentOperation(generation, obligationId)) setCreatingTokenId("");
    });
  }, [automaticCreationFailed, createIntent, creatingTokenId, data.intentId, data.status, data.tokens, isCurrentOperation, obligationId, refresh]);

  const handleSelectToken = useCallback(
    (tokenId: string) => {
      if (!createIntent || creatingTokenId) {
        setSelectionError("Payment preparation is unavailable.");
        return;
      }
      setCreatingTokenId(tokenId);
      const generation = operationGeneration.current;
      setRetryTokenId(tokenId);
      setSelectionError(null);
      void submitPaymentIntent({
        obligationId,
        inputMint: tokenId,
        idempotencyKey: crypto.randomUUID(),
        writer: (args) => createIntent(args as never),
      })
        .then(({ inputMint }) => {
          if (!isCurrentOperation(generation, obligationId)) return;
          setAutomaticCreationFailed(false);
          setSelectedTokenId(inputMint);
          refresh();
        })
        .catch(() => {
          if (!isCurrentOperation(generation, obligationId)) return;
          setSelectionError("Could not prepare that payment token. Your previous choice is unchanged.");
        })
        .finally(() => {
          if (isCurrentOperation(generation, obligationId)) setCreatingTokenId("");
        });
    },
    [createIntent, creatingTokenId, isCurrentOperation, obligationId, refresh],
  );

  const handleRefreshQuote = useCallback(() => {
    const inputMint =
      data.activeInputMint ||
      selectedTokenId ||
      data.tokens.find((token) => token.affordable)?.id;
    if (!refreshIntent || !inputMint) {
      setSelectionError("Payment preparation is unavailable.");
      return;
    }
    setCreatingTokenId(inputMint);
    const generation = operationGeneration.current;
    setSelectionError(null);
    void submitPaymentIntent({
      obligationId,
      inputMint,
      idempotencyKey: crypto.randomUUID(),
      writer: (args) => refreshIntent(args as never),
    })
      .then((result) => {
        if (!isCurrentOperation(generation, obligationId)) return;
        if (data.staleRevision && result.obligationId && result.obligationId !== obligationId) {
          router.replace(`${pathname}?${SETTLE_PARAM}=${encodeURIComponent(result.obligationId)}`);
          return;
        }
        refresh();
      })
      .catch(() => {
        if (isCurrentOperation(generation, obligationId)) {
          setSelectionError("Could not refresh that price. Your previous quote is unchanged.");
        }
      })
      .finally(() => {
        if (isCurrentOperation(generation, obligationId)) setCreatingTokenId("");
      });
  }, [data.activeInputMint, data.staleRevision, data.tokens, isCurrentOperation, obligationId, pathname, refresh, refreshIntent, router, selectedTokenId]);

  const recoveryTokenId =
    data.activeInputMint || selectedTokenId || data.tokens.find((token) => token.affordable)?.id || "";

  const handlePay = useCallback(() => {
    if (!data.intentId || !data.payable) {
      return;
    }
    setCommitted(true);
    const generation = operationGeneration.current;
    const intentId = data.intentId;
    void pay({
      intentId,
      walletKind: data.walletKind,
      walletProvider: data.walletProvider,
      preparedTxBase64: data.preparedTxBase64,
    }).then((result) => {
      if (!isCurrentOperation(generation, obligationId)) return;
      if (!result.ok) {
        setCommitted(false);
        return;
      }
      router.replace(`/pay/${intentId}`);
    }).catch(() => {
      if (isCurrentOperation(generation, obligationId)) {
        setCommitted(false);
        setSelectionError("Could not submit that payment. Try again.");
      }
    });
  }, [data, isCurrentOperation, obligationId, pay, router]);

  /*
   * Every figure on this sheet is money — a spend, a floor, a rate, a balance.
   * With no quote there is no honest placeholder for any of them, so the sheet
   * says so and offers the one action that can change the answer. It never
   * renders amounts nobody owes under a live Pay button.
   */
  if (data.status !== "ready") {
    if (data.unavailableReason === "NO_WALLET") {
      return (
        <WalletConnectHost
          reason="pay"
          onLinked={() => {
            writePendingWalletAction({ kind: "pay", obligationId });
            refresh();
          }}
          onSkip={dismiss}
        />
      );
    }
    return (
      <SheetContainer label="Payment sheet" dismissible onDismiss={dismiss}>
        <ErrorState
          headline={NO_QUOTE_MESSAGE}
          actions={[{ label: STATE_COPY.retry, onPress: refresh }]}
        />
      </SheetContainer>
    );
  }

  return (
    <SheetContainer label="Payment sheet" dismissible={!committed} onDismiss={dismiss}>
      <ObligationPaymentSheet
        billAmount={data.billAmount}
        billAmountLabel={data.billAmountLabel}
        recipientName={data.recipientName}
        recipientId={data.recipientId}
        destinationAsset={data.destinationAsset}
        tokens={data.tokens}
        selectedTokenId={selectedTokenId}
        onSelectToken={handleSelectToken}
        spendLabel={data.spendLabel}
        minimumReceiveAmount={data.minimumReceiveAmount}
        maximumSpend={data.maximumSpend}
        rateLabel={data.rateLabel}
        quoteRemainingMs={data.quoteRemainingMs}
        quoteExpired={data.quoteExpired}
        quoteResolving={data.quoteResolving || !data.intentId || Boolean(creatingTokenId)}
        staleRevision={data.staleRevision}
        held={data.held}
        paymentsPaused={!data.payable}
        onPay={handlePay}
        onRefreshQuote={handleRefreshQuote}
        onRefreshBill={handleRefreshQuote}
      />
      {selectionError ? (
        <div role="alert" className="mytab-type-meta" style={{ margin: "10px 0 0" }}>
          <p style={{ margin: 0 }}>{selectionError}</p>
          {automaticCreationFailed && retryTokenId ? (
            <button
              type="button"
              className="mytab-link-button"
              style={{ minHeight: 44 }}
              onClick={() => {
                handleSelectToken(retryTokenId);
              }}
              disabled={Boolean(creatingTokenId)}
            >
              Retry payment setup
            </button>
          ) : null}
        </div>
      ) : null}
      {data.recoveryRequired && !selectionError ? (
        <div role="alert" className="mytab-type-meta" style={{ margin: "10px 0 0" }}>
          <p style={{ margin: 0 }}>Payment setup did not finish. You can safely try once more.</p>
          <button
            type="button"
            className="mytab-link-button"
            style={{ minHeight: 44 }}
            onClick={handleRefreshQuote}
            disabled={!recoveryTokenId || Boolean(creatingTokenId)}
          >
            Retry payment setup
          </button>
        </div>
      ) : null}
    </SheetContainer>
  );
}

function SettleSheetSwitch() {
  const searchParams = useSearchParams();
  const obligationId = searchParams.get(SETTLE_PARAM);

  if (!obligationId) {
    return null;
  }

  return <SettleSheet obligationId={obligationId} />;
}

/**
 * Renders the Payment Sheet when `?settle=<obligationId>` is present, and
 * nothing at all otherwise.
 */
export function SettleSheetHost() {
  return (
    <Suspense fallback={null}>
      <SettleSheetSwitch />
    </Suspense>
  );
}
