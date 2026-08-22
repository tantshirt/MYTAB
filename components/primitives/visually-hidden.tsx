"use client";

import type { ReactNode } from "react";

/**
 * Text for screen readers only.
 *
 * Used wherever a state is carried visually by a dot or a tint: semantic colour
 * never travels alone (EXPERIENCE, *Accessibility Floor*), and the word has to
 * exist even when the visual design has no room to print it.
 *
 * The clip itself is `.mytab-visually-hidden` in `lib/theme/globalStyles.ts` —
 * one definition, so a call site cannot drift from it.
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="mytab-visually-hidden">{children}</span>;
}
