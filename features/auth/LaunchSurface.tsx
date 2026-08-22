"use client";

import { Lockup } from "@/components/brand/Lockup";
import { LAUNCH_LQIP } from "@/lib/theme/launchImagery";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

const LAUNCH_COPY = "Getting your tab ready…";

/**
 * Launch — the one surface where a photograph is allowed.
 *
 * DESIGN.md keeps photography off every money surface; this screen has no money
 * on it, and the warmth the cool-paper system withholds from the ledger belongs
 * here. Composition (POLISH-SPEC rev 3):
 *
 *  - The lockup sits at OPTICAL centre — 44% of the height, not 50%. A mark at
 *    true centre reads slightly low.
 *  - It is centred on the same axis as the app's 390px content column, so it is
 *    still on the app's grid rather than floating.
 *  - The track and copy drop to the foot. Identity holds the frame; a status
 *    stays subordinate. Stacking both in one clump is what makes a splash
 *    read as generic.
 *
 * EXPERIENCE.md's contract is unchanged: wordmark, indeterminate indicator,
 * "Getting your tab ready…". No buttons, no login affordance, no elapsed timer.
 */
export function LaunchSurface() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      style={{
        position: "relative",
        minHeight: "var(--app-height, 100dvh)",
        overflow: "hidden",
        background: MYTAB_COLORS.ink,
        fontFamily: "var(--mytab-font-family)",
        isolation: "isolate",
      }}
    >
      {/*
        LQIP paints first so the scrim never composites over an empty box, then
        the real frame arrives on top of it. `eager` + `high` because this is the
        first paint of the app, not a below-the-fold image.
      */}
      <picture>
        <source srcSet="/launch/launch.avif" type="image/avif" />
        <source srcSet="/launch/launch.webp" type="image/webp" />
        <img
          src="/launch/launch.webp"
          alt=""
          aria-hidden="true"
          decoding="async"
          loading="eager"
          fetchPriority="high"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            backgroundImage: `url("${LAUNCH_LQIP.launch}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      </picture>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(10,32,56,0.40) 0%, rgba(10,32,56,0.16) 34%, rgba(10,32,56,0.52) 72%, rgba(10,32,56,0.90) 100%)",
        }}
      />

      {/* Optical centre: 88% of the height, centred — lands the lockup at ~44%. */}
      <div
        style={{
          position: "absolute",
          insetInline: 0,
          top: "var(--app-pad-top, 0px)",
          height: "88%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 16px",
        }}
      >
        <Lockup size={32} tone="paper" />
      </div>

      <div
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          padding: "0 16px calc(34px + var(--app-pad-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          role="progressbar"
          aria-label="Loading"
          style={{
            width: "96px",
            height: "3px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.24)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "30px",
              height: "100%",
              borderRadius: "999px",
              background: "#FFFFFF",
              animation: "mytab-launch-sweep 1.5s cubic-bezier(0.5, 0, 0.5, 1) infinite",
            }}
          />
        </div>
        <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.74)" }}>
          {LAUNCH_COPY}
        </p>
      </div>

      <style>{`
        @keyframes mytab-launch-sweep {
          0% { transform: translateX(-30px); }
          100% { transform: translateX(96px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="progressbar"] > div {
            animation: none;
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}

export const launchSurfaceCopy = LAUNCH_COPY;
