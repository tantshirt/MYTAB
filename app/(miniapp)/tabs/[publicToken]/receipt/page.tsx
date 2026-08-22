"use client";

import { use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { ReceiptReview, FIXTURE_PARSED_RECEIPT } from "@/features/receipts";
import { useResolvedTab } from "@/features/tabs/useTabData";
import { useLiveMutation, useLiveQuery } from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ParsedReceipt, ParsedReceiptLine } from "@/lib/domain/receiptParse";
import { fiatMinorFromInteger, type FiatMinor } from "@/lib/domain/money";

type ReceiptPageProps = {
  params: Promise<{ publicToken: string }>;
};

type ReceiptData = {
  parsed: ParsedReceipt;
  /** Right of the merchant in the header strip. Absent when the import has no date. */
  capturedAtLabel?: string;
};

const ZERO = fiatMinorFromInteger(0);

/** Nothing extracted yet — an honest empty receipt, never a fixture over live data. */
const EMPTY_RECEIPT: ParsedReceipt = {
  lines: [],
  reconciliation: {
    linesTotalMinor: ZERO,
    receiptTotalMinor: ZERO,
    differenceMinor: ZERO,
    reconciled: true,
  },
};

function capturedAtLabelFrom(createdAt: number | undefined): string | undefined {
  if (!createdAt) {
    return undefined;
  }
  const sameDay = new Date(createdAt).toDateString() === new Date().toDateString();
  return sameDay ? "Tonight" : undefined;
}

/**
 * Single prop-resolution point for Receipt Review.
 *
 * Live read: `api.receipts.getImport({ importId })`. The import document stores
 * the already-parsed extraction (`validateAndParseExtraction(...).parsed`), so
 * `extraction` *is* a `ParsedReceipt`.
 *
 * PARTIALLY BLOCKED: `getImport` is keyed on an `importId`, and the route is
 * keyed on a tab. There is no `receipts.latestImportForTab(tabId)` query, so a
 * cold load of this URL has no subject to read. The import id is therefore only
 * known once this session created it — `useSampleReceipt` (demo) or
 * `createUploadTicket` + `finalizeUpload` (capture). Until then the surface
 * renders an empty receipt rather than a fixture.
 */
function useReceiptData(importId: string | null): ReceiptData {
  const result = useLiveQuery(
    api.receipts.getImport,
    importId ? { importId: importId as Id<"receiptImports"> } : "skip",
  );

  return useMemo<ReceiptData>(() => {
    if (result.fixture) {
      return { parsed: FIXTURE_PARSED_RECEIPT, capturedAtLabel: "Tonight" };
    }

    const parsed = result.data?.extraction as ParsedReceipt | undefined;
    return {
      parsed: parsed ?? EMPTY_RECEIPT,
      capturedAtLabel: capturedAtLabelFrom(result.data?.createdAt),
    };
  }, [result.fixture, result.data]);
}

function ReceiptSurface({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const session = useResolvedTab(publicToken);
  const tabId = session.status === "ready" ? session.tabId : null;

  const [importId, setImportId] = useState<string | null>(null);
  const { parsed, capturedAtLabel } = useReceiptData(importId);

  const useSampleReceipt = useLiveMutation(api.receipts.useSampleReceipt);
  const confirmReceipt = useLiveMutation(api.receipts.confirmReceipt);

  /*
   * §1.5 requires the Confirm action pinned, and it cannot pin from inside
   * `ReceiptReview`: `AppShell`'s content column sets `overflow-x: hidden`,
   * which makes it a scroll container, so any `position: sticky` descendant is
   * inert. `AppShell`'s `footer` slot is the element that actually pins, so the
   * route owns that element and the surface portals its action bar into it.
   */
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);

  /**
   * `api.receipts.confirmReceipt` re-checks reconciliation server-side and
   * rejects a shortfall, so the client never has the last word on the total.
   */
  const handleConfirm = useCallback(
    (lines: ParsedReceiptLine[], receiptTotalMinor: FiatMinor) => {
      const land = () => router.push(`/tabs/${publicToken}`);

      if (!confirmReceipt || !importId) {
        land();
        return;
      }

      void confirmReceipt({
        importId: importId as Id<"receiptImports">,
        lines: lines.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          unitPriceMinor: BigInt(line.unitPriceMinor),
        })),
        receiptTotalMinor: BigInt(receiptTotalMinor),
      })
        // Confirmed items become claimable, so the person lands on the Claim Board.
        .then(land)
        .catch(() => {
          /* The discrepancy card is already the surface's own rejection path. */
        });
    },
    [confirmReceipt, importId, router, publicToken],
  );

  const handleManualEntry = useCallback(() => {
    router.push("/tabs/new");
  }, [router]);

  /*
   * Demo affordance only — `ReceiptReview` renders the link behind
   * `isDemoModeEnabled()`, so off-demo this handler is unreachable.
   *
   * `api.receipts.useSampleReceipt` seeds the import server-side and returns its
   * id; the reactive `getImport` read then replaces the surface in place. With
   * no client it falls back to the remount, which reseeds the fixture and
   * discards edits — exactly what the affordance promises.
   */
  const [sampleNonce, setSampleNonce] = useState(0);
  const handleUseSampleReceipt = useCallback(() => {
    if (!useSampleReceipt || !tabId) {
      setSampleNonce((value) => value + 1);
      return;
    }
    void useSampleReceipt({ tabId: tabId as Id<"tabs"> })
      .then((seeded) => setImportId(seeded.importId))
      .catch(() => setSampleNonce((value) => value + 1));
  }, [useSampleReceipt, tabId]);

  return (
    <AppShell footer={<div ref={setFooterSlot} />}>
      <ReceiptReview
        key={sampleNonce}
        parsed={parsed}
        capturedAtLabel={capturedAtLabel}
        onConfirm={handleConfirm}
        onManualEntry={handleManualEntry}
        onUseSampleReceipt={handleUseSampleReceipt}
        footerSlot={footerSlot}
      />
    </AppShell>
  );
}

/** Receipt Review — `/tabs/[publicToken]/receipt` (POLISH-SPEC §1.5). */
export default function ReceiptPage({ params }: ReceiptPageProps) {
  const { publicToken } = use(params);

  return (
    <AuthGate>
      <ReceiptSurface publicToken={publicToken} />
    </AuthGate>
  );
}
