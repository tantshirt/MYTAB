import { describe, expect, it, vi } from "vitest";
import type { TelegramWebApp } from "@/features/telegram/TelegramRuntimeProvider";
import {
  BOTTOM_BAR_COLORS,
  applyBottomBarColor,
  applyTelegramChrome,
  nearestThemeColorKey,
  versionAtLeast,
} from "@/features/telegram/telegramChrome";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

function makeWebApp(version: string, overrides: Partial<TelegramWebApp> = {}) {
  const calls = {
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    setBottomBarColor: vi.fn(),
    disableVerticalSwipes: vi.fn(),
    disableClosingConfirmation: vi.fn(),
    enableClosingConfirmation: vi.fn(),
    expand: vi.fn(),
    ready: vi.fn(),
    mainHide: vi.fn(),
    secondaryHide: vi.fn(),
  };

  const webApp = {
    initData: "",
    initDataUnsafe: {},
    platform: "ios",
    version,
    themeParams: { bg_color: "#ffffff", secondary_bg_color: "#efeff4" },
    isVersionAtLeast: (target: string) => versionAtLeast({ version }, target),
    ready: calls.ready,
    expand: calls.expand,
    setHeaderColor: calls.setHeaderColor,
    setBackgroundColor: calls.setBackgroundColor,
    setBottomBarColor: calls.setBottomBarColor,
    disableVerticalSwipes: calls.disableVerticalSwipes,
    disableClosingConfirmation: calls.disableClosingConfirmation,
    enableClosingConfirmation: calls.enableClosingConfirmation,
    MainButton: { show: vi.fn(), hide: calls.mainHide },
    SecondaryButton: { show: vi.fn(), hide: calls.secondaryHide },
    ...overrides,
  } as unknown as TelegramWebApp;

  return { webApp, calls };
}

describe("POLISH-SPEC §2.1/§2.6 — Telegram chrome is version-gated", () => {
  it("compares versions numerically, so 7.10 is newer than 7.7", () => {
    expect(versionAtLeast({ version: "7.10" }, "7.7")).toBe(true);
    expect(versionAtLeast({ version: "7.7" }, "7.10")).toBe(false);
    expect(versionAtLeast({ version: "8.0" }, "8.0")).toBe(true);
    expect(versionAtLeast(null, "6.1")).toBe(false);
  });

  it("falls back to WebApp.version when isVersionAtLeast is missing or throws", () => {
    expect(versionAtLeast({ version: "7.0" }, "6.9")).toBe(true);
    expect(
      versionAtLeast(
        {
          version: "7.0",
          isVersionAtLeast: () => {
            throw new Error("WebAppMethodUnsupported");
          },
        },
        "6.9",
      ),
    ).toBe(true);
  });

  it("6.0 — sets no colours, no swipe or confirmation calls, still hides MainButton", () => {
    const { webApp, calls } = makeWebApp("6.0");
    applyTelegramChrome(webApp);

    expect(calls.setHeaderColor).not.toHaveBeenCalled();
    expect(calls.setBackgroundColor).not.toHaveBeenCalled();
    expect(calls.setBottomBarColor).not.toHaveBeenCalled();
    expect(calls.disableVerticalSwipes).not.toHaveBeenCalled();
    expect(calls.disableClosingConfirmation).not.toHaveBeenCalled();
    expect(calls.secondaryHide).not.toHaveBeenCalled();
    expect(calls.mainHide).toHaveBeenCalled();
    expect(calls.expand).toHaveBeenCalled();
  });

  it("6.1–6.8 — header takes the themeParams key nearest paper, background takes hex", () => {
    // Telegram light theme: bg_color #ffffff, secondary_bg_color #efeff4.
    // #efeff4 is measurably closer to paper (#F4F7FA) than pure white is.
    const { webApp, calls } = makeWebApp("6.5");
    applyTelegramChrome(webApp);

    expect(calls.setHeaderColor).toHaveBeenCalledWith("secondary_bg_color");
    expect(calls.setBackgroundColor).toHaveBeenCalledWith(MYTAB_COLORS.paper);
    expect(calls.setBottomBarColor).not.toHaveBeenCalled();
  });

  it("6.9 — header takes arbitrary hex", () => {
    const { webApp, calls } = makeWebApp("6.9");
    applyTelegramChrome(webApp);
    expect(calls.setHeaderColor).toHaveBeenCalledWith(MYTAB_COLORS.paper);
  });

  it("6.2 — closing confirmation is disabled, never enabled", () => {
    const { webApp, calls } = makeWebApp("6.2");
    applyTelegramChrome(webApp);
    expect(calls.disableClosingConfirmation).toHaveBeenCalled();
    expect(calls.enableClosingConfirmation).not.toHaveBeenCalled();
  });

  it("7.7 — vertical swipe-to-close is disabled", () => {
    const { webApp, calls } = makeWebApp("7.7");
    applyTelegramChrome(webApp);
    expect(calls.disableVerticalSwipes).toHaveBeenCalled();
  });

  it("7.10 — bottom bar colour and SecondaryButton.hide()", () => {
    applyBottomBarColor(null, BOTTOM_BAR_COLORS.surface);
    const { webApp, calls } = makeWebApp("7.10");
    applyTelegramChrome(webApp);
    expect(calls.setBottomBarColor).toHaveBeenCalledWith(MYTAB_COLORS.surface);
    expect(calls.secondaryHide).toHaveBeenCalled();
  });

  it("keeps the last requested bottom-bar colour across a themeChanged re-assert", () => {
    const { webApp, calls } = makeWebApp("8.0");
    applyBottomBarColor(webApp, BOTTOM_BAR_COLORS.paper);
    expect(calls.setBottomBarColor).toHaveBeenLastCalledWith(MYTAB_COLORS.paper);

    applyTelegramChrome(webApp);
    expect(calls.setBottomBarColor).toHaveBeenLastCalledWith(MYTAB_COLORS.paper);

    applyBottomBarColor(webApp, BOTTOM_BAR_COLORS.surface);
  });

  it("never throws when a supported-looking method rejects the call", () => {
    const throwing = () => {
      throw new Error("WebAppMethodUnsupported");
    };
    const { webApp } = makeWebApp("8.0", {
      setHeaderColor: throwing,
      setBackgroundColor: throwing,
      setBottomBarColor: throwing,
      disableVerticalSwipes: throwing,
      disableClosingConfirmation: throwing,
      expand: throwing,
    });

    expect(() => applyTelegramChrome(webApp)).not.toThrow();
  });

  it("is a no-op when the SDK is absent", () => {
    expect(() => applyTelegramChrome(undefined)).not.toThrow();
    expect(() => applyBottomBarColor(undefined, BOTTOM_BAR_COLORS.surface)).not.toThrow();
  });

  it("picks the themeParams key closest to paper on pre-6.9 clients", () => {
    expect(nearestThemeColorKey({ bg_color: "#ffffff", secondary_bg_color: "#000000" })).toBe(
      "bg_color",
    );
    expect(nearestThemeColorKey({ bg_color: "#17212b", secondary_bg_color: "#f0f4f8" })).toBe(
      "secondary_bg_color",
    );
    expect(nearestThemeColorKey(null)).toBe("bg_color");
  });
});
