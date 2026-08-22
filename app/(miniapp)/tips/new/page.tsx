"use client";

import { Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { TipComposer, type TipComposerMember } from "@/features/tips";

type TipComposerData = {
  viewerUserId: string;
  members: TipComposerMember[];
};

/**
 * Single prop-resolution point for the Tip Composer.
 *
 * TODO(live-data): replace the fixture with `useViewer()` for the viewer id and
 * `useQuery(api.groups.listTipRecipients, { groupId })` for the members, and
 * route `onSubmit` at `api.settlements.createTipIntent`.
 */
function useTipComposerData(groupId: string | null): TipComposerData {
  return useMemo(
    () => ({
      viewerUserId: "users:andre",
      members: [
        {
          userId: "users:andre",
          displayName: "Andre",
          membershipStatus: "active",
          walletReady: true,
        },
        {
          userId: "users:maya",
          displayName: "Maya",
          membershipStatus: "active",
          walletReady: true,
        },
        {
          userId: "users:bo",
          displayName: "Bo",
          membershipStatus: "active",
          walletReady: true,
        },
        {
          userId: "users:noi",
          displayName: "Noi",
          membershipStatus: "active",
          walletReady: false,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groupId is the seam key.
    [groupId],
  );
}

function TipComposerSurface() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recipientUserId = searchParams.get("to");
  const groupId = searchParams.get("group");
  const { viewerUserId, members } = useTipComposerData(groupId);

  const handleSubmit = useCallback(() => {
    // A tip in flight is a payment in flight, so it hands off to the route.
    router.push("/activity");
  }, [router]);

  return (
    <AppShell>
      <TipComposer
        members={members}
        viewerUserId={viewerUserId}
        preselectedRecipientUserId={recipientUserId ?? undefined}
        onSubmit={handleSubmit}
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
