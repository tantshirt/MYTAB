"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { useOffline } from "@/components/primitives/use-offline";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import {
  telegramUserIdFrom,
  useLiveMutation,
  useLiveQuery,
} from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  TipComposer,
  type TipComposerMember,
  type TipComposerSubmitPayload,
} from "@/features/tips";

type TipComposerData = {
  viewerUserId: string;
  members: TipComposerMember[];
};

/** The cast is the five protagonists — Maya, Andre, Noi, Ploy and Tim (DESIGN.md). */
const FIXTURE_TIP_COMPOSER: TipComposerData = {
  viewerUserId: "users:andre",
  members: [
    { userId: "users:andre", displayName: "Andre", membershipStatus: "active", walletReady: true },
    { userId: "users:maya", displayName: "Maya", membershipStatus: "active", walletReady: true },
    { userId: "users:ploy", displayName: "Ploy", membershipStatus: "active", walletReady: true },
    { userId: "users:noi", displayName: "Noi", membershipStatus: "active", walletReady: false },
  ],
};

/**
 * Single prop-resolution point for the Tip Composer.
 *
 * Live read: `api.groups.getGroup({ groupId })` — there is no
 * `groups.listTipRecipients`, and `getGroup` already returns exactly what the
 * composer filters on: `userId`, `displayName`, `membershipStatus` and
 * `walletReady`.
 *
 * The viewer is matched by Telegram id rather than `useViewer()`, which returns
 * the Privy DID and cannot be compared to a Convex `users` id.
 */
function useTipComposerData(groupId: string | null): TipComposerData {
  const { initDataUnsafe } = useTelegramRuntime();
  const viewerTelegramUserId = telegramUserIdFrom(initDataUnsafe);

  const group = useLiveQuery(
    api.groups.getGroup,
    groupId ? { groupId: groupId as Id<"groups"> } : "skip",
  );

  return useMemo<TipComposerData>(() => {
    if (group.fixture) {
      return FIXTURE_TIP_COMPOSER;
    }

    const members = (group.data?.members ?? [])
      .filter((member) => member.userId !== null)
      .map((member) => ({
        userId: member.userId as string,
        displayName: member.displayName,
        membershipStatus: member.membershipStatus,
        walletReady: member.walletReady,
      }));

    const viewer = (group.data?.members ?? []).find(
      (member) => member.telegramUserId === viewerTelegramUserId,
    );

    return { viewerUserId: viewer?.userId ?? "", members };
  }, [group.fixture, group.data, viewerTelegramUserId]);
}

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
        .catch(() => setSendFailed(true));
    },
    [createTipIntent, groupId, router],
  );

  return (
    <AppShell>
      <TipComposer
        members={members}
        viewerUserId={viewerUserId}
        preselectedRecipientUserId={recipientUserId ?? undefined}
        onSubmit={handleSubmit}
        sendFailed={sendFailed}
        offline={offline}
        inTelegram={isTelegramWebApp}
      />
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
