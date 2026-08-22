"use client";

import { useReducedMotion } from "@/components/primitives/use-reduced-motion";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";

export const PROVISIONING_SWEEP_KEYFRAMES = `
  @keyframes mytab-you-provisioning-sweep {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(320%); }
  }
`;

/**
 * The Launch track, reused while Privy creates the embedded wallet.
 * Not an error: no warning colour, no retry (POLISH-SPEC §3.4).
 * Under reduce-motion the sweep is a static segment at the left of the track.
 */
export function ProvisioningSweep() {
  const reducedMotion = useReducedMotion();

  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        marginTop: "8px",
        width: "108px",
        height: "3px",
        borderRadius: MYTAB_RADIUS.full,
        background: MYTAB_COLORS.border,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "34px",
          height: "3px",
          borderRadius: MYTAB_RADIUS.full,
          background: MYTAB_COLORS.primary,
          animation: reducedMotion
            ? undefined
            : "mytab-you-provisioning-sweep 1.25s ease-in-out infinite",
        }}
      />
    </span>
  );
}
