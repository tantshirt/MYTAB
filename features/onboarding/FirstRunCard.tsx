"use client";

import { useCallback, useEffect, useState } from "react";
import { Lockup } from "@/components/brand/Lockup";
import { LAUNCH_LQIP } from "@/lib/theme/launchImagery";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

const SEEN_KEY = "mytab:first-run:v1";

/**
 * First run — one card, on true first open, never again.
 *
 * It exists to make an impression, not to explain anything: the product's whole
 * claim is that there is nothing to set up, so this must never stand between a
 * person and their bill. One button, and it is gone for good.
 *
 * The action is PAPER, not blue. Blue on a photograph is the one element that
 * clearly did not come from the image; `paper` is the exact canvas colour of
 * every screen behind this one, so the button reads as the app arriving rather
 * than a control dropped onto a picture. See DESIGN.md § Colors.
 */
export function hasSeenFirstRun(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Private mode, blocked site data — treat as seen rather than showing it
    // on every open, which would be far worse than never showing it.
    return true;
  }
}

export function markFirstRunSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* nothing to recover — the card simply may appear again */
  }
}

export function FirstRunCard({ onDismiss }: { onDismiss?: () => void }) {
  const [leaving, setLeaving] = useState(false);

  const dismiss = useCallback(() => {
    markFirstRunSeen();
    setLeaving(true);
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismiss]);

  if (leaving) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to My Tab"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        overflow: "hidden",
        background: MYTAB_COLORS.ink,
        fontFamily: "var(--mytab-font-family)",
      }}
    >
      <picture>
        <source srcSet="/launch/first-run.avif" type="image/avif" />
        <source srcSet="/launch/first-run.webp" type="image/webp" />
        <img
          src="/launch/first-run.webp"
          alt=""
          aria-hidden="true"
          decoding="async"
          loading="eager"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            backgroundImage: `url("${LAUNCH_LQIP["first-run"]}")`,
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
            "linear-gradient(180deg, rgba(10,32,56,0.26) 0%, rgba(10,32,56,0) 22%, rgba(10,32,56,0.58) 48%, rgba(10,32,56,0.97) 74%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          padding: "0 20px calc(30px + var(--app-pad-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "13px",
          color: "#FFFFFF",
        }}
      >
        <Lockup size={18} tone="paper" style={{ opacity: 0.88 }} />
        <h1
          style={{
            margin: 0,
            fontSize: "25px",
            fontWeight: 600,
            letterSpacing: "-0.028em",
            textWrap: "balance",
          }}
        >
          Split it at the table.
        </h1>
        {/* Held to ~30 characters a line — short lines are what let centred copy read. */}
        <p
          style={{
            margin: 0,
            maxWidth: "30ch",
            fontSize: "14px",
            lineHeight: 1.55,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          Everyone claims what they ordered, on their own phone. My&nbsp;Tab works out
          the exact share.
        </p>
        <button
          type="button"
          onClick={dismiss}
          autoFocus
          style={{
            width: "100%",
            minHeight: "48px",
            marginTop: "6px",
            border: "none",
            borderRadius: "10px",
            background: MYTAB_COLORS.paper,
            color: MYTAB_COLORS.ink,
            fontFamily: "var(--mytab-font-family)",
            fontSize: "15px",
            fontWeight: 600,
            letterSpacing: "-0.006em",
            boxShadow: "inset 0 -1px 0 rgba(10,32,56,0.16)",
            cursor: "pointer",
          }}
        >
          Start
        </button>
      </div>
    </div>
  );
}
