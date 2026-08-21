import { describe, expect, it } from "vitest";
import {
  validateEnvPlacement,
  resolveConvexDeployment,
} from "@/lib/env/contract";

describe("env contract (AD-19)", () => {
  it("passes when secrets are placed in the correct runtime", () => {
    const result = validateEnvPlacement(
      {
        CONVEX_DEPLOY_KEY: "deploy-key",
        NEXT_PUBLIC_CONVEX_URL: "https://happy-animal-123.convex.cloud",
      },
      {
        TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
        TELEGRAM_BOT_TOKEN: "bot-token",
        PRIVY_APP_SECRET: "privy-secret",
        DFLOW_API_KEY: "dflow-key",
        OPENAI_API_KEY: "openai-key",
        SOLANA_RPC_URL: "https://rpc.example.com",
      },
    );

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when TELEGRAM_WEBHOOK_SECRET is configured on Vercel", () => {
    const result = validateEnvPlacement(
      {
        TELEGRAM_WEBHOOK_SECRET: "misplaced-secret",
      },
      {},
    );

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.key === "TELEGRAM_WEBHOOK_SECRET")).toBe(
      true,
    );
  });

  it("fails when CONVEX_DEPLOY_KEY is configured in Convex", () => {
    const result = validateEnvPlacement(
      {},
      { CONVEX_DEPLOY_KEY: "misplaced-deploy-key" },
    );

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.key === "CONVEX_DEPLOY_KEY")).toBe(
      true,
    );
  });

  it("fails when a server secret uses NEXT_PUBLIC_ prefix", () => {
    const result = validateEnvPlacement(
      { NEXT_PUBLIC_TELEGRAM_BOT_TOKEN: "leaked" },
      {},
    );

    expect(result.valid).toBe(false);
    expect(
      result.violations.some((v) => v.key === "NEXT_PUBLIC_TELEGRAM_BOT_TOKEN"),
    ).toBe(true);
  });
});

describe("resolveConvexDeployment", () => {
  it("extracts deployment name from CONVEX_DEPLOYMENT", () => {
    expect(
      resolveConvexDeployment({ CONVEX_DEPLOYMENT: "prod:happy-animal-123" }),
    ).toBe("happy-animal-123");
  });

  it("extracts deployment name from NEXT_PUBLIC_CONVEX_URL", () => {
    expect(
      resolveConvexDeployment({
        NEXT_PUBLIC_CONVEX_URL: "https://happy-animal-123.convex.cloud",
      }),
    ).toBe("happy-animal-123");
  });

  it("returns null when no deployment identifier is present", () => {
    expect(resolveConvexDeployment({})).toBeNull();
  });
});
