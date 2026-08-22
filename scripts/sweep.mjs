#!/usr/bin/env node
/**
 * Responsive & accessibility sweep — the 320px gate.
 *
 * `scripts/smoke.mjs` proves every route *executes*. This proves every route
 * *fits*. They are different failures: a page can hydrate cleanly, log nothing,
 * and still push an amount off the right edge of a 320px phone — which is
 * exactly the class of bug that shipped once already, hidden behind an
 * `overflow-x: hidden` that turned a visible overflow into a silent clip.
 *
 * The standard it enforces comes from the binding docs:
 *
 *   DESIGN.md      "Screen gutters are spacing/4 (16px) and hold at 320px."
 *                  "the layout must survive 320px and never scroll horizontally."
 *   EXPERIENCE.md  "320px width — Hard floor. No horizontal scroll anywhere.
 *                   Amount columns compress before item names truncate."
 *                  "Amounts are never truncated anywhere in this product."
 *                  Touch targets >= 44px, including claim rows, token chips and
 *                   avatar chips.
 *                  "Layout holds at 320px with the largest supported size."
 *
 * Six checks, run at three viewport configurations per route:
 *
 *   1. HORIZONTAL SCROLL. Measured two ways on purpose. `scrollingElement`
 *      scrollWidth is the *shipped* answer — but `lib/theme/globalStyles.ts`
 *      clips html and body on the x axis, so that number can never exceed the
 *      viewport no matter how badly the layout breaks. The honest answer is
 *      geometric: every element's border-box rect is compared against the
 *      viewport, because `getBoundingClientRect()` reports layout position
 *      regardless of who clips it. The widest offender is named with a selector
 *      so the finding is actionable. Descendants of an ellipsis truncator are
 *      excluded — those are handled, and are reported once at the truncator.
 *
 *   2. TRUNCATION. An element is *visually truncated* when its own overflow-x
 *      clips (`hidden`/`clip`) and `scrollWidth > clientWidth`. Each one is
 *      classified: an amount (`[data-mytab-amount]`, `.mytab-tabular`,
 *      `.mytab-type-amount-*`, `.mytab-row__amount`) is a hard defect; a name
 *      with `text-overflow: ellipsis` is the sanctioned behaviour; anything
 *      else is a container clipping its own content.
 *
 *   3. TOUCH TARGETS. Every `button`, `a`, `[role=button|radio|switch]`,
 *      `input`, `select` whose rendered box is under 44px in either dimension.
 *
 *   4. CLIPPING. `overflow-x: hidden` on an element whose content overflows —
 *      handling replaced by hiding. Reported separately from truncation so the
 *      ellipsis pattern is not confused with a clipped container.
 *
 *   5. INERT STICKY. `position: sticky` resolves against the nearest ancestor
 *      scrollport, and `overflow-x: hidden` creates one. Any sticky element
 *      whose scrollport cannot scroll never pins — it renders in flow and moves
 *      with the page, with no error and no visual tell until you scroll. This
 *      check exists because that is exactly what was happening to the tab bar
 *      and every task surface's action bar at HEAD.
 *
 *   6. DYNAMIC TYPE. Every token in `lib/theme/tokens.ts` is an absolute px
 *      value, so Chrome's default-font-size setting (`Page.setFontSizes`) moves
 *      nothing — it only rescales `medium`-relative type. Emulating the
 *      platform text setting therefore has to be done in the page: snapshot the
 *      computed `font-size` (and any px `line-height`) of every element, then
 *      write back 2x as an inline `!important`. Because font-size inherits and
 *      every element is pinned from its own pre-scale computed value, the
 *      result is exactly 200% type everywhere, which is what an Android WebView
 *      `textZoom` of 200 does. It is an emulation, and it is named as one.
 *
 * Auth: outside Telegram, `AuthGate` renders `LaunchSurface` on every route
 * when `NEXT_PUBLIC_PRIVY_APP_ID` is set, so measuring the shipped build would
 * measure the Launch screen ten times. This harness therefore builds its own
 * bundle with Privy and Convex unset — `isPrivyFixtureMode()` — into a separate
 * `distDir`. Real surfaces rather than the Launch screen.
 *
 * Content: no fixture data exists under `app/`, `features/` or `components/`,
 * so that bundle alone would render designed empty states — and an empty state
 * has no amount column to truncate. The sweep's build therefore also sets
 * `MYTAB_SWEEP_FIXTURES=1`, which `next.config.ts` turns into a webpack
 * resolution rule: each `use*Data` seam resolves to a populated stand-in under
 * `tests/sweep/`. It is a build-time substitution, not a runtime flag; nothing
 * in shipped source branches on it, and `next.config.ts` throws rather than
 * aliasing on any build that could be deployed. `POPULATED_MIN` then asserts
 * per route that the substitution actually took, so a silently inert alias
 * fails the run instead of quietly measuring blank screens.
 *
 * Zero dependencies, same as the smoke test: Node's global WebSocket plus
 * Chrome's HTTP target list is a complete CDP client.
 *
 * Usage:  node scripts/sweep.mjs [--base-url=http://…] [--route=/x] [--no-build]
 *                                [--config=320|390|320x2] [--json=path]
 * Env:    CHROME_PATH, SWEEP_SETTLE_MS, SWEEP_TIMEOUT_MS, SWEEP_PARAM, SWEEP_PORT
 */
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = path.join(ROOT, "app");
const SWEEP_DIST = ".next-sweep";

const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
};

const SETTLE_MS = Number(process.env.SWEEP_SETTLE_MS ?? 2200);
const NAV_TIMEOUT_MS = Number(process.env.SWEEP_TIMEOUT_MS ?? 45_000);
const PARAM = process.env.SWEEP_PARAM ?? "sweepfixture";
const TOUCH_MIN = 44;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────────── viewport configs ──────────────────────────── */

const CONFIGS = [
  { id: "320", label: "320x568", width: 320, height: 568, textScale: 1 },
  { id: "390", label: "390x844", width: 390, height: 844, textScale: 1 },
  { id: "320x2", label: "320x568 @200%", width: 320, height: 568, textScale: 2 },
];

/* ────────────────────────────── route discovery ─────────────────────────────
 * Identical enumeration to scripts/smoke.mjs, so the two harnesses can never
 * disagree about what "every route" means.
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
      found.push(...discoverRoutes(child, segments));
      continue;
    }
    found.push(...discoverRoutes(child, [...segments, substitute(name)]));
  }

  return found;
}

function substitute(segment) {
  return /^\[{1,2}(?:\.\.\.)?(.+?)\]{1,2}$/.test(segment) ? PARAM : segment;
}

/*
 * Surfaces that are states of a route rather than routes of their own. The
 * Payment Sheet is keyed on `?settle=` precisely so it survives a reload
 * (`features/settlement/SettleSheetHost.tsx`), which also makes it addressable
 * here — a sheet is the densest money surface in the product and the one most
 * likely to break at 320px, so leaving it unmeasured would be the biggest hole
 * in this sweep.
 */
const VARIANTS = [
  { path: `/tabs/${PARAM}?settle=ob_sweep`, label: "payment sheet" },
  { path: `/tabs/new?group=g_sweep`, label: "new tab (from group)" },
  { path: `/tips/new?to=maya&group=g_sweep`, label: "tip composer (recipient)" },
];

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

/*
 * Fixture-mode env. Empty strings, not deletions: `@next/env` only fills a key
 * that is `undefined`, so an empty value from the shell is what actually keeps
 * `.env.local` from putting the Privy app id back and sending every route to
 * the Launch screen.
 */
function fixtureEnv() {
  return {
    ...process.env,
    NEXT_PUBLIC_PRIVY_APP_ID: "",
    NEXT_PUBLIC_CONVEX_URL: "",
    NEXT_DIST_DIR: SWEEP_DIST,
    /*
     * Populated surfaces, resolved at BUILD time.
     *
     * No fixture data survives under `app/`, `features/` or `components/`, so
     * every surface in a normal build renders its designed empty state — and an
     * empty state has no amount column to truncate, no name to clip and no
     * dense row to overflow. Measuring one would be measuring nothing.
     *
     * `next.config.ts` reads this variable and, ONLY when the whole of the
     * fixture-mode env above also holds, resolves each `use*Data` seam to a
     * populated stand-in under `tests/sweep/`. It is a webpack resolution rule:
     * there is no branch in shipped source, and nothing a deployed bundle can
     * read. `next.config.ts` throws rather than aliasing if this variable is
     * set on any build that is not this one.
     *
     * `POPULATED_MIN` below is the other half: it fails the sweep if a surface
     * comes back with fewer amounts than the fixture puts on it, so a silently
     * inert alias is a red run rather than ten misleading green rows.
     */
    MYTAB_SWEEP_FIXTURES: "1",
    /*
     * `next.config.ts` also refuses the substitution when `VERCEL`/`CI` say the
     * build could be a deployment. This harness must still be runnable *in* CI —
     * the whole point of a gate is that CI runs it — and its bundle is a
     * throwaway that CI never publishes, so it clears those markers for its own
     * build only. The guards that actually stop a shippable bundle carrying
     * fixtures are the dist dir and the two empty credentials above, and those
     * this harness cannot clear: they are what it genuinely is.
     */
    VERCEL: "",
    VERCEL_ENV: "",
    CI: "",
  };
}

/*
 * The least each route must render for its measurement to mean anything.
 *
 * These are floors, not exact counts — the fixtures put considerably more on
 * most of these surfaces. Every entry is the number of elements the audit
 * classifies as an amount (`[data-mytab-amount]` and friends), which is exactly
 * the population that check 3 measures for truncation.
 *
 * A route missing from this map is measured but not required to be populated:
 * `/tabs/new` opens on the setup step, which is a form and legitimately has no
 * amount column until items are added.
 */
const POPULATED_MIN = {
  "/": 10,
  "/activity": 5,
  "/tabs/new": 6,
  "/tips/new": 4,
  [`/groups/${PARAM}`]: 6,
  [`/pay/${PARAM}`]: 1,
  [`/tabs/${PARAM}`]: 8,
  [`/tabs/${PARAM}/bill`]: 30,
  [`/tabs/${PARAM}/receipt`]: 10,
  [`/tabs/${PARAM}?settle=ob_sweep`]: 16,
  [`/tabs/new?group=g_sweep`]: 6,
  [`/tips/new?to=maya&group=g_sweep`]: 4,
  /*
   * `/you` is the one surface with no amount column at all — §4.2 says it has
   * no empty state because it has no list. It is measured, and its floor is
   * honestly zero rather than a number invented to look thorough.
   */
  "/you": 0,
};

/*
 * `next build` rewrites tsconfig.json to add `<distDir>/types/**` to `include`
 * (and reformats the file while it is there). That is correct for the real
 * build and pure noise for a throwaway sweep bundle, so the file is snapshotted
 * and put back.
 */
function buildFixtureBundle() {
  console.log(`▸ building fixture-mode bundle into ${SWEEP_DIST}/ (surfaces, not Launch)`);
  const tsconfigPath = path.join(ROOT, "tsconfig.json");
  let tsconfigBefore = null;
  try {
    tsconfigBefore = readFileSync(tsconfigPath, "utf8");
  } catch {
    /* no tsconfig; nothing to restore */
  }
  const restoreTsconfig = () => {
    if (tsconfigBefore === null) return;
    try {
      if (readFileSync(tsconfigPath, "utf8") !== tsconfigBefore) {
        writeFileSync(tsconfigPath, tsconfigBefore);
      }
    } catch {
      /* leave it alone rather than making it worse */
    }
  };
  const result = spawnSync("npx", ["next", "build"], {
    cwd: ROOT,
    env: { ...fixtureEnv(), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  restoreTsconfig();
  if (result.status !== 0) {
    console.error(result.stdout ?? "");
    console.error(result.stderr ?? "");
    throw new Error(`next build failed with code ${result.status}`);
  }
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
  const profile = mkdtempSync(path.join(tmpdir(), "mytab-sweep-"));
  const proc = spawn(
    bin,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      // Scrollbars must not steal layout width: a 15px classic scrollbar would
      // turn a clean 320px into a false positive on every route.
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
      if (info.webSocketDebuggerUrl) return { proc, profile, bin, wsUrl: info.webSocketDebuggerUrl };
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

/* ─────────────────────────── the in-page audit ───────────────────────────── */

/**
 * Everything below runs inside the page. It is a string because CDP has no
 * other way in; it is one expression so a single `Runtime.evaluate` returns the
 * whole report.
 */
const AUDIT_SOURCE = String.raw`
(() => {
  const TOUCH_MIN = ${TOUCH_MIN};
  const doc = document.documentElement;
  const vw = doc.clientWidth;

  const AMOUNT_SELECTOR =
    "[data-mytab-amount],.mytab-tabular,.mytab-row__amount," +
    "[class*='mytab-type-amount-'],[class*='amount']";

  const isAmount = (el) => {
    if (el.matches(AMOUNT_SELECTOR)) return true;
    // An amount wrapped one level deep (a <span> inside .mytab-row__amount)
    // is still an amount; truncating the wrapper truncates the figure.
    return Boolean(el.closest(AMOUNT_SELECTOR));
  };

  const text = (el) => ((el.innerText || el.textContent || "").trim().replace(/\s+/g, " ")).slice(0, 70);

  const selectorFor = (el) => {
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      let piece = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(piece + "#" + node.id);
        break;
      }
      const cls = (node.getAttribute("class") || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);
      if (cls.length) piece += "." + cls.join(".");
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.prototype.filter.call(
          parent.children,
          (c) => c.tagName === node.tagName,
        );
        if (sibs.length > 1) piece += ":nth-of-type(" + (sibs.indexOf(node) + 1) + ")";
      }
      parts.unshift(piece);
      node = parent;
      depth++;
    }
    return parts.join(" > ");
  };

  const els = Array.prototype.slice.call(document.querySelectorAll("body *"));

  const invisible = (el, cs, rect) => {
    if (cs.visibility === "hidden" || cs.display === "none") return true;
    if (el.closest("[aria-hidden='true']")) return true;
    if (el.classList.contains("mytab-visually-hidden")) return true;
    if (el.closest(".mytab-visually-hidden")) return true;
    if (rect.width < 2 || rect.height < 2) return true;
    // Dev overlays and portals are not the product.
    if (el.closest("nextjs-portal")) return true;
    return false;
  };

  /* ── 1. horizontal overflow, measured geometrically ───────────────────── */

  const inHScroller = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const ox = getComputedStyle(node).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
      node = node.parentElement;
    }
    return false;
  };

  /*
   * An element whose nearest clipping ancestor truncates with an ellipsis is
   * NOT an overflow: it is the documented name-truncation behaviour, seen from
   * the inside. The span inside "5 people . tap what you had" reports a box 9px
   * past the viewport while the user sees a clean ellipsis. Report the ancestor
   * (once, as an accepted ellipsis) and not the text it contains.
   */
  const handledByEllipsis = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if (cs.overflowX === "hidden" || cs.overflowX === "clip") {
        return cs.textOverflow === "ellipsis" && cs.whiteSpace.startsWith("nowrap");
      }
      node = node.parentElement;
    }
    return false;
  };

  const offenders = [];
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (invisible(el, cs, rect)) continue;
    const over = Math.max(rect.right - vw, -rect.left);
    if (over <= 0.5) continue;
    if (inHScroller(el)) continue;
    if (handledByEllipsis(el)) continue;
    offenders.push({
      selector: selectorFor(el),
      overflowPx: Math.round(over * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      left: Math.round(rect.left * 100) / 100,
      right: Math.round(rect.right * 100) / 100,
      text: text(el),
      amount: isAmount(el),
      /* The nearest ancestor that hides the evidence. */
      clippedBy: (() => {
        let node = el.parentElement;
        while (node) {
          if (getComputedStyle(node).overflowX === "hidden") return selectorFor(node);
          node = node.parentElement;
        }
        const rootOx = getComputedStyle(doc).overflowX;
        const bodyOx = getComputedStyle(document.body).overflowX;
        if (rootOx === "hidden") return "html";
        if (bodyOx === "hidden") return "body";
        return null;
      })(),
    });
  }
  // Deepest first: the innermost offender is the one to fix, its ancestors are
  // just carrying it.
  offenders.sort((a, b) => b.overflowPx - a.overflowPx);

  /* ── 2 + 4. truncation and clipping ───────────────────────────────────── */

  const truncated = [];
  const clipped = [];
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (invisible(el, cs, rect)) continue;
    const ox = cs.overflowX;
    const overflowing = el.scrollWidth - el.clientWidth > 1;
    if (!overflowing) continue;

    if (ox === "hidden" || ox === "clip") {
      const ellipsis = cs.textOverflow === "ellipsis" && cs.whiteSpace.startsWith("nowrap");
      const leaf = el.childElementCount === 0 ||
        Array.prototype.every.call(el.children, (c) => getComputedStyle(c).display.startsWith("inline"));
      const amount = isAmount(el);
      const entry = {
        selector: selectorFor(el),
        text: text(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        lostPx: el.scrollWidth - el.clientWidth,
        ellipsis,
        amount,
      };
      /*
       * A text field cannot ellipsis: the platform gives it a scrolling text
       * box instead, and the value stays reachable and editable. That is
       * acceptable for a NAME. It is never acceptable for an amount, which is
       * why the amount branch below is unconditional.
       */
      const field = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
      if (leaf || ellipsis) {
        entry.kind = amount
          ? "amount"
          : ellipsis || field
            ? "name-ellipsis"
            : "name-hard-clip";
        entry.field = field;
        truncated.push(entry);
      } else {
        entry.kind = "container-clip";
        clipped.push(entry);
      }
    }
  }

  /* ── 3. touch targets ─────────────────────────────────────────────────── */

  const INTERACTIVE =
    "button,a,[role='button'],[role='radio'],[role='switch'],[role='tab'],input,select";
  const small = [];
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (el.closest("nextjs-portal")) continue;
    if (el.classList.contains("mytab-visually-hidden") || el.closest(".mytab-visually-hidden")) continue;
    if (el.type === "hidden") continue;
    if (rect.width < 1 && rect.height < 1) continue;
    // An <a> that is a run of text inside a sentence is a link, not a tap
    // target with a box of its own; the rule is about controls.
    const inlineLink = el.tagName === "A" && cs.display === "inline";
    if (inlineLink) continue;
    const w = Math.round(rect.width * 100) / 100;
    const h = Math.round(rect.height * 100) / 100;
    if (w >= TOUCH_MIN - 0.5 && h >= TOUCH_MIN - 0.5) continue;
    small.push({
      selector: selectorFor(el),
      w,
      h,
      text: text(el) || el.getAttribute("aria-label") || "",
      tag: el.tagName.toLowerCase(),
    });
  }

  /* ── the shipped answer, for contrast with the geometric one ──────────── */

  const scroller = document.scrollingElement || doc;
  const shipped = {
    scrollWidth: scroller.scrollWidth,
    clientWidth: scroller.clientWidth,
    overflows: scroller.scrollWidth - scroller.clientWidth > 0.5,
    rootOverflowX: getComputedStyle(doc).overflowX,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
  };

  /* ── 6. sticky elements that can never stick ──────────────────────────── */

  /*
   * position: sticky resolves against the nearest ancestor SCROLLPORT, not the
   * viewport. An overflow of hidden/auto/scroll anywhere above it creates one —
   * and if that ancestor's own height is its content, the scrollport can never
   * scroll and the sticky element is inert: it renders in flow and moves 1:1
   * with the page. There is no error, no warning and no visual tell until you
   * scroll. DESIGN.md requires the tab bar and every task surface's action bar
   * to be pinned, so an inert sticky is a defect, not a nicety.
   */
  const inertSticky = [];
  /*
   * A modal sheet deliberately locks body scroll while it is open
   * (components/settlement-sheet/SheetContainer.tsx). Everything behind the
   * scrim is out of reach by design, so a background sticky that stops pinning
   * for the life of the modal is correct behaviour, not a defect.
   */
  const modalOpen = document.querySelector("[aria-modal='true']");
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.position !== "sticky") continue;
    const rect = el.getBoundingClientRect();
    if (invisible(el, cs, rect)) continue;
    if (modalOpen && !modalOpen.contains(el)) continue;

    let scrollport = null;
    let node = el.parentElement;
    while (node) {
      const pcs = getComputedStyle(node);
      const scrolls = (axis) => ["auto", "scroll", "hidden"].includes(pcs[axis]);
      if (node === doc || node === document.body) {
        if (scrolls("overflowY") || scrolls("overflowX")) scrollport = node;
        break;
      }
      if (scrolls("overflowY") || scrolls("overflowX")) {
        scrollport = node;
        break;
      }
      node = node.parentElement;
    }

    if (!scrollport) continue; // the viewport is the scrollport — correct
    if (scrollport.scrollHeight - scrollport.clientHeight > 1) continue; // really scrolls
    if (scroller.scrollHeight - scroller.clientHeight <= 1) continue; // nothing scrolls at all
    inertSticky.push({
      selector: selectorFor(el),
      text: text(el),
      scrollport: selectorFor(scrollport),
      scrollportOverflow:
        getComputedStyle(scrollport).overflowX + "/" + getComputedStyle(scrollport).overflowY,
    });
  }

  /* ── 7. populated-ness, so an inert build cannot pass by rendering nothing ─ */

  const amountCount = els.filter((el) => {
    if (!el.matches(AMOUNT_SELECTOR)) return false;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (invisible(el, cs, rect)) return false;
    // Receipt Review's figures are editable <input>s: the value is the amount
    // and textContent is empty, so counting text alone would call the densest
    // amount column in the product unpopulated.
    const shown = text(el) || (typeof el.value === "string" ? el.value.trim() : "");
    return shown.length > 0;
  }).length;

  return {
    vw,
    amountCount,
    chars: (document.body.innerText || "").trim().length,
    shipped,
    offenders: offenders.slice(0, 12),
    offenderCount: offenders.length,
    truncated,
    clipped,
    small,
    inertSticky,
  };
})()
`;

/**
 * 200% platform text, emulated in the page.
 *
 * Two passes on purpose: read every computed font-size first, then write them
 * all back. Reading and writing in one pass would compound, because a child's
 * computed size already reflects a parent that was just doubled.
 */
const TEXT_SCALE_SOURCE = (scale) => String.raw`
(() => {
  const scale = ${scale};
  const els = Array.prototype.slice.call(document.querySelectorAll("html, body, body *"));
  const snapshot = els.map((el) => {
    const cs = getComputedStyle(el);
    return { el, fontSize: parseFloat(cs.fontSize), lineHeight: cs.lineHeight };
  });
  for (const entry of snapshot) {
    if (!Number.isFinite(entry.fontSize)) continue;
    entry.el.style.setProperty("font-size", (entry.fontSize * scale).toFixed(3) + "px", "important");
    if (entry.lineHeight && entry.lineHeight.endsWith("px")) {
      const lh = parseFloat(entry.lineHeight);
      if (Number.isFinite(lh)) {
        entry.el.style.setProperty("line-height", (lh * scale).toFixed(3) + "px", "important");
      }
    }
  }
  return snapshot.length;
})()
`;

/**
 * Disclosure rows are collapsed by default (DESIGN.md, `disclosure-row`), which
 * would hide every `breakdown-row` — the densest amount column in the product —
 * from a sweep that only ever measured the initial paint. Only
 * `button[aria-expanded="false"]` is touched, and the URL is checked afterwards
 * so a click that navigated invalidates the measurement instead of corrupting
 * it.
 */
const EXPAND_SOURCE = String.raw`
(() => {
  const before = location.href;
  const buttons = Array.prototype.slice.call(
    document.querySelectorAll("button[aria-expanded='false'], summary"),
  );
  let clicked = 0;
  for (const button of buttons) {
    try {
      button.click();
      clicked++;
    } catch {}
  }
  return { clicked, navigated: location.href !== before };
})()
`;

/* ────────────────────────────── one measurement ──────────────────────────── */

async function measure(browser, url, config) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });

  const errors = [];
  let loaded = false;
  const off = browser.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Page.loadEventFired") loaded = true;
    if (msg.method === "Runtime.exceptionThrown") {
      errors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
    }
  });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await browser.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: false },
      sessionId,
    );
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result?.value;
  };

  let report = null;
  let note = null;
  try {
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Page.enable", {}, sessionId);
    await browser.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: config.width,
        height: config.height,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: config.width,
        screenHeight: config.height,
      },
      sessionId,
    );
    await browser.send("Emulation.setTouchEmulationEnabled", { enabled: true }, sessionId);
    await browser.send("Page.navigate", { url }, sessionId);

    const deadline = Date.now() + NAV_TIMEOUT_MS;
    while (!loaded && Date.now() < deadline) await sleep(100);
    await sleep(SETTLE_MS);

    const expanded = await evaluate(EXPAND_SOURCE);
    if (expanded?.navigated) note = "a disclosure click navigated; measured post-navigation";
    if (expanded?.clicked) await sleep(400);

    if (config.textScale !== 1) {
      await evaluate(TEXT_SCALE_SOURCE(config.textScale));
      await sleep(300);
    }

    report = await evaluate(AUDIT_SOURCE);
  } catch (err) {
    errors.push(`harness: ${err.message}`);
  } finally {
    off();
    try {
      await browser.send("Target.closeTarget", { targetId });
    } catch {
      /* already closed */
    }
  }

  return { url, config, report, note, errors };
}

/* ──────────────────────────── defect extraction ──────────────────────────── */

function defectsFor(result) {
  const found = [];
  const where = `${new URL(result.url).pathname}${new URL(result.url).search} @ ${result.config.label}`;
  if (!result.report) {
    found.push({ severity: "error", where, kind: "unmeasured", detail: result.errors.join("; ") || "no report" });
    return found;
  }
  const r = result.report;

  if (r.chars === 0) {
    found.push({ severity: "error", where, kind: "blank", detail: "rendered no text" });
  }

  /*
   * The surface has to be POPULATED for the measurement to mean anything.
   *
   * Source carries no fixture data, so a build whose seam aliases failed to
   * apply renders designed empty states — which have no amount column, no dense
   * row and nothing to truncate. Every check above would pass, and the sweep
   * would report ten green rows while measuring nothing at all. This turns that
   * silence into a failure.
   */
  const route = `${new URL(result.url).pathname}${new URL(result.url).search}`;
  const minimum = POPULATED_MIN[route];
  if (minimum !== undefined && (r.amountCount ?? 0) < minimum) {
    found.push({
      severity: "error",
      where,
      kind: "unpopulated",
      detail:
        `rendered ${r.amountCount ?? 0} amount(s), expected at least ${minimum}. ` +
        "The surface is empty, so nothing here was actually measured — the " +
        "sweep's build-time seam aliases (next.config.ts, MYTAB_SWEEP_FIXTURES) " +
        "did not apply.",
    });
  }

  for (const o of r.offenders) {
    found.push({
      severity: "error",
      where,
      kind: "horizontal-overflow",
      detail:
        `${o.selector} extends ${o.overflowPx}px past the ${r.vw}px viewport ` +
        `(box ${o.width}px at x=${o.left})` +
        (o.clippedBy ? ` — hidden by overflow-x:hidden on ${o.clippedBy}` : "") +
        (o.text ? ` — "${o.text}"` : ""),
    });
  }

  for (const t of r.truncated) {
    if (t.kind === "amount") {
      found.push({
        severity: "error",
        where,
        kind: "amount-truncated",
        detail: `${t.selector} loses ${t.lostPx}px of an amount — "${t.text}"`,
      });
    } else if (t.kind === "name-hard-clip") {
      found.push({
        severity: "error",
        where,
        kind: "name-clipped-without-ellipsis",
        detail: `${t.selector} clips ${t.lostPx}px with no ellipsis — "${t.text}"`,
      });
    }
    // name-ellipsis is the sanctioned behaviour; counted, never failed.
  }

  for (const c of r.clipped) {
    found.push({
      severity: "error",
      where,
      kind: "container-clip",
      detail:
        `${c.selector} has overflow-x:hidden and ${c.lostPx}px of content beyond it` +
        (c.amount ? " (contains an amount)" : "") +
        (c.text ? ` — "${c.text}"` : ""),
    });
  }

  for (const s of r.small) {
    found.push({
      severity: "error",
      where,
      kind: "touch-target",
      detail: `${s.selector} is ${s.w}x${s.h}px, under ${TOUCH_MIN}px — "${s.text}"`,
    });
  }

  for (const s of r.inertSticky ?? []) {
    found.push({
      severity: "error",
      where,
      kind: "inert-sticky",
      detail:
        `${s.selector} is position:sticky inside ${s.scrollport} ` +
        `(overflow ${s.scrollportOverflow}), which cannot scroll — it will never pin` +
        (s.text ? ` — "${s.text}"` : ""),
    });
  }

  return found;
}

/* ──────────────────────────────── reporting ──────────────────────────────── */

function pad(value, width) {
  const s = String(value);
  return s + " ".repeat(Math.max(0, width - s.length));
}

function printTable(results) {
  const byRoute = new Map();
  for (const result of results) {
    const key = `${new URL(result.url).pathname}${new URL(result.url).search}`;
    if (!byRoute.has(key)) byRoute.set(key, new Map());
    byRoute.get(key).set(result.config.id, result);
  }

  const cell = (result) => {
    if (!result?.report) return "unmeasured";
    const r = result.report;
    const bits = [];
    if (r.offenderCount) bits.push(`ovf ${r.offenderCount}`);
    const amounts = r.truncated.filter((t) => t.kind === "amount").length;
    const hard = r.truncated.filter((t) => t.kind === "name-hard-clip").length;
    const ell = r.truncated.filter((t) => t.kind === "name-ellipsis").length;
    if (amounts) bits.push(`amt ${amounts}`);
    if (hard) bits.push(`clip ${hard}`);
    if (r.clipped.length) bits.push(`box ${r.clipped.length}`);
    if (r.small.length) bits.push(`tap ${r.small.length}`);
    if ((r.inertSticky ?? []).length) bits.push(`stk ${r.inertSticky.length}`);
    if (bits.length === 0) return ell ? `PASS (${ell} ellipsis)` : "PASS";
    return `FAIL ${bits.join(" ")}`;
  };

  const routeWidth = Math.max(5, ...[...byRoute.keys()].map((k) => k.length));
  const cells = [...byRoute.values()].flatMap((m) => CONFIGS.map((c) => cell(m.get(c.id))));
  const colWidth = Math.max(14, ...cells.map((c) => c.length));

  console.log("");
  console.log(
    `  ${pad("ROUTE", routeWidth)}  ${CONFIGS.map((c) => pad(c.label, colWidth)).join("  ")}`,
  );
  console.log(
    `  ${"-".repeat(routeWidth)}  ${CONFIGS.map(() => "-".repeat(colWidth)).join("  ")}`,
  );
  for (const [route, byConfig] of byRoute) {
    console.log(
      `  ${pad(route, routeWidth)}  ${CONFIGS.map((c) => pad(cell(byConfig.get(c.id)), colWidth)).join("  ")}`,
    );
  }
  console.log(
    "\n  ovf = elements past the viewport · amt = truncated amounts · clip = names clipped with no ellipsis",
  );
  console.log(
    "  box = containers hiding their own overflow · tap = touch targets under 44px · stk = sticky that cannot pin",
  );
}

/* ───────────────────────────────── main ──────────────────────────────────── */

async function main() {
  const only = arg("route");
  const configFilter = arg("config");
  const configs = configFilter ? CONFIGS.filter((c) => c.id === configFilter) : CONFIGS;
  if (configs.length === 0) throw new Error(`unknown --config: ${configFilter}`);

  const routes = only
    ? [only]
    : [...new Set(discoverRoutes())].sort().concat(VARIANTS.map((v) => v.path));
  if (routes.length === 0) throw new Error(`no routes discovered under ${APP_DIR}`);

  let server = null;
  let baseUrl = arg("base-url");

  if (!baseUrl) {
    if (arg("no-build") !== "true") buildFixtureBundle();
    const port = Number(process.env.SWEEP_PORT ?? (await freePort()));
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`▸ starting next start on ${baseUrl}`);
    server = spawn("npx", ["next", "start", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...fixtureEnv(), NODE_ENV: "production" },
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
  console.log(`▸ ${routes.length} surface(s) × ${configs.length} viewport config(s)\n`);

  const browser = await Cdp.connect(chrome.wsUrl);
  const results = [];
  try {
    for (const route of routes) {
      const url = new URL(route, baseUrl).toString();
      for (const config of configs) {
        process.stdout.write(`  ${pad(route, 34)} ${pad(config.label, 15)} … `);
        const result = await measure(browser, url, config);
        results.push(result);
        const defects = defectsFor(result);
        console.log(defects.length === 0 ? "ok" : `${defects.length} finding(s)`);
      }
    }
  } finally {
    browser.close();
    chrome.proc.kill("SIGKILL");
    rmSync(chrome.profile, { recursive: true, force: true });
    if (server) server.kill("SIGTERM");
  }

  printTable(results);

  const jsonPath = arg("json");
  if (jsonPath) {
    writeFileSync(path.resolve(ROOT, jsonPath), JSON.stringify(results, null, 2));
    console.log(`\n  raw report → ${jsonPath}`);
  }

  const defects = results.flatMap(defectsFor);
  const accepted = results.flatMap((r) =>
    (r.report?.truncated ?? []).filter((t) => t.kind === "name-ellipsis"),
  );

  if (accepted.length > 0) {
    const unique = new Map();
    for (const a of accepted) unique.set(a.selector + a.text, a);
    console.log(`\n─── accepted (${unique.size} name ellipsis, the documented behaviour) ───`);
    for (const a of [...unique.values()].slice(0, 20)) {
      console.log(`  · ${a.selector} — "${a.text}"`);
    }
  }

  if (defects.length > 0) {
    const byKind = new Map();
    for (const d of defects) {
      if (!byKind.has(d.kind)) byKind.set(d.kind, []);
      byKind.get(d.kind).push(d);
    }
    console.log(`\n─── findings (${defects.length}) ───`);
    for (const [kind, list] of byKind) {
      console.log(`\n${kind} (${list.length})`);
      const seen = new Set();
      for (const d of list) {
        const key = d.detail;
        const first = !seen.has(key);
        seen.add(key);
        console.log(`  ${first ? "•" : "↳"} [${d.where}] ${d.detail}`);
      }
    }
    console.log(`\n✗ sweep failed: ${defects.length} finding(s)\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ sweep passed: ${results.length} measurement(s), no defects\n`);
}

main().catch((err) => {
  console.error(`\n✗ sweep harness error: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
