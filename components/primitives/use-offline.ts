"use client";

import { useEffect, useState } from "react";

/**
 * Connectivity, for the one offline treatment in §4.4.
 *
 * Starts `false` on the server and on the first client render so the offline
 * bar is never part of the server-rendered document — it appears on the first
 * effect, which is the only honest moment to claim the network is gone.
 */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") {
      return;
    }
    const sync = () => setOffline(navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return offline;
}
