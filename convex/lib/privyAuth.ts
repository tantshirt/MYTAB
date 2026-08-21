import { createPublicKey } from "node:crypto";
import type { AuthProvider } from "convex/server";

/** Fixture app id used when Convex env vars are absent (local build/tests). */
export const FIXTURE_PRIVY_APP_ID = "privy-fixture-app-id";

/** ES256 P-256 public key for fixture JWKS generation in tests and offline builds. */
export const FIXTURE_PRIVY_VERIFICATION_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE7r25sCiSiIOszfE7mpk5qsoving1
b4UGw/6D7fBVtENUuWLlOMzEi4869FRKwEK/5bfPkHv77xvLI2rmDQ1p6A==
-----END PUBLIC KEY-----`;

/** OQ-1: Privy tokens may use bare or URL-form issuers — register both. */
export const PRIVY_JWT_ISSUERS = ["privy.io", "https://privy.io"] as const;

/**
 * Builds a base64 `data:` URI JWKS from a Privy app verification key (PEM).
 * Privy publishes no hosted JWKS endpoint (AD-5, research R-2, R-3).
 */
export function buildJwksDataUri(
  verificationKeyPem: string,
  kid = "privy-app-key",
): string {
  const keyObject = createPublicKey(verificationKeyPem.trim());
  const jwk = keyObject.export({ format: "jwk" }) as Record<string, string>;
  const jwks = {
    keys: [
      {
        ...jwk,
        kid,
        use: "sig",
        alg: "ES256",
      },
    ],
  };
  const base64 = Buffer.from(JSON.stringify(jwks), "utf8").toString("base64");
  return `data:application/json;base64,${base64}`;
}

export function buildPrivyAuthProviders(options?: {
  appId?: string;
  verificationKey?: string;
}): AuthProvider[] {
  const appId = options?.appId?.trim() || FIXTURE_PRIVY_APP_ID;
  const verificationKey =
    options?.verificationKey?.trim() || FIXTURE_PRIVY_VERIFICATION_KEY;
  const jwks = buildJwksDataUri(verificationKey);

  return PRIVY_JWT_ISSUERS.map((issuer) => ({
    type: "customJwt" as const,
    applicationID: appId,
    issuer,
    jwks,
    algorithm: "ES256" as const,
  }));
}
