#!/usr/bin/env node
/**
 * Browser smoke test — the gate `next build` cannot be.
 *
 * `next build` compiles and typechecks the bundle; it never executes it. That
 * is how a `ReferenceError: require is not defined` shipped to production on
 * every route with a green build. This harness boots the real production
 * server, drives a real headless Chrome across every route, and fails on
 * anything the browser complains about.
 *
 * Zero dependencies on purpose: Node 22+ ships a global `WebSocket`, and
 * Chrome exposes its target list over plain HTTP, so CDP needs no client
 * library. A smoke test that itself needs an install step is a smoke test that
 * rots.
 *
 * Failure conditions, all of them hard:
 *   - any uncaught exception
 *   - any `console.error` (React hydration mismatches surface here and nowhere else)
 *   - any browser-level error log entry
 *   - any failed or >=400 Document/Script request
 *   - any route whose rendered text is empty (a silently blank page is a failure)
 *
 * Usage:  node scripts/smoke.mjs [--base-url=http://…] [--route=/x] [--keep-open]
 * Env:    CHROME_PATH, SMOKE_SETTLE_MS, SMOKE_TIMEOUT_MS, SMOKE_PARAM,
 *         SMOKE_ALLOW_CONSOLE (regex), SMOKE_PORT
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = path.join(ROOT, "app");

const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
};

const SETTLE_MS = Number(process.env.SMOKE_SETTLE_MS ?? 2500);
const NAV_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);
const PARAM = process.env.SMOKE_PARAM ?? "smoke";
const ALLOW_CONSOLE = process.env.SMOKE_ALLOW_CONSOLE
  ? new RegExp(process.env.SMOKE_ALLOW_CONSOLE)
  : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ────────────────────────────── route discovery ─────────────────────────────
 * Enumerated from the filesystem, never hardcoded, so a route added tomorrow
 * is covered by this test today. App Router conventions:
 *   (group)  → organisational only, contributes no URL segment
 *   _private → not routable
 *   @slot    → parallel route, rendered by its parent, not addressable alone
 *   [p] [...p] [[...p]] → placeholder-substituted
 * Only directories holding a `page.*` are routes; `route.*` handlers are API
 * endpoints and are checked by the build, not the browser.
 */
const PAGE_FILES = new Set(["page.tsx", "page.ts", "page.jsx", "page.js", "page.mjs"]);

function discoverRoutes(dir = APP_DIR, segments = []) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  if (entries.some((e) => e.isFile() && PAGE_FILES.has(e.name))) {
    found.push("/" + segments.join("/"));
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith("_") || name.startsWith("@") || name.startsWith(".")) continue;
    if (name === "api") continue;

    const child = path.join(dir, name);
    if (name.startsWith("(") && name.endsWith(")")) {
      found.push(...discoverRoutes(child, segments)); // route group: no URL segment
      continue;
    }
    found.push(...discoverRoutes(child, [...segments, substitute(name)]));
  }

  return found;
}

function substitute(segment) {
  const m = /^\[{1,2}(?:\.\.\.)?(.+?)\]{1,2}$/.exec(segment);
  if (!m) return segment;
  return PARAM;
}

/* ───────────────────────────────── server ────────────────────────────────── */

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl, proc) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (proc && proc.exitCode !== null) {
      throw new Error(`next start exited early with code ${proc.exitCode}`);
    }
    try {
      const res = await fetch(baseUrl, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error(`server at ${baseUrl} never answered`);
}

/* ───────────────────────────────── chrome ────────────────────────────────── */

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/opt/google/chrome/chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

function resolveChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* next */
    }
  }
  throw new Error(
    `No Chrome binary found. Set CHROME_PATH. Looked in:\n  ${CHROME_CANDIDATES.join("\n  ")}`,
  );
}

async function launchChrome() {
  const bin = resolveChrome();
  const port = await freePort();
  const profile = mkdtempSync(path.join(tmpdir(), "mytab-smoke-"));
  const proc = spawn(
    bin,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox", // CI containers run as root; harmless locally
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--hide-scrollbars",
      "--mute-audio",
      "--window-size=390,844",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const info = await res.json();
      if (info.webSocketDebuggerUrl) {
        return { proc, profile, bin, wsUrl: info.webSocketDebuggerUrl };
      }
    } catch {
      /* still booting */
    }
    await sleep(200);
  }
  proc.kill("SIGKILL");
  throw new Error("Chrome never exposed a debugging endpoint");
}

/* ────────────────────────────── tiny CDP client ──────────────────────────── */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          msg.error ? entry.reject(new Error(msg.error.message)) : entry.resolve(msg.result);
        }
        return;
      }
      for (const fn of this.listeners) fn(msg);
    };
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error(`could not connect to ${url}`));
    });
    return new Cdp(ws);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, NAV_TIMEOUT_MS);
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already gone */
    }
  }
}

/* ────────────────────────────── one route visit ──────────────────────────── */

const describeArg = (a) =>
  a.value !== undefined ? String(a.value) : (a.description ?? a.preview?.description ?? a.type);

async function visit(browser, url) {
  // A fresh target per route: no leaked state, no leaked errors, and a crash on
  // one route cannot cascade into the next one's result.
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });

  const problems = [];
  const requests = new Map();
  let loaded = false;

  const off = browser.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params;

    switch (msg.method) {
      case "Page.loadEventFired":
        loaded = true;
        break;

      case "Runtime.exceptionThrown": {
        const d = p.exceptionDetails;
        const where = d.url ? ` (${d.url}:${d.lineNumber ?? "?"})` : "";
        problems.push(`uncaught: ${d.exception?.description ?? d.text}${where}`);
        break;
      }

      case "Runtime.consoleAPICalled":
        if (p.type === "error") {
          problems.push(`console.error: ${p.args.map(describeArg).join(" ")}`);
        }
        break;

      case "Log.entryAdded":
        if (p.entry.level === "error") {
          problems.push(`log: ${p.entry.text}${p.entry.url ? ` (${p.entry.url})` : ""}`);
        }
        break;

      case "Network.requestWillBeSent":
        requests.set(p.requestId, p.request.url);
        break;

      case "Network.responseReceived":
        if (["Document", "Script"].includes(p.type) && p.response.status >= 400) {
          problems.push(`HTTP ${p.response.status} ${p.type.toLowerCase()}: ${p.response.url}`);
        }
        break;

      case "Network.loadingFailed":
        if (["Document", "Script"].includes(p.type) && !p.canceled) {
          const target = requests.get(p.requestId) ?? "(unknown url)";
          problems.push(`${p.type.toLowerCase()} failed (${p.errorText}): ${target}`);
        }
        break;
    }
  });

  let text = "";
  let title = "";
  try {
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Log.enable", {}, sessionId);
    await browser.send("Network.enable", {}, sessionId);
    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Page.navigate", { url }, sessionId);

    const deadline = Date.now() + NAV_TIMEOUT_MS;
    while (!loaded && Date.now() < deadline) await sleep(100);
    if (!loaded) problems.push(`load event never fired within ${NAV_TIMEOUT_MS}ms`);

    // Hydration, client fetches and lazy chunks all land after `load`.
    await sleep(SETTLE_MS);

    const evaluate = async (expression) => {
      const { result } = await browser.send(
        "Runtime.evaluate",
        { expression, returnByValue: true },
        sessionId,
      );
      return result?.value ?? "";
    };
    text = String(await evaluate("document.body ? document.body.innerText : ''")).trim();
    title = String(await evaluate("document.title"));
  } catch (err) {
    problems.push(`harness: ${err.message}`);
  } finally {
    off();
    try {
      await browser.send("Target.closeTarget", { targetId });
    } catch {
      /* already closed */
    }
  }

  // The allow-list is an escape hatch for known third-party console noise. It
  // deliberately cannot suppress a blank page, which is why that check runs
  // after it.
  const filtered = ALLOW_CONSOLE ? problems.filter((p) => !ALLOW_CONSOLE.test(p)) : problems;
  if (text.length === 0) {
    filtered.push("rendered no text — page is blank");
  }

  return { url, title, chars: text.length, problems: [...new Set(filtered)] };
}

/* ──────────────────────────────── reporting ──────────────────────────────── */

function table(results) {
  const rows = results.map((r) => ({
    route: new URL(r.url).pathname,
    status: r.problems.length === 0 ? "PASS" : "FAIL",
    chars: String(r.chars),
    detail: r.problems.length === 0 ? "" : `${r.problems.length} problem(s)`,
  }));
  const head = { route: "ROUTE", status: "RESULT", chars: "TEXT", detail: "" };
  const width = (key) =>
    Math.max(head[key].length, ...rows.map((r) => r[key].length));
  const w = { route: width("route"), status: width("status"), chars: width("chars") };
  const line = (r) =>
    `  ${r.route.padEnd(w.route)}  ${r.status.padEnd(w.status)}  ${r.chars.padStart(w.chars)}  ${r.detail}`.trimEnd();

  console.log("");
  console.log(line(head));
  console.log(`  ${"-".repeat(w.route)}  ${"-".repeat(w.status)}  ${"-".repeat(w.chars)}`);
  for (const r of rows) console.log(line(r));
}

/* ───────────────────────────────── main ──────────────────────────────────── */

async function main() {
  const only = arg("route");
  const routes = only ? [only] : [...new Set(discoverRoutes())].sort();
  if (routes.length === 0) throw new Error(`no routes discovered under ${APP_DIR}`);

  let server = null;
  let baseUrl = arg("base-url");

  if (!baseUrl) {
    const port = Number(process.env.SMOKE_PORT ?? (await freePort()));
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`▸ starting next start on ${baseUrl}`);
    server = spawn("npx", ["next", "start", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production" },
    });
    let serverLog = "";
    const capture = (buf) => {
      serverLog += buf.toString();
    };
    server.stdout.on("data", capture);
    server.stderr.on("data", capture);
    try {
      await waitForServer(baseUrl, server);
    } catch (err) {
      console.error(serverLog);
      throw err;
    }
  } else {
    await waitForServer(baseUrl, null);
  }

  const chrome = await launchChrome();
  console.log(`▸ chrome: ${chrome.bin}`);
  console.log(`▸ ${routes.length} route(s) discovered from app/\n`);

  const browser = await Cdp.connect(chrome.wsUrl);
  const results = [];
  try {
    for (const route of routes) {
      const url = new URL(route, baseUrl).toString();
      process.stdout.write(`  visiting ${route} … `);
      const result = await visit(browser, url);
      results.push(result);
      console.log(result.problems.length === 0 ? "ok" : `FAILED (${result.problems.length})`);
    }
  } finally {
    browser.close();
    chrome.proc.kill("SIGKILL");
    /*
     * Chrome keeps writing to its profile for a moment after SIGKILL, so an
     * immediate remove races it and throws ENOTEMPTY — `force` does not cover
     * that, it only covers a missing path. Retry, then give up quietly: this is
     * a temp directory, and letting its cleanup fail the run reports a red gate
     * over eleven green routes, which is worse than leaving a folder behind.
     */
    try {
      rmSync(chrome.profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      console.log(`▸ left behind ${chrome.profile} (Chrome still had it open)`);
    }
    if (server && !arg("keep-open")) server.kill("SIGTERM");
  }

  table(results);

  const failures = results.filter((r) => r.problems.length > 0);
  if (failures.length > 0) {
    console.log("\n─── failures ───");
    for (const f of failures) {
      console.log(`\n${new URL(f.url).pathname}`);
      for (const p of f.problems) console.log(`  • ${p}`);
    }
    console.log(`\n✗ smoke failed: ${failures.length}/${results.length} route(s)\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ smoke passed: ${results.length} route(s), no console errors\n`);
}

main().catch((err) => {
  console.error(`\n✗ smoke harness error: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
