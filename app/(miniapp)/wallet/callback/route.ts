import { getConvexSiteUrl } from "@/lib/telegram/client";

const RETURN_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Tab</title>
    <style>
      html, body { margin: 0; background: #f6f1e8; color: #0a2038; font-family: ui-sans-serif, system-ui, sans-serif; }
      main { min-height: 100dvh; padding: 24px 20px; }
      p { margin: 0; }
      .lead { font-size: 15px; font-weight: 600; }
      .hint { margin-top: 8px; font-size: 14px; line-height: 1.5; color: #4a5d70; }
    </style>
  </head>
  <body>
    <main>
      <p class="lead">Returning to your tab…</p>
      <p class="hint">If nothing happens, go back to Telegram. We never assume the wallet signed.</p>
    </main>
  </body>
</html>`;

function htmlResponse(): Response {
  return new Response(RETURN_HTML, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Phantom / Solflare / Backpack HTTPS redirect_link.
 * Forwards the query to Convex (Safari cannot share storage with Telegram),
 * then 302s to t.me with a short start param.
 */
export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const challengeId = incoming.searchParams.get("c")?.trim() ?? "";
  const site = getConvexSiteUrl();

  if (!site || !challengeId) {
    return htmlResponse();
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${site}/wallet/ul-callback?${incoming.searchParams.toString()}`, {
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return htmlResponse();
  }

  if (!upstream.ok) {
    return htmlResponse();
  }

  let body: { resumeUrl?: unknown };
  try {
    body = (await upstream.json()) as { resumeUrl?: unknown };
  } catch {
    return htmlResponse();
  }

  if (typeof body.resumeUrl !== "string" || !body.resumeUrl.startsWith("https://t.me/")) {
    return htmlResponse();
  }

  return Response.redirect(body.resumeUrl, 302);
}
