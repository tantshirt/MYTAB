import { describe, expect, it } from "vitest";
import {
  assertPreviewEgressAllowed,
  guardedFetch,
  isBlockedHostname,
  isProductionRuntime,
  PreviewEgressBlockedError,
  PREVIEW_BLOCKED_HOST_PATTERNS,
  shouldShowNonProductionBadge,
} from "@/lib/env/preview-guard";

const previewEnv = { VERCEL_ENV: "preview", NODE_ENV: "production" };
const productionEnv = { VERCEL_ENV: "production", NODE_ENV: "production" };
const developmentEnv = { NODE_ENV: "development" };

describe("preview egress guard (AD-3)", () => {
  it("allows egress in production", () => {
    expect(() =>
      assertPreviewEgressAllowed("https://api.telegram.org/bot/sendMessage", productionEnv),
    ).not.toThrow();
  });

  it("blocks Telegram API in preview", () => {
    expect(() =>
      assertPreviewEgressAllowed("https://api.telegram.org/bot/sendMessage", previewEnv),
    ).toThrow(PreviewEgressBlockedError);
  });

  it("blocks Privy API in preview", () => {
    expect(() =>
      assertPreviewEgressAllowed("https://auth.privy.io/api/v1/wallets", previewEnv),
    ).toThrow(PreviewEgressBlockedError);
  });

  it("blocks DFlow API in preview", () => {
    expect(() =>
      assertPreviewEgressAllowed("https://quote-api.dflow.net/order", previewEnv),
    ).toThrow(PreviewEgressBlockedError);
  });

  it("blocks OpenAI API in preview", () => {
    expect(() =>
      assertPreviewEgressAllowed("https://api.openai.com/v1/responses", previewEnv),
    ).toThrow(PreviewEgressBlockedError);
  });

  it("blocks Vercel AI Gateway in preview (D-32)", () => {
    expect(() =>
      assertPreviewEgressAllowed("https://ai-gateway.vercel.sh/v1/responses", previewEnv),
    ).toThrow(PreviewEgressBlockedError);
  });

  it("blocks production Solana RPC in preview", () => {
    expect(() =>
      assertPreviewEgressAllowed("https://mainnet.helius-rpc.com/", previewEnv),
    ).toThrow(PreviewEgressBlockedError);
  });

  it("guardedFetch throws before network in preview", async () => {
    await expect(
      guardedFetch("https://api.telegram.org/bot/test", undefined, previewEnv),
    ).rejects.toThrow(PreviewEgressBlockedError);
  });

  it("identifies blocked hostnames", () => {
    expect(isBlockedHostname("api.telegram.org")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
  });

  it("defines patterns for all required blocked providers", () => {
    const patternSources = PREVIEW_BLOCKED_HOST_PATTERNS.map((p) => p.source);
    expect(patternSources.some((s) => s.includes("telegram"))).toBe(true);
    expect(patternSources.some((s) => s.includes("privy"))).toBe(true);
    expect(patternSources.some((s) => s.includes("dflow"))).toBe(true);
    expect(patternSources.some((s) => s.includes("openai"))).toBe(true);
    expect(patternSources.some((s) => s.includes("ai-gateway"))).toBe(true);
    expect(
      patternSources.some((s) => s.includes("helius") || s.includes("solana")),
    ).toBe(true);
  });
});

describe("non-production badge visibility", () => {
  it("shows badge in preview", () => {
    expect(shouldShowNonProductionBadge(previewEnv)).toBe(true);
  });

  it("shows badge in development", () => {
    expect(shouldShowNonProductionBadge(developmentEnv)).toBe(true);
  });

  it("hides badge in production", () => {
    expect(shouldShowNonProductionBadge(productionEnv)).toBe(false);
  });

  it("classifies production runtime correctly", () => {
    expect(isProductionRuntime(productionEnv)).toBe(true);
    expect(isProductionRuntime(previewEnv)).toBe(false);
  });
});
