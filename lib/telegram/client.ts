/** Convex HTTP Actions base URL derived from NEXT_PUBLIC_CONVEX_URL. */
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
