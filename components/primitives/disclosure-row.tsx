"use client";

import { useState, type ReactNode } from "react";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_SPACING, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { ChevronGlyph } from "./glyphs";
import { ListRow } from "./list-row";
import { useReducedMotion } from "./use-reduced-motion";

export type DisclosureRowProps = {
  /** Stable id — the panel is `aria-controls`ed by the row. */
  id: string;
  label: string;
  /** Second line on the row itself, always visible. */
  value?: string;
  /** Panel contents. Rendered on `colors/paper`, `meta`, and hidden — never unmounted. */
  children: ReactNode;
};

/**
 * `disclosure-row` from the DESIGN.md inventory: full-width row, `body` label,
 * chevron right, contents `meta` on `colors/paper`.
 * Collapsed on every open — it never remembers (POLISH-SPEC §3.2).
 */
export function DisclosureRow({ id, label, value, children }: DisclosureRowProps) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  return (
    <div>
      <ListRow
        label={label}
        sub={value}
        ariaExpanded={open}
        ariaControls={id}
        onPress={() => setOpen((previous) => !previous)}
        trailing={
          <ChevronGlyph
            style={{
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: reducedMotion ? undefined : "transform 140ms ease",
            }}
          />
        }
      />
      <div id={id} hidden={!open} style={{ padding: `0 ${MYTAB_SPACING["4"]} ${MYTAB_SPACING["4"]}` }}>
        <div
          style={{
            background: MYTAB_COLORS.paper,
            borderRadius: MYTAB_RADIUS.sm,
            padding: MYTAB_SPACING["4"],
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            fontWeight: MYTAB_TYPOGRAPHY.meta.weight,
            lineHeight: 1.5,
            color: MYTAB_COLORS.inkMuted,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
