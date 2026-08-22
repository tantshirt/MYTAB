/**
 * Build metadata for the You surface footer.
 *
 * Not Convex state and not a fixture: the label is the deployment's own commit,
 * which Vercel exposes to the client build as
 * `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`. Off a Vercel build there is no commit to
 * name, so it reads "local" — which is true.
 */
const COMMIT = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").trim();

export const BUILD_LABEL = COMMIT.length > 0 ? COMMIT.slice(0, 7) : "local";

/** The support chat. A real destination, not a placeholder. */
export const SUPPORT_URL = "https://t.me/mytabsupport";
