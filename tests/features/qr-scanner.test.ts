import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
}));
import {
  runInviteQrScan,
  runQrScan,
  tabPathForScannedToken,
  tabTokenFromScannedQr,
} from "@/features/telegram/useQrScanner";
import { TabsHomeSurface } from "@/features/balances/TabsHomeSurface";

describe("native invite QR parsing", () => {
  it("accepts an opaque tab token from a Telegram Mini App link", () => {
    expect(
      tabTokenFromScannedQr(
        "https://t.me/mytab_live_bot/app?startapp=opaque_token-123",
      ),
    ).toBe("opaque_token-123");
  });

  it.each([
    "not a URL",
    "https://evil.example/?startapp=opaque_token-123",
    "https://t.me/mytab_live_bot/app?startapp=tip",
    "https://t.me/mytab_live_bot/app?startapp=x",
  ])("fails closed for malformed or non-tab QR: %s", (raw) => {
    expect(tabTokenFromScannedQr(raw)).toBeNull();
  });
});

describe("native scanner lifecycle to navigation", () => {
  it("ships the home control only when the scanner action is wired", () => {
    const without = renderToStaticMarkup(
      React.createElement(TabsHomeSurface, {
        openTabs: [], groups: [], recentActivity: [], balanceComponents: [],
      }),
    );
    const withScanner = renderToStaticMarkup(
      React.createElement(TabsHomeSurface, {
        openTabs: [],
        groups: [],
        recentActivity: [],
        balanceComponents: [],
        onScanInvite: () => undefined,
      }),
    );
    expect(without).not.toContain("Scan an invite QR");
    expect(withScanner).toContain("Scan an invite QR");
  });

  it("reports missing capability without opening a popup", () => {
    const errors: Array<string | null> = [];
    expect(runQrScan(undefined, () => undefined, (error) => errors.push(error))).toBe(false);
    expect(errors.at(-1)).toMatch(/unavailable/i);
  });

  it("surfaces popup open and close exceptions without losing a valid invite", () => {
    const openErrors: Array<string | null> = [];
    expect(runQrScan({
      showScanQrPopup: () => { throw new Error("native open failed"); },
    }, () => undefined, (error) => openErrors.push(error))).toBe(false);
    expect(openErrors.at(-1)).toMatch(/could not open/i);

    let callback: ((data: string) => boolean | void) | undefined;
    const tokens: string[] = [];
    const closeErrors: Array<string | null> = [];
    runQrScan({
      showScanQrPopup: (_params, next) => { callback = next; },
      closeScanQrPopup: () => { throw new Error("native close failed"); },
    }, (token) => tokens.push(token), (error) => closeErrors.push(error));
    callback?.("https://t.me/mytab_live_bot/app?startapp=opaque_token-123");
    expect(tokens).toEqual(["opaque_token-123"]);
    expect(closeErrors.at(-1)).toMatch(/could not close/i);
  });

  it("opens with Telegram copy, closes malformed scans, and exposes a retryable error", () => {
    let callback: ((data: string) => boolean | void) | undefined;
    let closed = 0;
    const errors: Array<string | null> = [];
    const opened = runQrScan({
      showScanQrPopup: (params, next) => {
        expect(params).toEqual({ text: "Scan a My Tab invite" });
        callback = next;
      },
      closeScanQrPopup: () => { closed += 1; },
    }, () => undefined, (error) => errors.push(error));
    expect(opened).toBe(true);
    expect(callback?.("not an invite")).toBe(true);
    expect(closed).toBe(1);
    expect(errors.at(-1)).toMatch(/not a My Tab invite/i);
  });

  it("closes, forwards the opaque token, and produces the encoded tab navigation", () => {
    let callback: ((data: string) => boolean | void) | undefined;
    let closed = 0;
    const paths: string[] = [];
    runQrScan({
      showScanQrPopup: (_params, next) => { callback = next; },
      closeScanQrPopup: () => { closed += 1; },
    }, (token) => paths.push(tabPathForScannedToken(token)), () => undefined);
    expect(callback?.("https://t.me/mytab_live_bot/app?startapp=opaque_token-123")).toBe(true);
    expect(closed).toBe(1);
    expect(paths).toEqual(["/tabs/opaque_token-123"]);
    expect(tabPathForScannedToken("opaque/token")).toBe("/tabs/opaque%2Ftoken");
  });

  it("runs the shipped popup-to-router seam without manually composing helpers", () => {
    let callback: ((data: string) => boolean | void) | undefined;
    const paths: string[] = [];
    const errors: Array<string | null> = [];
    runInviteQrScan({
      showScanQrPopup: (_params, next) => { callback = next; },
      closeScanQrPopup: () => undefined,
    }, (path) => paths.push(path), (error) => errors.push(error));

    expect(callback?.("https://t.me/mytab_live_bot/app?startapp=opaque_token-123")).toBe(true);
    expect(paths).toEqual(["/tabs/opaque_token-123"]);
    expect(errors.at(-1)).toBeNull();
  });
});
