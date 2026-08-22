"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { avatarTintForUserId } from "@/lib/theme/tokens";

export type ClaimantIdentity = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
};

/** POLISH-SPEC §5.1 — sanctioned animation #1. */
export const AVATAR_ARRIVAL_MS = 200;
const AVATAR_ARRIVAL_OPACITY_MS = 120;
const AVATAR_ARRIVAL_CURVE = "cubic-bezier(0.22, 1, 0.36, 1)";
const AVATAR_ARRIVAL_FROM = "scale(0.6) translateX(-6px)";

export type AvatarProps = {
  participant: ClaimantIdentity;
  /** Edge length in px. 24 in a presence stack, 22 in a claim row, 32 in a sheet. */
  size?: number;
  /**
   * The colour the avatar is punched out of. A stack reads as one object because
   * every bubble carries a 2px ring in its own background (DESIGN.md `presence-stack`).
   */
  ringColor?: string;
  /**
   * True when this avatar is arriving — a claimant id that was not in the list on the
   * previous render. Keyed by user id upstream, never by array index, so a parent
   * re-render cannot retrigger it (POLISH-SPEC §5.1).
   */
  arriving?: boolean;
  /** Hoisted to the board so one media query serves every bubble on the surface. */
  reducedMotion?: boolean;
  /**
   * The bubble's fill, from `avatarTintsForGroup` — the set-aware allocator that
   * guarantees everyone rendered together is a different colour. Omit only for a
   * genuinely lone avatar, which falls back to the per-id hash.
   */
  tint?: string;
};

/**
 * A person, as a circle. People are circles, money is rectangles (DESIGN.md, Shapes).
 *
 * Arrival is the load-bearing motion of the demo: several phones on one table, and
 * someone else's claim landing in front of you. Under reduce-motion the avatar simply
 * appears in place — the caption and the footer update identically either way, because
 * the numbers never wait for the motion.
 */
export function Avatar({
  participant,
  size = 24,
  ringColor,
  arriving = false,
  reducedMotion = false,
  tint,
}: AvatarProps) {
  const animate = arriving && !reducedMotion;
  const [settled, setSettled] = useState(!animate);

  useEffect(() => {
    if (settled) {
      return;
    }
    // One frame at the start state so the browser has something to move from.
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [settled]);

  const motion: CSSProperties = animate
    ? {
        transform: settled ? "scale(1) translateX(0)" : AVATAR_ARRIVAL_FROM,
        opacity: settled ? 1 : 0,
        transition: `transform ${AVATAR_ARRIVAL_MS}ms ${AVATAR_ARRIVAL_CURVE}, opacity ${AVATAR_ARRIVAL_OPACITY_MS}ms linear`,
      }
    : {};

  const base: CSSProperties = {
    width: size,
    height: size,
    flex: "none",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: ringColor ? `2px solid ${ringColor}` : undefined,
    ...motion,
  };

  if (participant.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Telegram photo URLs are remote and unoptimisable.
      <img
        src={participant.avatarUrl}
        alt=""
        aria-hidden
        width={size}
        height={size}
        data-enter={animate && !settled ? "" : undefined}
        style={{ ...base, objectFit: "cover" }}
      />
    );
  }

  const initial = participant.displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      aria-hidden
      data-enter={animate && !settled ? "" : undefined}
      style={{
        ...base,
        background: tint ?? avatarTintForUserId(participant.userId),
        color: "#fff",
        fontSize: Math.max(10, Math.round(size * 0.44)),
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
