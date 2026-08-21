/**
 * Documents which environment variables belong on Vercel vs Convex (AD-19).
 * Used by tests and CI to catch misplaced secrets before deploy.
 */

/** Keys that must only exist in the Vercel (Next.js) runtime. */
export const VERCEL_ONLY_KEYS = [
  "CONVEX_DEPLOY_KEY",
  /** AD-5 fallback — only if token bridge is activated */
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET_VERCEL",
  "TOKEN_BRIDGE_SIGNING_KEY",
] as const;

/** Keys that must only exist in the Convex Cloud runtime. */
export const CONVEX_ONLY_KEYS = [
  "DFLOW_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "PRIVY_APP_SECRET",
  "PRIVY_SPONSOR_WALLET_ID",
  "SOLANA_RPC_URL",
  "SOLANA_RPC_API_KEY",
  "FX_POLICY",
  "PROVIDER_WEBHOOK_SECRET",
] as const;

/** Client-safe public keys — the only allowed NEXT_PUBLIC_* server-adjacent vars. */
export const ALLOWED_PUBLIC_KEYS = ["NEXT_PUBLIC_CONVEX_URL"] as const;

export type EnvMap = Record<string, string | undefined>;

export type EnvContractViolation = {
  key: string;
  message: string;
};

/**
 * Validates that secrets are placed in the correct runtime.
 * @param vercelEnv - Variables configured for Vercel / Next.js
 * @param convexEnv - Variables configured for Convex Cloud
 */
export function validateEnvPlacement(
  vercelEnv: EnvMap,
  convexEnv: EnvMap,
): { valid: boolean; violations: EnvContractViolation[] } {
  const violations: EnvContractViolation[] = [];

  for (const key of CONVEX_ONLY_KEYS) {
    if (isSet(vercelEnv[key])) {
      violations.push({
        key,
        message: `${key} must be configured in Convex, not Vercel (AD-19).`,
      });
    }
  }

  for (const key of VERCEL_ONLY_KEYS) {
    if (isSet(convexEnv[key])) {
      violations.push({
        key,
        message: `${key} must be configured in Vercel, not Convex (AD-19).`,
      });
    }
  }

  for (const [key, value] of Object.entries({ ...vercelEnv, ...convexEnv })) {
    if (!key.startsWith("NEXT_PUBLIC_") || !isSet(value)) {
      continue;
    }
    if (!(ALLOWED_PUBLIC_KEYS as readonly string[]).includes(key)) {
      violations.push({
        key,
        message: `${key} uses NEXT_PUBLIC_ prefix but is not in the allowlist (AD-19).`,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}

function isSet(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

/**
 * Parses a Convex deployment identifier from env vars used at build/runtime.
 * Accepts CONVEX_DEPLOYMENT (e.g. `prod:happy-animal-123`) or extracts the
 * deployment name from NEXT_PUBLIC_CONVEX_URL.
 */
export function resolveConvexDeployment(env: EnvMap): string | null {
  const direct = env.CONVEX_DEPLOYMENT?.trim();
  if (direct) {
    const parts = direct.split(":");
    return parts.length > 1 ? parts.slice(1).join(":") : direct;
  }

  const url = env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) {
    return null;
  }

  try {
    const hostname = new URL(url).hostname;
    const match = hostname.match(/^([^.]+)\.convex\.(cloud|site)$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
