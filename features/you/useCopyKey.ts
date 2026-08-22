"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CopyStatus = "idle" | "copied" | "failed";

const COPIED_MS = 1600;
const FAILED_MS = 2400;

/**
 * Copy-to-clipboard with the in-place confirmation the surface shows instead of a
 * toast (POLISH-SPEC §3.2). Toast stacks are banned.
 */
export function useCopyKey(): { status: CopyStatus; copy: (value: string) => void } {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const settle = useCallback((next: Exclude<CopyStatus, "idle">) => {
    setStatus(next);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(
      () => setStatus("idle"),
      next === "copied" ? COPIED_MS : FAILED_MS,
    );
  }, []);

  const copy = useCallback(
    (value: string) => {
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (!clipboard || typeof clipboard.writeText !== "function") {
        settle("failed");
        return;
      }
      clipboard
        .writeText(value)
        .then(() => settle("copied"))
        .catch(() => settle("failed"));
    },
    [settle],
  );

  return { status, copy };
}

/** First four, ellipsis, last four — the key is a value, never a headline. */
export function elideWalletKey(publicKey: string): string {
  if (publicKey.length <= 9) {
    return publicKey;
  }
  return `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`;
}
