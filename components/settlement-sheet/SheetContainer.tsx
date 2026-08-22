"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useReducedMotion } from "@/components/primitives/use-reduced-motion";
import {
  MYTAB_COLORS,
  MYTAB_ELEVATION,
  MYTAB_LAYOUT,
  MYTAB_RADIUS,
} from "@/lib/theme/tokens";

/** POLISH-SPEC §5.4 — present, dismiss, drag and release. */
const PRESENT_MS = 280;
const DISMISS_MS = 220;
const DRAG_DISMISS_MS = 200;
const SCRIM_IN_MS = 200;
const SCRIM_OUT_MS = 160;
const SHEET_CURVE = "cubic-bezier(0.32, 0.72, 0, 1)";
const DISMISS_TRAVEL_PX = 96;
const DISMISS_VELOCITY_PX_PER_MS = 0.5;
/** Upward drag is resisted rather than blocked, so the sheet still feels held. */
const UPWARD_RESISTANCE = 0.55;
/** Below this the gesture is still a tap, and the control underneath must get its click. */
const DRAG_START_PX = 6;

const SCRIM = "rgba(10, 32, 56, 0.38)";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export type SheetContainerProps = {
  /** Accessible name for the dialog. */
  label: string;
  /**
   * False once the sheet has committed. Scrim tap, swipe-down and Escape are all
   * unbound together — EXPERIENCE: "dismissible … only before Pay is tapped".
   */
  dismissible?: boolean;
  /** Called after the dismiss transition has played. Required when `dismissible`. */
  onDismiss?: () => void;
  children: ReactNode;
};

type DragState = {
  pointerId: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
};

/**
 * The bottom sheet shell: scrim, `rounded/lg` top corners, grab handle, soft shadow,
 * drag-to-dismiss, focus trap, Escape, and a scroll lock on the surface behind it
 * (DESIGN.md `payment-sheet`; POLISH-SPEC §1.8, §5.4).
 *
 * Present and dismiss are gesture continuation, not decoration: a draggable object has
 * to resolve its transform somehow. Under reduce-motion the sheet appears and disappears
 * instantly and a release snaps rather than eases — the drag itself still works.
 */
export function SheetContainer({
  label,
  dismissible = true,
  onDismiss,
  children,
}: SheetContainerProps) {
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [exitMs, setExitMs] = useState(DISMISS_MS);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);

  // Present on the frame after mount so the browser has an initial transform to move from.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(
    () => () => {
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    },
    [],
  );

  // The surface behind a sheet does not scroll. `overscroll-behavior: contain` on the
  // sheet's own scroller keeps a flick inside the sheet from chaining out to it either.
  useEffect(() => {
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  // Focus lands on the dialog itself rather than its first control, so the sheet is
  // announced before its contents are read.
  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  const requestDismiss = useCallback(
    (durationMs: number) => {
      if (!dismissible || !onDismiss) return;
      if (reduceMotion) {
        onDismiss();
        return;
      }
      setExitMs(durationMs);
      setLeaving(true);
      exitTimerRef.current = window.setTimeout(onDismiss, durationMs);
    },
    [dismissible, onDismiss, reduceMotion],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!dismissible) return;
        event.preventDefault();
        requestDismiss(DISMISS_MS);
        return;
      }
      if (event.key !== "Tab") return;

      const node = sheetRef.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [dismissible, requestDismiss]);

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);

    const travel = dragOffset ?? 0;
    const velocity = drag?.velocity ?? 0;
    if (travel > DISMISS_TRAVEL_PX || velocity > DISMISS_VELOCITY_PX_PER_MS) {
      setDragOffset(null);
      requestDismiss(DRAG_DISMISS_MS);
      return;
    }
    // Otherwise it springs back over 280ms on the same curve.
    setDragOffset(null);
  }, [dragOffset, requestDismiss]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const elapsed = event.timeStamp - drag.lastT;
      if (elapsed > 0) drag.velocity = (event.clientY - drag.lastY) / elapsed;
      drag.lastY = event.clientY;
      drag.lastT = event.timeStamp;

      const raw = event.clientY - drag.startY;
      if (Math.abs(raw) < DRAG_START_PX) return;
      setDragOffset(raw >= 0 ? raw : raw * UPWARD_RESISTANCE);
    };

    const onUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      endDrag();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, endDrag]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dismissible || leaving) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A swipe only becomes a dismiss when there is nothing left to scroll up to.
    if ((scrollRef.current?.scrollTop ?? 0) > 0) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
    };
    setDragging(true);
  };

  const presented = reduceMotion || entered;
  const transform = leaving
    ? "translateY(100%)"
    : dragOffset !== null
      ? `translateY(${dragOffset}px)`
      : presented
        ? "translateY(0)"
        : "translateY(100%)";

  const transformTransition =
    reduceMotion || dragging
      ? "none"
      : `transform ${leaving ? exitMs : PRESENT_MS}ms ${SHEET_CURVE}`;

  const sheetStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: MYTAB_LAYOUT.maxColumnWidth,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    background: MYTAB_COLORS.surface,
    borderRadius: `${MYTAB_RADIUS.lg} ${MYTAB_RADIUS.lg} 0 0`,
    boxShadow: MYTAB_ELEVATION.sheetShadow,
    maxHeight: "calc(var(--app-height, 100dvh) - 64px)",
    // The 20px gutter lives on the scroller, not here, so a child can bleed to the
    // sheet's edges with a -20px margin without opening a horizontal scroll.
    padding: "10px 0 calc(22px + var(--app-pad-bottom, 0px))",
    transform,
    transition: transformTransition,
    touchAction: dismissible ? "pan-y" : undefined,
    outline: "none",
  };

  const scrimStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    border: "none",
    padding: 0,
    background: SCRIM,
    opacity: leaving ? 0 : presented ? 1 : 0,
    transition: reduceMotion
      ? "none"
      : `opacity ${leaving ? SCRIM_OUT_MS : SCRIM_IN_MS}ms linear`,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {dismissible ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => requestDismiss(DISMISS_MS)}
          style={{ ...scrimStyle, cursor: "pointer" }}
        />
      ) : (
        <div aria-hidden="true" style={scrimStyle} />
      )}

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        style={sheetStyle}
      >
        <div
          aria-hidden="true"
          style={{
            flex: "none",
            width: "36px",
            height: "4px",
            borderRadius: MYTAB_RADIUS.full,
            background: MYTAB_COLORS.border,
            margin: "0 auto 20px",
          }}
        />
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            padding: "0 20px",
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
