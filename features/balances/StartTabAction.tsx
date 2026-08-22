"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_ELEVATION } from "@/lib/theme/tokens";
import { useReducedMotion } from "@/components/primitives/use-reduced-motion";

export type StartTabGroup = { id: string; name: string; memberCount: number };

function monogram(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

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
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!open) {
      return;
    }
    sheetRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

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
        <div
          role="presentation"
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 32, 56, 0.32)",
            zIndex: 40,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Start a tab in"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "390px",
              background: MYTAB_COLORS.surface,
              borderTopLeftRadius: MYTAB_RADIUS.lg,
              borderTopRightRadius: MYTAB_RADIUS.lg,
              boxShadow: MYTAB_ELEVATION.sheetShadow,
              paddingBottom: "calc(16px + var(--app-pad-bottom, 0px))",
              outline: "none",
              animation: reduceMotion ? undefined : "mytab-sheet-in 240ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: "36px",
                height: "4px",
                borderRadius: MYTAB_RADIUS.full,
                background: MYTAB_COLORS.borderStrong,
                margin: "8px auto 4px",
              }}
            />
            <h2
              className="mytab-type-micro-label"
              style={{ margin: "12px 16px 10px" }}
            >
              Start a tab in
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => go(group.id)}
                    className="mytab-row"
                    style={{
                      width: "100%",
                      minHeight: "56px",
                      display: "grid",
                      gridTemplateColumns: "32px minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: "12px",
                      padding: "0 16px",
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
          </div>
        </div>
      ) : null}
    </>
  );
}
