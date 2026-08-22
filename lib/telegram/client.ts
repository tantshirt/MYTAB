/**
 * Convex HTTP Actions base URL, derived from `NEXT_PUBLIC_CONVEX_URL` by
 * swapping the `.convex.cloud` host for `.convex.site`.
 *
 * There is deliberately no `NEXT_PUBLIC_CONVEX_SITE_URL`. `convex deploy --cmd`
 * injects `NEXT_PUBLIC_CONVEX_URL` at build time, so deriving from it means the
 * two can never point at different deployments — which is exactly what a second
 * env var invites.
 */
export function getConvexSiteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".convex.cloud")) {
      parsed.hostname = parsed.hostname.replace(/\.convex\.cloud$/i, ".convex.site");
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
