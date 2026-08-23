"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveQuery } from "@/features/convex/useConvexData";
import type { ParsedReceipt } from "@/lib/domain/receiptParse";
import { fiatMinorFromInteger } from "@/lib/domain/money";

export type ReceiptImportStatus =
  | "ticketed"
  | "uploaded"
  | "extracting"
  | "needs_review"
  | "confirmed"
  | "failed"
  | "rejected"
  | "deleted";

export type ReceiptData = {
  /** The import this surface is reviewing, once one exists. */
  importId: string | null;
  parsed: ParsedReceipt;
  status: ReceiptImportStatus | null;
  failureCode?: string;
  /** Right of the merchant in the header strip. Absent when the import has no date. */
  capturedAtLabel?: string;
};

const ZERO = fiatMinorFromInteger(0);

/** Nothing extracted yet — an honest empty receipt, never a stand-in over live data. */
export const EMPTY_RECEIPT: ParsedReceipt = {
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
 * Live reads:
 *   `api.receipts.latestImportForTab({ tabId })` — resolves the subject, because
 *     this route is keyed on a tab and a cold load has no import id of its own.
 *   `api.receipts.getImport({ importId })`       — the session's own import,
 *     once `finalizeUpload` has returned one, which supersedes the cold read.
 *
 * The import document stores the already-parsed extraction
 * (`validateAndParseExtraction(...).parsed`), so `extraction` *is* a
 * `ParsedReceipt`.
 *
 * With nothing to read the receipt is empty, which the surface renders as
 * §4.2's "Add what you ordered." with "Add items manually". A receipt is a list
 * of what someone actually ate; there is no version of it worth inventing.
 */
export function useReceiptData(
  tabId: string | null,
  sessionImportId: string | null,
): ReceiptData {
  const latest = useLiveQuery(
    api.receipts.latestImportForTab,
    tabId && !sessionImportId ? { tabId: tabId as Id<"tabs"> } : "skip",
  );
  const session = useLiveQuery(
    api.receipts.getImport,
    sessionImportId ? { importId: sessionImportId as Id<"receiptImports"> } : "skip",
  );

  return useMemo<ReceiptData>(() => {
    const view = session.data ?? latest.data ?? null;
    const parsed = view?.extraction as ParsedReceipt | undefined;

    return {
      importId: view?._id ?? sessionImportId,
      parsed: parsed ?? EMPTY_RECEIPT,
      status: (view?.status as ReceiptImportStatus | undefined) ?? null,
      failureCode: view?.failureCode,
      capturedAtLabel: capturedAtLabelFrom(view?.createdAt),
    };
  }, [session.data, latest.data, sessionImportId]);
}
