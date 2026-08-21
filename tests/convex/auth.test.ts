import { describe, expect, it } from "vitest";
import authConfig from "../../convex/auth.config";
import { getViewerSubject } from "../../convex/lib/identity";
import {
  FIXTURE_PRIVY_APP_ID,
  FIXTURE_PRIVY_VERIFICATION_KEY,
  PRIVY_JWT_ISSUERS,
  buildJwksDataUri,
  buildPrivyAuthProviders,
} from "../../convex/lib/privyAuth";
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

  it("falls back to fixture credentials when Convex env vars are absent", () => {
    expect(authConfig.providers).toHaveLength(2);
    expect(authConfig.providers[0]).toMatchObject({
      type: "customJwt",
      applicationID: FIXTURE_PRIVY_APP_ID,
      algorithm: "ES256",
    });
    expect(authConfig.providers[0]?.jwks).toMatch(/^data:application\/json;base64,/);
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
