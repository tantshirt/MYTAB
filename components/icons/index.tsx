import type { ReactElement, ReactNode, SVGProps } from "react";
import { ACTIVITY_EVENT_TYPE, type ActivityEventType } from "@/lib/domain/activityTypes";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  /** Rendered edge length in px. The 24x24 viewBox never changes, so the
   *  1.75 stroke scales with it — no per-size stroke compensation anywhere. */
  size?: number;
};

/**
 * My Tab UI icon set (DESIGN.md is the visual authority).
 *
 * Every icon is a 24x24 viewBox, `stroke-width="1.75"`, round caps and joins,
 * `fill="none"`, and inherits `currentColor` from its row. Colour is applied by
 * the caller — an icon never carries a token of its own.
 *
 * Icons are decorative by default (`aria-hidden`). Pass `aria-hidden={false}`
 * and an `aria-label` for the rare icon that is the only carrier of meaning.
 */
function Icon({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The tab list. The receipt silhouette from the approved artboards. */
export function TabsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3h14a1 1 0 0 1 1 1v16l-4-2-4 2-4-2-4 2V4a1 1 0 0 1 1-1z" />
      <path d="M8 8h8M8 12h5" />
    </Icon>
  );
}

/** The tab list — active tab-bar state. */
export function TabsFilledIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" fillRule="evenodd" d="M5 3h14a1 1 0 0 1 1 1v16l-4-2-4 2-4-2-4 2V4a1 1 0 0 1 1-1zM8 7h8v2H8zM8 11h5v2H8z" />
    </Icon>
  );
}

/** The event feed. Pulse line from the approved artboards. */
export function ActivityIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </Icon>
  );
}

/** The event feed — active tab-bar state. */
export function ActivityFilledIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeWidth="2.75" d="M3 12h4l2-6 4 12 2-6h6" />
    </Icon>
  );
}

/** The viewer's own screen. People are circles. */
export function YouIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-3.5 3-6 7.5-6s7.5 2.5 7.5 6" />
    </Icon>
  );
}

/** The viewer's own screen — active tab-bar state. */
export function YouFilledIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" fill="currentColor" stroke="none" />
      <path fill="currentColor" stroke="none" d="M4.5 20c0-3.5 3-6 7.5-6s7.5 2.5 7.5 6z" />
    </Icon>
  );
}

/** Back. */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 18l-6-6 6-6" />
    </Icon>
  );
}

/** Forward; the trailing affordance on a navigating row. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

/** Expand a disclosure. */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

/** PAYMENT you sent. Arrow up-right. */
export function PaymentSentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17L17 7" />
      <path d="M9.5 7H17v7.5" />
    </Icon>
  );
}

/** PAYMENT you received. Arrow down-left. */
export function PaymentReceivedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 7L7 17" />
      <path d="M14.5 17H7V9.5" />
    </Icon>
  );
}

/** CLAIM / CLAIM_RELEASE. A check ringed like an avatar — a person took this item. */
export function ClaimIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5.5" />
    </Icon>
  );
}

/** WAIVER. A share written off — the ring with the line through it, not a cross. */
export function WaiverIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h8" />
    </Icon>
  );
}

/** CASH_PROPOSED / CASH_ACKNOWLEDGED. A banknote — no coin, no currency symbol, no token. */
export function CashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </Icon>
  );
}

/** Confirmed, settled, all square. */
export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Icon>
  );
}

/** Needs a human: unassigned items, a discrepancy, an expiring quote. */
export function AlertTriangleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.5L3 20h18z" />
      <path d="M12 10v4M12 17.5h.01" />
    </Icon>
  );
}

/** Pending or in flight. */
export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.5 2" />
    </Icon>
  );
}

/** TAB_LOCK — the bill is locked and claims are closed. */
export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Icon>
  );
}

/** Receipt capture. A camera and nothing else — no sparkle, no wand, no robot. */
export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="7" width="19" height="13" rx="2.5" />
      <path d="M8.5 7L10 4.5h4L15.5 7" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Icon>
  );
}

/** Start a tab, add an item. */
export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** ITEM_EDIT — correct a scanned line. */
export function EditIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L20 8l-4-4L4 16v4z" />
      <path d="M14 6l4 4" />
    </Icon>
  );
}

/** Send the tab back into the chat. */
export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 15V3M12 3L8 7M12 3l4 4" />
    </Icon>
  );
}

/**
 * Activity glyph per event kind, 1:1 with `ACTIVITY_EVENT_TYPE`. Semantic colour
 * never travels alone (PRODUCT.md accessibility floor), so the row's tint from
 * `activityIconTint` is always paired with the glyph below and a word.
 */
export const ACTIVITY_ICON: Record<ActivityEventType, (props: IconProps) => ReactElement> = {
  [ACTIVITY_EVENT_TYPE.CLAIM]: ClaimIcon,
  [ACTIVITY_EVENT_TYPE.CLAIM_RELEASE]: ClaimIcon,
  [ACTIVITY_EVENT_TYPE.ITEM_EDIT]: EditIcon,
  [ACTIVITY_EVENT_TYPE.TAB_LOCK]: LockIcon,
  [ACTIVITY_EVENT_TYPE.PAYMENT]: PaymentSentIcon,
  [ACTIVITY_EVENT_TYPE.WAIVER]: WaiverIcon,
  [ACTIVITY_EVENT_TYPE.CASH_PROPOSED]: CashIcon,
  [ACTIVITY_EVENT_TYPE.CASH_ACKNOWLEDGED]: CashIcon,
  [ACTIVITY_EVENT_TYPE.TAB_CREATED]: TabsIcon,
  [ACTIVITY_EVENT_TYPE.RECEIPT_CONFIRMED]: CheckIcon,
};
