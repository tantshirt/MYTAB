import { getConvexSiteUrl } from "@/lib/telegram/client";
import {
  buildWalletResumeLinks,
  renderWalletCallbackHtml,
} from "@/lib/telegram/walletResumeLinks";

function htmlResponse(challengeId: string, resumeHttps: string | null): Response {
  const fallback = buildWalletResumeLinks(challengeId);
  return new Response(
    renderWalletCallbackHtml({
      resumeHttps: resumeHttps ?? fallback.https,
      resumeTg: fallback.tg,
    }),
    {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

/**
 * Phantom / Solflare / Backpack HTTPS redirect_link.
 * Forwards the query to Convex (Safari cannot share storage with Telegram),
 * then always returns HTML with a tappable Open Telegram control.
 */
export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const challengeId = incoming.searchParams.get("c")?.trim() ?? "";
  const site = getConvexSiteUrl();

  if (!site || !challengeId) {
    return htmlResponse(challengeId, null);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${site}/wallet/ul-callback?${incoming.searchParams.toString()}`, {
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return htmlResponse(challengeId, null);
  }

  if (!upstream.ok) {
    return htmlResponse(challengeId, null);
  }

  let body: { resumeUrl?: unknown };
  try {
    body = (await upstream.json()) as { resumeUrl?: unknown };
  } catch {
    return htmlResponse(challengeId, null);
  }

  const resumeUrl =
    typeof body.resumeUrl === "string" && body.resumeUrl.startsWith("https://t.me/")
      ? body.resumeUrl
      : null;

  return htmlResponse(challengeId, resumeUrl);
}
