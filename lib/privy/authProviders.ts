/**
 * Convex `customJwt` auth providers for Privy (AD-5).
 *
 * The verification key IS the authentication boundary: Convex accepts any JWT
 * that verifies under the key declared here, for the `applicationID` declared
 * here. Substituting a fixture key when `PRIVY_VERIFICATION_KEY` is unset would
 * therefore mean a deployment that trusts whoever holds the fixture private key
 * — and would do so silently, because a valid-looking auth config would still
 * be produced. So the fixture credentials are behind `assertFixturePathAllowed`
 * and never reachable on a real deployment.
 *
 * This module lives under `lib/` rather than `convex/` on purpose: the fixture
 * constants must not be exported from a deployed Convex module. It also declares
 * the provider shape itself rather than importing `AuthProvider` from
 * `convex/server`, so `lib/privy` stays free of Convex imports (see
 * tests/privy/purity.test.ts) — and so call sites can read `provider.jwks`,
 * which the imported union type does not expose.
 */

import { pemEcP256PublicKeyToJwksDataUri } from "../crypto/pemEcJwk";
import { assertFixturePathAllowed } from "../solana/runtimeGuard";

/** One Convex `customJwt` provider entry, as Convex's auth config expects it. */
export type PrivyCustomJwtProvider = {
  type: "customJwt";
  applicationID: string;
  issuer: string;
  jwks: string;
  algorithm: "ES256";
};

/** Fixture app id — local dev and tests only. */
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

/**
 * @throws FixtureModeNotPermittedError when either credential is absent and the
 *   runtime is anything other than an explicitly opted-in local/test runtime.
 *   On a deployment this fails the auth-config evaluation, which is the point:
 *   a deployment with no Privy verification key must not come up at all.
 */
export function buildPrivyAuthProviders(options?: {
  appId?: string;
  verificationKey?: string;
}): PrivyCustomJwtProvider[] {
  const configuredAppId = options?.appId?.trim();
  const configuredKey = options?.verificationKey?.trim();

  if (!configuredAppId || !configuredKey) {
    assertFixturePathAllowed("privy.authProviders");
  }

  const appId = configuredAppId || FIXTURE_PRIVY_APP_ID;
  const verificationKey = configuredKey || FIXTURE_PRIVY_VERIFICATION_KEY;
  const jwks = buildJwksDataUri(verificationKey);

  return PRIVY_JWT_ISSUERS.map((issuer) => ({
    type: "customJwt" as const,
    applicationID: appId,
    issuer,
    jwks,
    algorithm: "ES256" as const,
  }));
}
