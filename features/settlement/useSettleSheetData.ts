"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveAction } from "@/features/convex/useConvexData";
import { EMPTY_SETTLE_SHEET, mapObligationQuoteToSheet } from "./mapSettleSheet";
import type { SettleSheetData } from "./types";

export type { SettleSheetData };

export const SETTLE_QUOTE_TIMEOUT_MS = 8_000;

export async function quoteWithTimeout<T>(
  request: Promise<T>,
  timeoutMs = SETTLE_QUOTE_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("SETTLE_QUOTE_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * Single prop-resolution point for the Payment Sheet.
 *
 * Reads `settlements.getObligationQuote`. Until a real quote exists — recipient
 * name, locked share, and `otherAmountThreshold` as the guarantee — the sheet
 * stays `unavailable` with `tokens: []`. It never invents amounts or a live Pay
 * button (D-08, D-11).
 */
export function useSettleSheetData(obligationId: string, refreshNonce = 0): SettleSheetData {
  const getQuote = useLiveAction(api.settlements.getObligationQuote);
  const [data, setData] = useState<SettleSheetData>({
    ...EMPTY_SETTLE_SHEET,
    status: getQuote ? "loading" : "unavailable",
  });
  const generation = useRef(0);

  useEffect(() => {
    if (!getQuote || !obligationId) {
      setData(EMPTY_SETTLE_SHEET);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    generation.current += 1;
    const effectGeneration = generation.current;
    // An obligation is the authorization and pricing boundary. Never retain a
    // payable intent, token, or amount from the previous obligation while the
    // new one is loading.
    setData({ ...EMPTY_SETTLE_SHEET, status: "loading" });

    const load = () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      const request = getQuote({ obligationId: obligationId as Id<"obligations"> });
      // A timed-out action cannot be aborted, so keep this polling generation
      // single-flight until the underlying request settles. The Retry control
      // changes refreshNonce and starts a fresh generation immediately.
      void request.finally(() => {
        inFlight = false;
      }).catch(() => undefined);
      quoteWithTimeout(request)
        .then((quote) => {
          if (cancelled || generation.current !== effectGeneration) {
            return;
          }
          setData(mapObligationQuoteToSheet(quote));
        })
        .catch(() => {
          if (!cancelled && generation.current === effectGeneration) {
            setData(EMPTY_SETTLE_SHEET);
          }
        });
    };

    load();
    const interval = window.setInterval(load, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [getQuote, obligationId, refreshNonce]);

  return data;
}
