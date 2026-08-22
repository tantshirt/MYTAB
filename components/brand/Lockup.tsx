import type { CSSProperties } from "react";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

export type LockupTone = "ink" | "paper";

type LockupProps = {
  /** Wordmark size in px. The mark scales with it — never sized independently. */
  size?: number;
  tone?: LockupTone;
  style?: CSSProperties;
};

/**
 * The My Tab lockup: mark left, wordmark right, as one object.
 *
 * Two decisions carry it (POLISH-SPEC rev 3):
 *
 *  - The mark is `0.95em` against a cap height of roughly `0.72em`, so it
 *    overshoots the word top and bottom. It reads level; measuring it level
 *    would make it look small.
 *  - Over a photograph the mark is MONOCHROME. The two-colour mark is correct
 *    on paper, where the blue tear is a colour boundary; over an image it reads
 *    as a sticker, and the blue is reserved for actions on the paper canvas.
 */
export function Lockup({ size = 32, tone = "ink", style }: LockupProps) {
  const paper = tone === "paper";
  const body = paper ? "#FFFFFF" : MYTAB_COLORS.ink;
  const tear = paper ? "#FFFFFF" : MYTAB_COLORS.primary;

  return (
    <span
      role="img"
      aria-label="My Tab"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.30em",
        fontFamily: "var(--mytab-font-wordmark)",
        fontSize: `${size}px`,
        fontWeight: 600,
        letterSpacing: "-0.032em",
        lineHeight: 1,
        color: body,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        style={{ width: "0.95em", height: "0.95em", flex: "none", display: "block" }}
      >
        <path
          fill={body}
          fillRule="evenodd"
          d="M6 5a1.5 1.5 0 0 1 1.5-1.5h9a1.5 1.5 0 0 1 1.5 1.5V17H6zM8 7.5h6v2H8zM8 11.5h8v2H8z"
        />
        <path fill={tear} d="M6 18h12v3.5l-2-2-2 2-2-2-2 2-2-2-2 2z" />
      </svg>
      <span aria-hidden="true">My Tab</span>
    </span>
  );
}
