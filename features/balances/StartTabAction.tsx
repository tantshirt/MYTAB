"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SheetContainer } from "@/components/settlement-sheet/SheetContainer";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import { monogram } from "./monogram";

export type StartTabGroup = { id: string; name: string; memberCount: number };

/**
 * "Start a tab" — a bottom sheet, never a route (POLISH-SPEC §1.2).
 *
 *   0 verified groups → the caller renders the empty state instead; this never mounts.
 *   exactly 1        → skip the sheet entirely and go straight to the form.
 *   2 or more        → the picker sheet.
 *
 * `/groups/picker` was a 404 and is deliberately not built. Telegram also ships
 * `requestChat()` (Bot API 9.6+) for this; that is a later swap behind the same
 * call site.
 *
 * The sheet shell is `SheetContainer` — the one bottom-sheet implementation in the
 * product. The hand-rolled scrim, grab handle, Escape binding and `mytab-sheet-in`
 * animation that used to live here are gone; that last one referenced a keyframe
 * set that was never defined anywhere, so it had no effect either.
 */
export function StartTabAction({
  groups,
  className,
  children,
  style,
}: {
  groups: StartTabGroup[];
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const go = useCallback(
    (groupId: string) => {
      router.push(`/tabs/new?group=${encodeURIComponent(groupId)}`);
    },
    [router],
  );

  const onClick = useCallback(() => {
    if (groups.length === 1) {
      go(groups[0]!.id);
      return;
    }
    setOpen(true);
  }, [groups, go]);

  const close = useCallback(() => {
    setOpen(false);
    openerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={onClick}
        className={className}
        style={style}
        aria-haspopup={groups.length > 1 ? "dialog" : undefined}
        aria-expanded={groups.length > 1 ? open : undefined}
      >
        {children}
      </button>

      {open ? (
        <SheetContainer label="Start a tab in" onDismiss={close}>
          <h2 className="mytab-type-micro-label" style={{ margin: "0 0 10px" }}>
            Start a tab in
          </h2>
          {/* The rows bleed to the sheet's own edges past the scroller's 20px gutter. */}
          <ul style={{ listStyle: "none", margin: "0 -20px", padding: 0 }}>
            {groups.map((group) => (
              <li key={group.id}>
                <button
                  type="button"
                  onClick={() => go(group.id)}
                  className="mytab-row mytab-focus"
                  style={{
                    width: "100%",
                    minHeight: "56px",
                    display: "grid",
                    gridTemplateColumns: "32px minmax(0, 1fr) auto",
                    alignItems: "center",
                    gap: "12px",
                    padding: "0 20px",
                    background: "transparent",
                    border: "none",
                    borderTop: `1px solid ${MYTAB_COLORS.border}`,
                    textAlign: "left",
                    cursor: "pointer",
                    color: MYTAB_COLORS.ink,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: MYTAB_RADIUS.full,
                      background: MYTAB_COLORS.primarySoft,
                      color: MYTAB_COLORS.primary,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    {monogram(group.name)}
                  </span>
                  <span
                    className="mytab-type-body mytab-row__label"
                    style={{ fontWeight: 500 }}
                  >
                    {group.name}
                  </span>
                  <span className="mytab-type-meta" style={{ flex: "none", whiteSpace: "nowrap" }}>
                    {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContainer>
      ) : null}
    </>
  );
}
