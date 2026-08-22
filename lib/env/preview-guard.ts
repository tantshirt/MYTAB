/**
 * Fail-closed egress guard for preview and non-production environments (AD-3).
 * Blocks outbound calls to production providers unless explicitly in production.
 */

export type RuntimeEnv = {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  ENVIRONMENT?: string;
};

/** Hostname patterns blocked in preview / non-production egress. */
export const PREVIEW_BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^api\.telegram\.org$/i,
  /^.*\.privy\.io$/i,
  /^auth\.privy\.io$/i,
  /^api\.privy\.io$/i,
  /^.*\.dflow\.net$/i,
  /^quote-api\.dflow\.net$/i,
  /^api\.openai\.com$/i,
  /^ai-gateway\.vercel\.sh$/i,
  /^.*\.helius-rpc\.com$/i,
  /^.*\.quicknode\.com$/i,
  /^api\.mainnet-beta\.solana\.com$/i,
  /^mainnet\.helius-rpc\.com$/i,
];

export class PreviewEgressBlockedError extends Error {
  readonly hostname: string;

  constructor(hostname: string) {
    super(
      `Egress to ${hostname} is blocked in non-production environments (AD-3).`,
    );
    this.name = "PreviewEgressBlockedError";
    this.hostname = hostname;
  }
}

/** Returns true when the runtime is production (egress allowed). */
export function isProductionRuntime(env: RuntimeEnv = readProcessEnv()): boolean {
  if (env.ENVIRONMENT === "production") {
    return true;
  }
  if (env.VERCEL_ENV === "production") {
    return true;
  }
  if (env.NODE_ENV === "production" && env.VERCEL_ENV === undefined) {
    return true;
  }
  return false;
}

/** Returns true when the non-production badge should render. */
export function shouldShowNonProductionBadge(
  env: RuntimeEnv = readProcessEnv(),
): boolean {
  return !isProductionRuntime(env);
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return PREVIEW_BLOCKED_HOST_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

/**
 * Asserts that an outbound URL is permitted in the current environment.
 * Throws PreviewEgressBlockedError when preview/non-production would reach a blocked host.
 */
export function assertPreviewEgressAllowed(
  input: string | URL,
  env: RuntimeEnv = readProcessEnv(),
): void {
  if (isProductionRuntime(env)) {
    return;
  }

  const url = typeof input === "string" ? new URL(input) : input;
  if (isBlockedHostname(url.hostname)) {
    throw new PreviewEgressBlockedError(url.hostname);
  }
}

/**
 * Guarded fetch wrapper — denies blocked hosts in preview/non-production.
 * `fetchImpl` is for tests; production callers omit it.
 */
export async function guardedFetch(
  input: string | URL,
  init?: RequestInit,
  env?: RuntimeEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  assertPreviewEgressAllowed(input, env);
  return fetchImpl(input, init);
}

function readProcessEnv(): RuntimeEnv {
  if (typeof process === "undefined") {
    return {};
  }
  return {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    ENVIRONMENT: process.env.ENVIRONMENT,
  };
}
