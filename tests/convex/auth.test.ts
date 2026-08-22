import { describe, expect, it } from "vitest";
import authConfig from "../../convex/auth.config";
import { getViewerSubject } from "../../convex/lib/identity";
import {
  PRIVY_JWT_ISSUERS,
  buildJwksDataUri,
  buildPrivyAuthProviders,
} from "../../convex/lib/privyAuth";
// The fixture credentials are NOT exported from any module under convex/.
import {
  FIXTURE_PRIVY_APP_ID,
  FIXTURE_PRIVY_VERIFICATION_KEY,
} from "../../lib/privy/authProviders";
import { FixtureModeNotPermittedError } from "../../lib/solana/runtimeGuard";
import { createPrivyConvexAuthAdapter } from "@/lib/privy/convex-auth";

describe("Story 1.5 — Privy custom JWT auth config (AC1)", () => {
  it("declares customJwt providers for both Privy issuer variants (OQ-1)", () => {
    const providers = buildPrivyAuthProviders({
      appId: "test-app-id",
      verificationKey: FIXTURE_PRIVY_VERIFICATION_KEY,
    });

    expect(providers).toHaveLength(2);
    expect(providers.map((provider) => provider.type)).toEqual(["customJwt", "customJwt"]);
    expect(providers.map((provider) => provider.issuer)).toEqual([...PRIVY_JWT_ISSUERS]);
  });

  it("uses ES256, applicationID, and a base64 data URI JWKS — no hosted route", () => {
    const [provider] = buildPrivyAuthProviders({
      appId: "test-app-id",
      verificationKey: FIXTURE_PRIVY_VERIFICATION_KEY,
    });

    expect(provider).toMatchObject({
      type: "customJwt",
      applicationID: "test-app-id",
      issuer: "privy.io",
      algorithm: "ES256",
    });
    expect(provider.jwks).toMatch(/^data:application\/json;base64,/);

    const payload = JSON.parse(
      Buffer.from(provider.jwks.split(",")[1]!, "base64").toString("utf8"),
    );
    expect(payload.keys).toHaveLength(1);
    expect(payload.keys[0]).toMatchObject({
      kty: "EC",
      crv: "P-256",
      use: "sig",
      alg: "ES256",
    });
    expect(provider.jwks.startsWith("http")).toBe(false);
  });

  it("uses fixture credentials only under the test runner", () => {
    expect(authConfig.providers).toHaveLength(2);
    expect(authConfig.providers[0]).toMatchObject({
      type: "customJwt",
      applicationID: FIXTURE_PRIVY_APP_ID,
      algorithm: "ES256",
    });
    expect(authConfig.providers[0]?.jwks).toMatch(/^data:application\/json;base64,/);
  });

  it("refuses to build an auth config from fixture credentials on a deployment", () => {
    // A fixture verification key on a deployment means Convex trusts whoever
    // holds the matching private key — and looks completely healthy doing it.
    const saved = {
      CONVEX_CLOUD_URL: process.env.CONVEX_CLOUD_URL,
      VITEST: process.env.VITEST,
      VITEST_WORKER_ID: process.env.VITEST_WORKER_ID,
      NODE_ENV: process.env.NODE_ENV,
    };
    process.env.CONVEX_CLOUD_URL = "https://example-deployment.convex.cloud";
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      expect(() => buildPrivyAuthProviders({})).toThrow(FixtureModeNotPermittedError);
      expect(() =>
        buildPrivyAuthProviders({ appId: "real-app-id" }),
      ).toThrow(FixtureModeNotPermittedError);
      expect(() =>
        buildPrivyAuthProviders({ verificationKey: FIXTURE_PRIVY_VERIFICATION_KEY }),
      ).toThrow(FixtureModeNotPermittedError);
      // Both credentials present — the live path still builds.
      expect(
        buildPrivyAuthProviders({
          appId: "real-app-id",
          verificationKey: FIXTURE_PRIVY_VERIFICATION_KEY,
        }),
      ).toHaveLength(2);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          (process.env as Record<string, string>)[key] = value;
        }
      }
    }
  });

  it("buildJwksDataUri is deterministic for the fixture verification key", () => {
    const first = buildJwksDataUri(FIXTURE_PRIVY_VERIFICATION_KEY, "fixture-privy-key");
    const second = buildJwksDataUri(FIXTURE_PRIVY_VERIFICATION_KEY, "fixture-privy-key");
    expect(first).toBe(second);
  });
});

describe("Story 1.5 — viewer identity query", () => {
  it("returns null when unauthenticated", async () => {
    const subject = await getViewerSubject({
      auth: {
        getUserIdentity: async () => null,
      },
    });

    expect(subject).toBeNull();
  });

  it("returns the Privy DID subject when authenticated", async () => {
    const subject = await getViewerSubject({
      auth: {
        getUserIdentity: async () => ({
          tokenIdentifier: "privy.io|did:privy:fixture",
          subject: "did:privy:fixture",
          issuer: "privy.io",
        }),
      },
    });

    expect(subject).toBe("did:privy:fixture");
  });
});

describe("Story 1.5 — Privy getAccessToken adapter", () => {
  it("maps forceRefreshToken to Privy getAccessToken and returns null on failure", async () => {
    const fetchAccessToken = createPrivyConvexAuthAdapter(async () => "jwt-token");
    await expect(fetchAccessToken({ forceRefreshToken: true })).resolves.toBe("jwt-token");

    const failing = createPrivyConvexAuthAdapter(async () => {
      throw new Error("refresh failed");
    });
    await expect(failing({ forceRefreshToken: false })).resolves.toBeNull();
  });
});
