"use client";

import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useLiveAction } from "@/features/convex/useConvexData";
import type { YouMoveReceived } from "./types";

export function useWalletMoveOffer(refreshNonce = 0): YouMoveReceived {
  const getOffer = useLiveAction(api.wallets.getWalletMoveOffer);
  const [offer, setOffer] = useState<YouMoveReceived>({ visible: false });

  useEffect(() => {
    if (!getOffer) {
      setOffer({ visible: false });
      return;
    }
    let cancelled = false;
    void getOffer({}).then((row) => {
      if (cancelled) {
        return;
      }
      if (!row) {
        setOffer({ visible: false });
        return;
      }
      setOffer({
        visible: true,
        amountLabel: row.amountLabel,
        destinationLabel: row.destinationLabel,
      });
    }).catch(() => {
      if (!cancelled) {
        setOffer({ visible: false });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getOffer, refreshNonce]);

  return offer;
}
