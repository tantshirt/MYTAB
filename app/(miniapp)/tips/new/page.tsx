"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { useOffline } from "@/components/primitives/use-offline";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { useLiveMutation } from "@/features/convex/useConvexData";
import { useTipComposerData } from "@/features/tips/useTipComposerData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TipComposer, type TipComposerSubmitPayload } from "@/features/tips";
import { WalletConnectHost } from "@/features/auth/WalletConnectHost";
import { writePendingWalletAction } from "@/features/auth/pendingWalletAction";

function TipComposerSurface() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recipientUserId = searchParams.get("to");
  const groupId = searchParams.get("group");
  const { viewerUserId, members } = useTipComposerData(groupId);
  const offline = useOffline();
  const { isTelegramWebApp } = useTelegramRuntime();

  const createTipIntent = useLiveMutation(api.settlements.createTipIntent);

  // §4.3 — "Couldn't send the tip. Try again.", rendered above the footer, and the
  // footer action re-submits.
  const [sendFailed, setSendFailed] = useState(false);
  const [needsWallet, setNeedsWallet] = useState(false);
  const [pendingTip, setPendingTip] = useState<TipComposerSubmitPayload | null>(null);

  /**
   * `api.settlements.createTipIntent` is idempotent on `idempotencyKey`, which
   * the composer already mints per submit. A tip in flight is a payment in
   * flight, so it hands off to the Payment Progress route (§1.0).
   */
  const handleSubmit = useCallback(
    (payload: TipComposerSubmitPayload) => {
      setSendFailed(false);

      if (!createTipIntent || !groupId) {
        router.push("/activity");
        return;
      }

      void createTipIntent({
        groupId: groupId as Id<"groups">,
        recipientUserId: payload.recipientUserId as Id<"users">,
        amountAtomic: payload.amountAtomic,
        displayAmountThbMinor: BigInt(payload.amountThbMinor),
        note: payload.note,
        reaction: payload.reaction,
        idempotencyKey: payload.idempotencyKey,
      })
        .then((intent) => router.push(`/pay/${intent.intentId}`))
        .catch((error: unknown) => {
          const code = error instanceof Error ? error.message : "";
          if (code.includes("PAYER_WALLET_REQUIRED")) {
            writePendingWalletAction({ kind: "tip" });
            setPendingTip(payload);
            setNeedsWallet(true);
            return;
          }
          setSendFailed(true);
        });
    },
    [createTipIntent, groupId, router],
  );

  return (
    /*
     * `fullBleed`: the tip composer draws its own 16px gutters and its own
     * full-width footer bar, so nesting it inside AppShell's gutters gave this
     * one surface 32px screen margins — twice DESIGN.md's `spacing/4` — and an
     * action bar whose surface fill and top hairline stopped 16px short of each
     * screen edge, which is the "floating" bar DESIGN.md forbids. Dropping the
     * outer gutter restores the product-wide 16px and gives the 320px layout
     * back the 32px the preset and reaction rows need to hold every chip at the
     * 44px touch floor.
     */
    <AppShell fullBleed>
      <TipComposer
        members={members}
        viewerUserId={viewerUserId}
        preselectedRecipientUserId={recipientUserId ?? undefined}
        onSubmit={handleSubmit}
        sendFailed={sendFailed}
        offline={offline}
        inTelegram={isTelegramWebApp}
      />
      {needsWallet ? (
        <WalletConnectHost
          reason="pay"
          onLinked={() => {
            setNeedsWallet(false);
            if (pendingTip) {
              handleSubmit(pendingTip);
            }
          }}
          onSkip={() => setNeedsWallet(false)}
        />
      ) : null}
    </AppShell>
  );
}

/** Tip Composer — `/tips/new` (POLISH-SPEC §1.11). Accepts `?to=<userId>`. */
export default function NewTipPage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <TipComposerSurface />
      </Suspense>
    </AuthGate>
  );
}
