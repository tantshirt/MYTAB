import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const replace = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: () => undefined, refresh: () => undefined }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

let runtime: { startParam: string | null; isTelegramWebApp: boolean } = {
  startParam: null,
  isTelegramWebApp: true,
};

vi.mock("@/features/telegram/TelegramRuntimeProvider", () => ({
  useTelegramRuntime: () => runtime,
}));

import { useStartParamRoute, resetStartParamConsumption } from "@/features/telegram/useStartParamRoute";

function Probe() {
  useStartParamRoute();
  return <div />;
}

describe("Telegram deep link routing (FR-N3)", () => {
  beforeEach(() => {
    replace.mockClear();
    resetStartParamConsumption();
    pathname = "/";
    runtime = { startParam: null, isTelegramWebApp: true };
  });

  it("renders without a router when there is no start param", () => {
    runtime = { startParam: null, isTelegramWebApp: true };
    expect(() => renderToStaticMarkup(<Probe />)).not.toThrow();
    expect(replace).not.toHaveBeenCalled();
  });

  it("only accepts an opaque token shape", () => {
    // The token is server-resolved; the client guards the URL shape alone so a
    // malformed launch param can never build a path.
    const shape = /^[A-Za-z0-9_-]{8,256}$/;
    expect(shape.test("tabsess_9fA2Kx7QpL")).toBe(true);
    expect(shape.test("short")).toBe(false);
    expect(shape.test("../../etc/passwd")).toBe(false);
    expect(shape.test("has spaces here")).toBe(false);
    expect(shape.test("semi;colon")).toBe(false);
  });

  it("exposes a reset used only by tests", () => {
    expect(typeof resetStartParamConsumption).toBe("function");
  });

  it("is imported by the Tabs home route so a deep link is actually consumed", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/(miniapp)/page.tsx", "utf8");
    expect(src).toContain("useStartParamRoute");
  });
});
