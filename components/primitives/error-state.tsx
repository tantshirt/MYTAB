"use client";

import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_SPACING, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { STATE_COPY } from "./state-copy";

export type ErrorStateAction = {
  label: string;
  onPress?: () => void;
  href?: string;
};

export type ErrorStateProps = {
  /** The failure, naming its next action in the same breath (§4.0 rule 1). */
  headline: string;
  /** Up to two actions. The first is the retry. */
  actions?: ErrorStateAction[];
  /** Shorthand for a single "Try again". */
  onRetry?: () => void;
};

/**
 * §4.3 — an **inline block in the flow**, never a modal and never a toast.
 * `colors/surface` card, 1px `colors/border`, `rounded/md`, `spacing/5`
 * padding; headline `body` `colors/ink`; the retry as a 44px `colors/primary`
 * text action beneath. Semantic colour at *text* weight only — never a filled
 * red panel.
 */
export function ErrorState({ headline, actions, onRetry }: ErrorStateProps) {
  const resolved: ErrorStateAction[] =
    actions ?? (onRetry ? [{ label: STATE_COPY.retry, onPress: onRetry }] : []);

  return (
    <div
      role="alert"
      style={{
        background: MYTAB_COLORS.surface,
        border: `1px solid ${MYTAB_COLORS.border}`,
        borderRadius: MYTAB_RADIUS.md,
        padding: MYTAB_SPACING["5"],
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: MYTAB_TYPOGRAPHY.body.size,
          fontWeight: 500,
          letterSpacing: MYTAB_TYPOGRAPHY.body.tracking,
          color: MYTAB_COLORS.ink,
        }}
      >
        {headline}
      </p>
      {resolved.length > 0 ? (
        <div style={{ display: "flex", gap: "20px", marginTop: "4px" }}>
          {resolved.map((action) =>
            action.href ? (
              <a
                key={action.label}
                href={action.href}
                className="mytab-focus"
                style={ACTION_STYLE}
              >
                {action.label}
              </a>
            ) : (
              <button
                key={action.label}
                type="button"
                onClick={action.onPress}
                className="mytab-focus"
                style={{ ...ACTION_STYLE, border: "none", background: "transparent" }}
              >
                {action.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

const ACTION_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "44px",
  padding: 0,
  color: MYTAB_COLORS.primary,
  fontSize: MYTAB_TYPOGRAPHY.body.size,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
} as const;
