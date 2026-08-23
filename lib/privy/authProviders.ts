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
 *
 * ## The JWKS source changed, and why
 *
 * AD-5 recorded that "Privy publishes no hosted JWKS endpoint (research R-2,
 * R-3)", which is why this module pinned a single PEM into a base64 data URI.
 * That is no longer true. `https://auth.privy.io/api/v1/apps/<appId>/jwks.json`
 * serves a live JWKS, and for this project's app it returns **two** ES256
 * signing keys with different `kid`s.
 *
 * Two keys is the part that matters: a pinned single PEM verifies tokens signed
 * with one of them and rejects everything signed with the other, so pinning
 * produces intermittent, unattributable auth failures and breaks completely at
 * the next rotation. Convex's own `customJwt` type documents `jwks` as "The URL
 * to fetch the JWKS", so a URL is the shape this field wants.
 *
 * The hosted URL is therefore the default whenever an app id is configured. A
 * PEM remains supported as an explicit pin for anyone who wants one.
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

/** Privy's live JWKS for one app. Serves every current signing key. */
export function privyJwksUrl(appId: string): string {
  return `https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`;
}

/** Compares PEMs by their base64 body, so whitespace and line endings cannot mask a match. */
function pemBody(pem: string): string {
  return pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
}

/**
 * True when the configured key is the fixture key from this repository.
 *
 * The automatic substitution below is already behind `assertFixturePathAllowed`,
 * but that guard cannot see a fixture key that somebody pasted into the
 * deployment by hand — and one was: production ran with this exact key as its
 * authentication boundary, which rejected every real Privy token while
 * accepting anything signed by the fixture's private half.
 */
export function isFixtureVerificationKey(verificationKey: string): boolean {
  return pemBody(verificationKey) === pemBody(FIXTURE_PRIVY_VERIFICATION_KEY);
}

/**
 * Builds a base64 `data:` URI JWKS from a Privy app verification key (PEM).
 *
 * Only reached when a PEM is configured as an explicit pin — the default source
 * is Privy's hosted JWKS (see the note at the top of this file). A pin covers
 * exactly one signing key, so it goes stale the moment Privy rotates.
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
 * Builds the Convex `customJwt` providers for a Privy app.
 *
 * Source of the verification material, in order:
 *   1. an explicitly configured PEM, when it is not the repo's fixture key;
 *   2. Privy's hosted JWKS for the configured app id — the default;
 *   3. the fixture JWKS, reachable only on a permitted fixture runtime.
 *
 * @throws FixtureModeNotPermittedError when no app id is configured, or when
 *   the configured verification key is the fixture key, on anything other than
 *   an explicitly opted-in local/test runtime. On a deployment this fails the
 *   auth-config evaluation, which is the point: a deployment must not come up
 *   trusting a key whose twin is published in this repository.
 */
export function buildPrivyAuthProviders(options?: {
  appId?: string;
  verificationKey?: string;
}): PrivyCustomJwtProvider[] {
  const configuredAppId = options?.appId?.trim();
  const configuredKey = options?.verificationKey?.trim();
  const configuredKeyIsFixture = configuredKey
    ? isFixtureVerificationKey(configuredKey)
    : false;

  if (!configuredAppId || configuredKeyIsFixture) {
    assertFixturePathAllowed("privy.authProviders");
  }

  const appId = configuredAppId || FIXTURE_PRIVY_APP_ID;

  const jwks =
    !configuredAppId || configuredKeyIsFixture
      ? FIXTURE_PRIVY_JWKS_DATA_URI
      : configuredKey
        ? buildJwksDataUri(configuredKey)
        : privyJwksUrl(appId);

  return PRIVY_JWT_ISSUERS.map((issuer) => ({
    type: "customJwt" as const,
    applicationID: appId,
    issuer,
    jwks,
    algorithm: "ES256" as const,
  }));
}
