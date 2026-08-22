import type { AuthProvider } from "convex/server";
import { pemEcP256PublicKeyToJwksDataUri } from "../../lib/crypto/pemEcJwk";

/** Fixture app id used when Convex env vars are absent (local build/tests). */
export const FIXTURE_PRIVY_APP_ID = "privy-fixture-app-id";

/** ES256 P-256 public key for fixture JWKS generation in tests and offline builds. */
export const FIXTURE_PRIVY_VERIFICATION_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE7r25sCiSiIOszfE7mpk5qsoving1
b4UGw/6D7fBVtENUuWLlOMzEi4869FRKwEK/5bfPkHv77xvLI2rmDQ1p6A==
-----END PUBLIC KEY-----`;

/** Precomputed JWKS data URI for the fixture verification key. */
export const FIXTURE_PRIVY_JWKS_DATA_URI =
  "data:application/json;base64,eyJrZXlzIjpbeyJrdHkiOiJFQyIsIngiOiI3cjI1c0NpU2lJT3N6ZkU3bXBrNXFzb3ZpbmcxYjRVR3dfNkQ3ZkJWdEVNIiwieSI6IlZMbGk1VGpNeEl1UE92UlVTc0JDdi1XM3o1QjctLThieXlOcTVnME5hZWciLCJjcnYiOiJQLTI1NiIsImtpZCI6InByaXZ5LWFwcC1rZXkiLCJ1c2UiOiJzaWciLCJhbGciOiJFUzI1NiJ9XX0=";

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
  const trimmed = verificationKeyPem.trim();
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  if (trimmed === FIXTURE_PRIVY_VERIFICATION_KEY) {
    return FIXTURE_PRIVY_JWKS_DATA_URI;
  }
  return pemEcP256PublicKeyToJwksDataUri(trimmed, kid);
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
