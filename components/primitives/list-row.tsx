"use client";

import type { CSSProperties, ReactNode } from "react";
import { MYTAB_COLORS, MYTAB_SPACING, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

/** Every row in a `ListCard` is this height — comfortably over the 44px touch floor. */
export const LIST_ROW_MIN_HEIGHT = "56px";

export type ListRowProps = {
  /** Leading text. One line, ellipsed — a name never pushes the trailing slot off the edge. */
  label: string;
  /** Second line beneath the label. Wraps; never ellipsed, because it can carry a reason. */
  sub?: ReactNode;
  /** Colour override for the sub line (state copy uses `settled`, `owed`, `ink-muted`). */
  subColor?: string;
  /** Renders the sub line in the monospace face with tabular figures. */
  subMonospace?: boolean;
  /** Lets the sub line be selected — used only for the copy-failure window. */
  subSelectable?: boolean;
  /** Right-hand slot: a chevron, a copy glyph, anything that must never shrink. */
  trailing?: ReactNode;
  onPress?: () => void;
  href?: string;
  /** Opens `href` in a new tab. Ignored when the row is a button. */
  external?: boolean;
  disabled?: boolean;
  /** Overrides the accessible name so a screen reader hears the label, not the value. */
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  style?: CSSProperties;
};

const LABEL_STYLE: CSSProperties = {
  fontSize: MYTAB_TYPOGRAPHY.body.size,
  fontWeight: 500,
  letterSpacing: MYTAB_TYPOGRAPHY.body.tracking,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * The one row shape shared by every list on a settings-style surface
 * (POLISH-SPEC §3.1: rows separated by hairlines inside one card).
 */
export function ListRow({
  label,
  sub,
  subColor = MYTAB_COLORS.inkMuted,
  subMonospace = false,
  subSelectable = false,
  trailing,
  onPress,
  href,
  external = false,
  disabled = false,
  ariaLabel,
  ariaExpanded,
  ariaControls,
  style,
}: ListRowProps) {
  const interactive = !disabled && (Boolean(onPress) || Boolean(href));

  const boxStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: MYTAB_SPACING["3"],
    width: "100%",
    minHeight: LIST_ROW_MIN_HEIGHT,
    padding: MYTAB_SPACING["4"],
    margin: 0,
    background: "transparent",
    border: "none",
    borderRadius: 0,
    textAlign: "left",
    textDecoration: "none",
    fontFamily: "inherit",
    color: MYTAB_COLORS.ink,
    cursor: interactive ? "pointer" : disabled ? "not-allowed" : "default",
    ...style,
  };

  const body = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            ...LABEL_STYLE,
            display: "block",
            color: disabled ? MYTAB_COLORS.inkMuted : MYTAB_COLORS.ink,
          }}
        >
          {label}
        </span>
        {sub !== undefined && sub !== null ? (
          <span
            style={{
              display: "block",
              marginTop: "3px",
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              fontWeight: MYTAB_TYPOGRAPHY.meta.weight,
              lineHeight: 1.4,
              color: subColor,
              fontFamily: subMonospace
                ? "ui-monospace, SFMono-Regular, Menlo, monospace"
                : undefined,
              fontVariantNumeric: subMonospace ? "tabular-nums" : undefined,
              fontFeatureSettings: subMonospace ? '"tnum" 1' : undefined,
              userSelect: subSelectable ? "text" : "none",
              WebkitUserSelect: subSelectable ? "text" : "none",
            }}
          >
            {sub}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span
          aria-hidden="true"
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "44px",
            minHeight: "44px",
            marginRight: "-12px",
          }}
        >
          {trailing}
        </span>
      ) : null}
    </>
  );

  if (href && !disabled) {
    return (
      <a
        href={href}
        aria-label={ariaLabel}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        style={boxStyle}
      >
        {body}
      </a>
    );
  }

  if (onPress || ariaExpanded !== undefined || disabled) {
    return (
      <button
        type="button"
        onClick={onPress}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        style={boxStyle}
      >
        {body}
      </button>
    );
  }

  return <div style={boxStyle}>{body}</div>;
}
