/**
 * Fixture mode must be explicit and unreachable on a real deployment.
 *
 * The prior behaviour degraded to fixtures whenever a secret was absent, which
 * is strictly more dangerous than throwing: a deployed environment missing its
 * Privy secret would happily "co-sign" and record a fabricated signature.
 */

import { describe, expect, it } from "vitest";
import {
  FixtureModeNotPermittedError,
  assertFixturePathAllowed,
  fixturePathAllowed,
  isProductionRuntime,
  requireLiveCredential,
  resolveDeploymentKind,
  shouldBadgeNonProductionData,
  type RuntimeEnvSnapshot,
} from "../../lib/solana/runtimeGuard";
import { resolveSponsorWalletAddress } from "../../lib/solana/fixture";

const LOCAL_OPT_IN: RuntimeEnvSnapshot = {
  NODE_ENV: "development",
  MYTAB_ALLOW_FIXTURES: "true",
};

describe("deployment classification", () => {
  it.each([
    [{ ENVIRONMENT: "production" }, "production"],
    [{ VERCEL_ENV: "production" }, "production"],
    [{ NODE_ENV: "production" }, "production"],
    [{ CONVEX_DEPLOYMENT: "prod:tremendous-partridge-849" }, "production"],
    [{ CONVEX_DEPLOYMENT: "dev:cheerful-otter-123" }, "deployed"],
    [{ CONVEX_CLOUD_URL: "https://x.convex.cloud" }, "deployed"],
    [{ VERCEL_ENV: "preview" }, "deployed"],
    [{ NODE_ENV: "development" }, "local"],
  ] as const)("classifies %o as %s", (env, expected) => {
    expect(resolveDeploymentKind(env as RuntimeEnvSnapshot)).toBe(expected);
  });

  it("treats the current production Convex deployment as production", () => {
    expect(
      isProductionRuntime({ CONVEX_DEPLOYMENT: "prod:tremendous-partridge-849" }),
    ).toBe(true);
  });
});

describe("fixture gating", () => {
  it("refuses fixtures in production even with the opt-in set", () => {
    const env: RuntimeEnvSnapshot = {
      NODE_ENV: "production",
      MYTAB_ALLOW_FIXTURES: "true",
    };
    expect(fixturePathAllowed(env)).toBe(false);
    expect(() => assertFixturePathAllowed("test.path", env)).toThrow(
      FixtureModeNotPermittedError,
    );
  });

  it("refuses fixtures on a deployed devnet even with the opt-in set", () => {
    // Devnet is still a real deployment: a fixture there hides the bug until
    // the mainnet flip.
    const env: RuntimeEnvSnapshot = {
      CONVEX_DEPLOYMENT: "dev:cheerful-otter-123",
      MYTAB_ALLOW_FIXTURES: "true",
    };
    expect(fixturePathAllowed(env)).toBe(false);
    expect(() => assertFixturePathAllowed("test.path", env)).toThrow(
      /real deployment/,
    );
  });

  it("refuses fixtures locally without an explicit opt-in", () => {
    const env: RuntimeEnvSnapshot = { NODE_ENV: "development" };
    expect(fixturePathAllowed(env)).toBe(false);
    expect(() => assertFixturePathAllowed("test.path", env)).toThrow(
      /MYTAB_ALLOW_FIXTURES/,
    );
  });

  it("allows fixtures locally with the opt-in, and under the test runner", () => {
    expect(fixturePathAllowed(LOCAL_OPT_IN)).toBe(true);
    expect(fixturePathAllowed({ NODE_ENV: "test" })).toBe(true);
    expect(fixturePathAllowed({ NODE_ENV: "development", VITEST: "true" })).toBe(
      true,
    );
  });

  it("carries a named error code, not a bare Error", () => {
    try {
      assertFixturePathAllowed("privy.coSignAndBroadcast", {
        NODE_ENV: "production",
      });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FixtureModeNotPermittedError);
      expect((error as FixtureModeNotPermittedError).code).toBe(
        "FIXTURE_MODE_NOT_PERMITTED",
      );
      expect((error as FixtureModeNotPermittedError).subsystem).toBe(
        "privy.coSignAndBroadcast",
      );
    }
  });
});

describe("live credentials fail loudly", () => {
  it("throws a named error when a required credential is absent", () => {
    expect(() =>
      requireLiveCredential("solana.rpc", "SOLANA_RPC_URL", undefined),
    ).toThrow(/LIVE_CREDENTIAL_MISSING/);
    expect(() => requireLiveCredential("solana.rpc", "SOLANA_RPC_URL", "  ")).toThrow(
      /LIVE_CREDENTIAL_MISSING/,
    );
    expect(requireLiveCredential("solana.rpc", "SOLANA_RPC_URL", " https://x ")).toBe(
      "https://x",
    );
  });
});

describe("sponsor wallet resolution", () => {
  it("returns the configured sponsor address when present", () => {
    expect(
      resolveSponsorWalletAddress({
        PRIVY_SPONSOR_WALLET_ADDRESS: "Sponsor111111111111111111111111111111111111",
      }),
    ).toBe("Sponsor111111111111111111111111111111111111");
  });

  it("throws rather than substituting a fixture wallet on a deployment", () => {
    // Silently returning a fixture sponsor address means settling with a wallet
    // nobody funds and nobody can sign with.
    expect(() =>
      resolveSponsorWalletAddress({
        NODE_ENV: "production",
      } as never),
    ).toThrow(FixtureModeNotPermittedError);

    expect(() =>
      resolveSponsorWalletAddress({
        CONVEX_DEPLOYMENT: "dev:cheerful-otter-123",
      } as never),
    ).toThrow(FixtureModeNotPermittedError);
  });
});

describe("non-production badging", () => {
  it("badges every non-production runtime", () => {
    expect(shouldBadgeNonProductionData({ NODE_ENV: "development" })).toBe(true);
    expect(shouldBadgeNonProductionData({ NODE_ENV: "production" })).toBe(false);
  });
});
