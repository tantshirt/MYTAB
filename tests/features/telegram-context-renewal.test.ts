import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TELEGRAM_CONTEXT_TTL_MS } from "@/lib/telegram/verify";

/**
 * The server context is what every mutation is gated on via
 * `requireTabParticipant`. It expires after TELEGRAM_CONTEXT_TTL_MS.
 *
 * The hook used to post exactly once, guarded by `lastInitData === initData` —
 * but `initData` is constant for a launch, so nothing ever re-posted. Five
 * minutes into a meal every write began failing while reads kept working: the
 * bill on screen, and claiming an item silently doing nothing.
 */
const source = readFileSync("features/telegram/useTelegramBootstrap.ts", "utf8");

describe("Telegram context renewal", () => {
  it("REGRESSION: does not gate re-posting on initData, which never changes", () => {
    expect(source).not.toContain("lastInitDataRef.current === initData");
  });

  it("renews on a timer derived from the server TTL, not a hardcoded number", () => {
    expect(source).toContain("TELEGRAM_CONTEXT_TTL_MS");
    expect(source).toMatch(/REFRESH_INTERVAL_MS\s*=\s*Math\.floor\(TELEGRAM_CONTEXT_TTL_MS \* 0\.6\)/);
  });

  it("renews comfortably before expiry, so one failed request cannot strand the session", () => {
    const refresh = Math.floor(TELEGRAM_CONTEXT_TTL_MS * 0.6);
    // Two consecutive refreshes must still fit inside the TTL.
    expect(refresh * 2).toBeGreaterThan(TELEGRAM_CONTEXT_TTL_MS);
    expect(refresh).toBeLessThan(TELEGRAM_CONTEXT_TTL_MS);
  });

  it("renews on resume, because a backgrounded Mini App has its timers throttled", () => {
    expect(source).toContain("visibilitychange");
    expect(source).toContain('webApp?.onEvent?.("activated"');
    expect(source).toContain("STALE_ON_RESUME_MS");
  });

  it("backs off on failure rather than spinning, capped under the TTL", () => {
    expect(source).toContain("RETRY_MAX_MS");
    const capped = /RETRY_MAX_MS\s*=\s*(\d[\d_]*)/.exec(source);
    expect(capped).not.toBeNull();
    expect(Number(capped![1].replace(/_/g, ""))).toBeLessThan(TELEGRAM_CONTEXT_TTL_MS);
  });

  it("never posts two requests concurrently", () => {
    expect(source).toContain("inFlightRef");
  });

  it("still never sends initDataUnsafe and never stores the access token", () => {
    // The doc comment mentions initDataUnsafe by name, so assert on CODE:
    // strip comments, then check nothing references it.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("initDataUnsafe");
    expect(code).toContain("JSON.stringify({ initData })");
    expect(code).not.toMatch(/localStorage|sessionStorage/);
  });

  it("cleans up its timer and both listeners on unmount", () => {
    expect(source).toContain("clearTimeout(timer)");
    expect(source).toContain('removeEventListener("visibilitychange"');
    expect(source).toContain('offEvent?.("activated"');
  });
});
