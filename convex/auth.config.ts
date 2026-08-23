import type { AuthConfig } from "convex/server";
import { buildPrivyAuthProviders } from "./lib/privyAuth";

/**
 * Privy custom JWT auth (AD-5).
 *
 * The verification material comes from Privy's hosted JWKS for this app, not
 * from a pinned PEM. Two reasons, both learned the hard way:
 *
 *   - Privy publishes MORE THAN ONE ES256 signing key per app and rotates
 *     between them. A single pinned key verifies tokens signed with one and
 *     rejects the rest, which surfaces as intermittent, unattributable
 *     UNAUTHORIZED errors rather than as a configuration fault.
 *   - A PEM is something a human pastes, and the thing pasted here was the
 *     fixture key out of this repository. That made the deployment reject every
 *     genuine Privy token while trusting anything signed by a key whose public
 *     half is committed in `lib/privy/authProviders.ts`.
 *
 * `PRIVY_VERIFICATION_KEY` is deliberately NOT read here. Convex requires every
 * `process.env` name referenced in this file to be set, so naming it would make
 * the pin mandatory again — and the pin is the failure mode.
 *
 * Configure PRIVY_APP_ID in the Convex dashboard.
 */
export default {
  providers: buildPrivyAuthProviders({
    appId: process.env.PRIVY_APP_ID,
  }),
} satisfies AuthConfig;
