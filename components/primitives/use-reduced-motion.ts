"use client";

import { useEffect, useState } from "react";

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Tracks the reduce-motion preference (POLISH-SPEC §3.4, §5.5).
 * Returns `false` on the server so the first paint never depends on a media query.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(REDUCE_MOTION_QUERY);
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
