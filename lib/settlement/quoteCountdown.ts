/** Formats remaining quote seconds as m:ss for the Payment Sheet countdown (Story 3.7 AC4). */
export function formatQuoteCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function isQuoteCountdownWarning(remainingMs: number): boolean {
  return remainingMs > 0 && remainingMs <= 10_000;
}

export function isQuoteExpired(remainingMs: number): boolean {
  return remainingMs <= 0;
}
