/**
 * Convex-side entry point for the Privy auth providers.
 *
 * The implementation lives in `lib/privy/authProviders` so that the fixture app
 * id and fixture verification key are not exported from a module under
 * `convex/`. Only the live-path helpers are re-exported here.
 */

export {
  PRIVY_JWT_ISSUERS,
  buildJwksDataUri,
  buildPrivyAuthProviders,
} from "../../lib/privy/authProviders";
