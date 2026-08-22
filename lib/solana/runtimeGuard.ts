/**
 * The single gate that decides whether a fixture / simulated code path may run.
 *
 * Two rules, both fail-closed:
 *
 *  1. A fixture path is reachable ONLY when it has been turned on explicitly
 *     (`MYTAB_ALLOW_FIXTURES=true`, or an automated test runner). A missing
 *     secret is never sufficient — silent degradation to a fixture is the exact
 *     failure mode that lets a stub co-sign real money.
 *  2. A fixture path is NEVER reachable on a real deployment. "Real deployment"
 *     includes devnet: a fixture wallet address in a devnet settlement is money
 *     sent nowhere just as surely as on mainnet, and it hides the bug until the
 *     mainnet flip.
 *
 * The assert raises a named error rather than returning a boolean, so an
 * unguarded `if` cannot swallow it.
 */

export type DeploymentKind = "production" | "deployed" | "local";

export const RUNTIME_GUARD_FAILURE = {
  /** A fixture path was reached on a real deployment, or without an opt-in. */
  FIXTURE_MODE_NOT_PERMITTED: "FIXTURE_MODE_NOT_PERMITTED",
  /** A live path was reached without the credential it requires. */
  LIVE_CREDENTIAL_MISSING: "LIVE_CREDENTIAL_MISSING",
} as const;

export type RuntimeGuardFailureCode =
  (typeof RUNTIME_GUARD_FAILURE)[keyof typeof RUNTIME_GUARD_FAILURE];

export const FIXTURE_MODE_NOT_PERMITTED =
  RUNTIME_GUARD_FAILURE.FIXTURE_MODE_NOT_PERMITTED;

export class RuntimeGuardError extends Error {
  constructor(
    public readonly code: RuntimeGuardFailureCode,
    public readonly subsystem: string,
    detail?: string,
  ) {
    super(`${code}: ${subsystem}${detail ? ` (${detail})` : ""}`);
    this.name = "RuntimeGuardError";
  }
}

/** Thrown instead of quietly returning fixture data outside local dev/tests. */
export class FixtureModeNotPermittedError extends RuntimeGuardError {
  constructor(subsystem: string, reason: string) {
    super(
      RUNTIME_GUARD_FAILURE.FIXTURE_MODE_NOT_PERMITTED,
      subsystem,
      `${reason}. Configure the real credentials, or set MYTAB_ALLOW_FIXTURES=true in a non-deployed runtime.`,
    );
    this.name = "FixtureModeNotPermittedError";
  }
}

export type RuntimeEnvSnapshot = {
  ENVIRONMENT?: string;
  VERCEL_ENV?: string;
  VERCEL?: string;
  NODE_ENV?: string;
  CONVEX_DEPLOYMENT?: string;
  CONVEX_CLOUD_URL?: string;
  CONVEX_SITE_URL?: string;
  MYTAB_ALLOW_FIXTURES?: string;
  MYTAB_FIXTURE_MODE?: string;
  VITEST?: string;
  VITEST_WORKER_ID?: string;
};

export function readRuntimeEnv(): RuntimeEnvSnapshot {
  if (typeof process === "undefined" || !process.env) {
    return {};
  }
  return process.env as RuntimeEnvSnapshot;
}

function truthy(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/**
 * Convex injects CONVEX_CLOUD_URL / CONVEX_SITE_URL into every deployed function,
 * and `CONVEX_DEPLOYMENT` is `prod:<name>` / `dev:<name>` at the CLI boundary.
 */
function convexDeploymentKind(
  env: RuntimeEnvSnapshot,
): DeploymentKind | undefined {
  const deployment = env.CONVEX_DEPLOYMENT?.trim().toLowerCase();
  if (deployment?.startsWith("prod:")) {
    return "production";
  }
  if (deployment?.startsWith("dev:") || deployment?.startsWith("preview:")) {
    return deployment.includes("local") ? "local" : "deployed";
  }
  if (env.CONVEX_CLOUD_URL?.trim() || env.CONVEX_SITE_URL?.trim()) {
    return "deployed";
  }
  return undefined;
}

/** Classifies the runtime. Anything not provably local counts as deployed. */
export function resolveDeploymentKind(
  env: RuntimeEnvSnapshot = readRuntimeEnv(),
): DeploymentKind {
  if (
    env.ENVIRONMENT?.trim().toLowerCase() === "production" ||
    env.VERCEL_ENV?.trim().toLowerCase() === "production" ||
    env.NODE_ENV?.trim().toLowerCase() === "production"
  ) {
    return "production";
  }

  const convexKind = convexDeploymentKind(env);
  if (convexKind) {
    return convexKind;
  }

  if (env.VERCEL_ENV?.trim() || truthy(env.VERCEL)) {
    return "deployed";
  }

  return "local";
}

export function isProductionRuntime(
  env: RuntimeEnvSnapshot = readRuntimeEnv(),
): boolean {
  return resolveDeploymentKind(env) === "production";
}

/** True only for a developer machine or an automated test runner. */
export function isLocalRuntime(
  env: RuntimeEnvSnapshot = readRuntimeEnv(),
): boolean {
  return resolveDeploymentKind(env) === "local";
}

export function isTestRuntime(
  env: RuntimeEnvSnapshot = readRuntimeEnv(),
): boolean {
  return (
    truthy(env.VITEST) ||
    env.VITEST_WORKER_ID !== undefined ||
    env.NODE_ENV?.trim().toLowerCase() === "test"
  );
}

/** Fixture paths require an explicit opt-in; a missing secret is not an opt-in. */
export function fixtureModeExplicitlyEnabled(
  env: RuntimeEnvSnapshot = readRuntimeEnv(),
): boolean {
  return (
    truthy(env.MYTAB_ALLOW_FIXTURES) ||
    truthy(env.MYTAB_FIXTURE_MODE) ||
    isTestRuntime(env)
  );
}

/** True when a fixture path may run. Branching callers must still assert. */
export function fixturePathAllowed(
  env: RuntimeEnvSnapshot = readRuntimeEnv(),
): boolean {
  return resolveDeploymentKind(env) === "local" && fixtureModeExplicitlyEnabled(env);
}

/** Fail-closed guard: throws a named error rather than returning fixture data. */
export function assertFixturePathAllowed(
  subsystem: string,
  env: RuntimeEnvSnapshot = readRuntimeEnv(),
): void {
  if (fixturePathAllowed(env)) {
    return;
  }
  const kind = resolveDeploymentKind(env);
  throw new FixtureModeNotPermittedError(
    subsystem,
    kind === "local"
      ? "MYTAB_ALLOW_FIXTURES is not set"
      : `runtime is a real deployment (${kind})`,
  );
}

/** True when a surface must render the non-production / manual-data badge. */
export function shouldBadgeNonProductionData(
  env: RuntimeEnvSnapshot = readRuntimeEnv(),
): boolean {
  return !isProductionRuntime(env);
}

/** Live paths must name the credential they need so a missing one fails loudly. */
export function requireLiveCredential(
  subsystem: string,
  credentialName: string,
  value: string | undefined,
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new RuntimeGuardError(
      RUNTIME_GUARD_FAILURE.LIVE_CREDENTIAL_MISSING,
      subsystem,
      credentialName,
    );
  }
  return trimmed;
}
