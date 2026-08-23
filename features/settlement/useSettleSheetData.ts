"use client";

import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveAction } from "@/features/convex/useConvexData";
import { EMPTY_SETTLE_SHEET, mapObligationQuoteToSheet } from "./mapSettleSheet";
import type { SettleSheetData } from "./types";

export type { SettleSheetData };

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

  useEffect(() => {
    if (!getQuote || !obligationId) {
      setData(EMPTY_SETTLE_SHEET);
      return;
    }

    let cancelled = false;
    setData((current) => ({ ...current, status: current.status === "ready" ? "ready" : "loading" }));

    const load = () => {
      getQuote({ obligationId: obligationId as Id<"obligations"> })
        .then((quote) => {
          if (cancelled) {
            return;
          }
          setData(mapObligationQuoteToSheet(quote));
        })
        .catch(() => {
          if (!cancelled) {
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
