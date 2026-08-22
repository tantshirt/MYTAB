import { describe, expect, it } from "vitest";
import {
  formatQuoteCountdown,
  formatQuoteCountdownLabel,
  isQuoteCountdownWarning,
  isQuoteExpired,
  quoteCountdownAnnouncement,
  quoteCountdownBucket,
} from "@/lib/settlement/quoteCountdown";

describe("quote countdown", () => {
  it("formats remaining time as m:ss", () => {
    expect(formatQuoteCountdown(42_000)).toBe("0:42");
    expect(formatQuoteCountdown(61_000)).toBe("1:01");
    expect(formatQuoteCountdown(0)).toBe("0:00");
  });

  it("turns warning under ten seconds only", () => {
    expect(isQuoteCountdownWarning(11_000)).toBe(false);
    expect(isQuoteCountdownWarning(10_000)).toBe(true);
    expect(isQuoteCountdownWarning(1)).toBe(true);
    expect(isQuoteCountdownWarning(0)).toBe(false);
  });

  it("names the expired state rather than going blank", () => {
    expect(isQuoteExpired(0)).toBe(true);
    expect(formatQuoteCountdownLabel(42_000)).toBe("Quote refreshes in 0:42");
    expect(formatQuoteCountdownLabel(0)).toBe("Quote expired. Refresh it.");
  });

  it("only announces at thresholds, never every second", () => {
    expect(quoteCountdownBucket(120_000)).toBe("quiet");
    expect(quoteCountdownAnnouncement(120_000)).toBeNull();
    expect(quoteCountdownAnnouncement(119_000)).toBeNull();

    expect(quoteCountdownBucket(60_000)).toBe("one-minute");
    expect(quoteCountdownBucket(59_000)).toBe("one-minute");
    expect(quoteCountdownBucket(30_000)).toBe("thirty-seconds");
    expect(quoteCountdownBucket(10_000)).toBe("final-ten");
    expect(quoteCountdownBucket(0)).toBe("expired");

    expect(quoteCountdownAnnouncement(10_000)).toBe("Quote refreshes in 0:10");
    expect(quoteCountdownAnnouncement(0)).toBe("Quote expired. Refresh it.");
  });
});
