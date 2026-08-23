import { buildWalletUlStartParam } from "../wallet/universalLinkParams";

/**
 * Public-env Telegram resume links for the wallet callback page.
 * Convex mints the canonical `t.me` URL; this is the fallback so Safari
 * always has a tappable Open Telegram control.
 */
export function buildWalletResumeLinks(challengeId: string): {
  https: string | null;
  tg: string | null;
} {
  const bot = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "")
    .trim()
    .replace(/^@/, "");
  const app = (process.env.NEXT_PUBLIC_TELEGRAM_MINIAPP_NAME ?? "app").trim();
  if (!/^[A-Za-z0-9_]{5,32}$/.test(bot) || !/^[A-Za-z0-9_]{3,30}$/.test(app)) {
    return { https: null, tg: null };
  }
  const startapp = buildWalletUlStartParam(challengeId);
  return {
    https: `https://t.me/${bot}/${app}?startapp=${encodeURIComponent(startapp)}`,
    tg: `tg://resolve?domain=${encodeURIComponent(bot)}&appname=${encodeURIComponent(app)}&startapp=${encodeURIComponent(startapp)}`,
  };
}

export function renderWalletCallbackHtml(input: {
  resumeHttps: string | null;
  resumeTg: string | null;
}): string {
  const href = input.resumeHttps ?? "https://t.me";
  const tg = input.resumeTg;
  const auto =
    input.resumeHttps === null
      ? ""
      : `<meta http-equiv="refresh" content="0;url=${escapeHtml(input.resumeHttps)}" />
    <script>location.replace(${JSON.stringify(input.resumeHttps)});</script>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Tab</title>
    ${auto}
    <style>
      html, body { margin: 0; background: #f6f1e8; color: #0a2038; font-family: ui-sans-serif, system-ui, sans-serif; }
      main { min-height: 100dvh; padding: 24px 20px; display: flex; flex-direction: column; justify-content: center; gap: 16px; }
      p { margin: 0; }
      .lead { font-size: 15px; font-weight: 600; }
      .hint { font-size: 14px; line-height: 1.5; color: #4a5d70; }
      a.btn {
        display: flex; align-items: center; justify-content: center;
        min-height: 48px; border-radius: 10px; background: #0a2038; color: #f6f1e8;
        font-size: 15px; font-weight: 600; text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="lead">Returning to your tab…</p>
      <p class="hint">If nothing happens, open Telegram from here. We never assume the wallet confirmed.</p>
      <a class="btn" href="${escapeHtml(href)}">Open Telegram</a>
      ${tg ? `<a class="btn" href="${escapeHtml(tg)}" style="background:transparent;color:#0a2038;border:1px solid #0a2038;">Open Telegram</a>` : ""}
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
