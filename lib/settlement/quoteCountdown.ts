export const QUOTE_COUNTDOWN_WARNING_MS = 10_000;
export const QUOTE_COUNTDOWN_TICK_MS = 1_000;

export const QUOTE_COUNTDOWN_LABEL_PREFIX = "Quote refreshes in";
export const QUOTE_EXPIRED_LABEL = "Quote expired. Refresh it.";

/** Formats remaining quote seconds as m:ss for the Payment Sheet countdown (Story 3.7 AC4). */
export function formatQuoteCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Under ten seconds the countdown turns `warning` (EXPERIENCE, Money Legibility). */
export function isQuoteCountdownWarning(remainingMs: number): boolean {
  return remainingMs > 0 && remainingMs <= QUOTE_COUNTDOWN_WARNING_MS;
}

export function isQuoteExpired(remainingMs: number): boolean {
  return remainingMs <= 0;
}

export function formatQuoteCountdownLabel(remainingMs: number): string {
  if (isQuoteExpired(remainingMs)) return QUOTE_EXPIRED_LABEL;
  return `${QUOTE_COUNTDOWN_LABEL_PREFIX} ${formatQuoteCountdown(remainingMs)}`;
}

/**
 * Announcement buckets for the countdown's live region. A region that ticks
 * second by second is unusable, so the countdown only speaks when it crosses a
 * threshold: a minute left, thirty seconds, ten seconds, and expiry.
 */
export type QuoteCountdownBucket =
  | "quiet"
  | "one-minute"
  | "thirty-seconds"
  | "final-ten"
  | "expired";

export function quoteCountdownBucket(remainingMs: number): QuoteCountdownBucket {
  if (isQuoteExpired(remainingMs)) return "expired";
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds <= 10) return "final-ten";
  if (seconds <= 30) return "thirty-seconds";
  if (seconds <= 60) return "one-minute";
  return "quiet";
}

/** What to announce when the bucket changes, or `null` when nothing should be said. */
export function quoteCountdownAnnouncement(remainingMs: number): string | null {
  if (quoteCountdownBucket(remainingMs) === "quiet") return null;
  return formatQuoteCountdownLabel(remainingMs);
}
