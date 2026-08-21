import type { AuthConfig } from "convex/server";
import { buildPrivyAuthProviders } from "./lib/privyAuth";

/**
 * Privy custom JWT auth (AD-5).
 * Uses a base64 data URI JWKS — no hosted JWKS route on this path.
 * Configure PRIVY_APP_ID and PRIVY_VERIFICATION_KEY in Convex env.
 */
export default {
  providers: buildPrivyAuthProviders({
    appId: process.env.PRIVY_APP_ID,
    verificationKey: process.env.PRIVY_VERIFICATION_KEY,
  }),
} satisfies AuthConfig;
