import { parseWalletOpenSearch } from "@/lib/wallet/openNamedWallet";

function openHtml(input: {
  scheme: string;
  androidIntent: string;
  https: string;
}): string {
  const scheme = JSON.stringify(input.scheme);
  const intent = JSON.stringify(input.androidIntent);
  const https = JSON.stringify(input.https);
  return `<!doctype html>
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
      a { display: inline-block; margin-top: 20px; min-height: 44px; line-height: 44px; color: #1e51d2; font-weight: 600; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <p class="lead">Opening your wallet…</p>
      <p class="hint">If nothing happens, tap below. We never assume it opened.</p>
      <a id="open" href="#">Open wallet</a>
    </main>
    <script>
      (function () {
        var scheme = ${scheme};
        var intent = ${intent};
        var https = ${https};
        var android = /Android/i.test(navigator.userAgent);
        var primary = android ? intent : scheme;
        function go(url) {
          window.location.assign(url);
        }
        document.getElementById("open").addEventListener("click", function (event) {
          event.preventDefault();
          go(primary);
        });
        go(primary);
        setTimeout(function () { go(https); }, 700);
      })();
    </script>
  </body>
</html>`;
}

const REFUSED_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Tab</title>
    <style>
      html, body { margin: 0; background: #f6f1e8; color: #0a2038; font-family: ui-sans-serif, system-ui, sans-serif; }
      main { min-height: 100dvh; padding: 24px 20px; }
      p { margin: 0; font-size: 15px; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <p>That wallet link is not one we open.</p>
    </main>
  </body>
</html>`;

/**
 * Telegram-legal HTTPS hop. Rebuilds only Phantom / Solflare / Backpack
 * scheme and Android intent URLs from an allowlisted https:// host.
 */
export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const parsed = parseWalletOpenSearch(incoming.search);
  if (!parsed) {
    return new Response(REFUSED_HTML, {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return new Response(openHtml(parsed), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
