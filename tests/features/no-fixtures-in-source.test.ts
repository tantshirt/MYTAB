/**
 * The regression that matters: no surface can render invented data.
 *
 * Every fixture this product ever had lived one import away from a screen. The
 * failure mode is not a wrong value in a test — it is a bill, a balance or a
 * name that nobody owes appearing on a real person's phone, in a build that
 * type-checks, passes every unit test and renders beautifully. Only a static
 * check over the source tree catches that, because by the time it renders the
 * mistake has already shipped.
 *
 * Four rules:
 *
 *   1. Nothing under `app/`, `features/` or `components/` imports from
 *      `tests/`. Fixture data lives in `tests/fixtures/`, the sweep's populated
 *      stand-ins live in `tests/sweep/`, and neither is reachable from source.
 *   2. Nothing under those trees declares a `FIXTURE_`-prefixed data constant.
 *      Moving the fixtures out is worth nothing if a new one can be typed in.
 *   3. Every seam `next.config.ts` aliases for the sweep exists, and is
 *      imported by source only through the exact `@/…` request the alias
 *      matches. A relative import would resolve past the alias and the sweep
 *      would silently measure an empty surface.
 *   4. `next.config.ts` gates that alias on all four isolation conditions, so
 *      it cannot exist in a bundle anyone can ship.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_TREES = ["app", "features", "components"];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry.startsWith(".")) {
        continue;
      }
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        out.push(path.relative(REPO_ROOT, full));
      }
    }
  };
  walk(path.join(REPO_ROOT, dir));
  return out.sort();
}

/** Strips comments and template/quoted strings so matches come from real code. */
function stripNoise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/'(?:\\.|[^\\'])*'/g, "''")
    .replace(/"(?:\\.|[^\\"])*"/g, '""');
}

const SOURCE_FILES = SOURCE_TREES.flatMap(listSourceFiles);
const NEXT_CONFIG = readFileSync(path.join(REPO_ROOT, "next.config.ts"), "utf8");

describe("rule 1 — no source file imports from tests/", () => {
  it("finds source files to check at all", () => {
    // Guards against a broken walker silently passing the whole suite.
    expect(SOURCE_FILES.length).toBeGreaterThan(40);
  });

  it.each(SOURCE_FILES)("%s", (file) => {
    const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
    const offenders = [
      ...source.matchAll(/(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g),
    ]
      .map((match) => match[1]!)
      .filter(
        (request) =>
          /^@\/tests\//.test(request) ||
          /(^|\/)tests\/(fixtures|sweep)\//.test(request) ||
          /(^|\/)\.\.\/tests\//.test(request),
      );

    expect(
      offenders,
      `${file} reaches into tests/. Fixture data must never be importable from ` +
        `a surface — move what it needs into source as real data, or delete it.`,
    ).toEqual([]);
  });
});

describe("rule 2 — no source file declares a FIXTURE_* data constant", () => {
  it.each(SOURCE_FILES)("%s", (file) => {
    const code = stripNoise(readFileSync(path.join(REPO_ROOT, file), "utf8"));
    const offenders: string[] = [];

    for (const match of code.matchAll(
      /(?:^|[^A-Za-z0-9_$])(?:const|let|var|function|class|enum)\s+(FIXTURE_\w*)/g,
    )) {
      offenders.push(match[1]!);
    }
    for (const match of code.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
      for (const specifier of match[1]!.split(",")) {
        const exposed = specifier.includes(" as ")
          ? specifier.split(" as ").pop()!
          : specifier;
        if (/^FIXTURE_/.test(exposed.trim())) {
          offenders.push(exposed.trim());
        }
      }
    }

    /*
     * `fixture-auth.tsx` is the deliberate exception, and it is not data.
     * `FIXTURE_AUTH_STATE` is the identity that lets the app boot with no Privy
     * credentials — the condition `npm test` and `scripts/sweep.mjs` both run
     * in. It names nobody, owes nobody and renders no amount.
     */
    const allowed =
      file === "features/auth/fixture-auth.tsx" ? ["FIXTURE_AUTH_STATE"] : [];

    expect(
      offenders.filter((name) => !allowed.includes(name)),
      `${file} declares fixture data. Surfaces render what they read or their ` +
        `designed empty state — never a constant.`,
    ).toEqual([]);
  });
});

/** The seam requests `next.config.ts` aliases, parsed out of the map itself. */
function sweepSeamAliases(): Array<[string, string]> {
  const block = NEXT_CONFIG.slice(
    NEXT_CONFIG.indexOf("const SWEEP_SEAM_ALIASES"),
    NEXT_CONFIG.indexOf("const sweepFixturesRequested"),
  );
  return [...block.matchAll(/"(@\/features\/[^"]+)":\s*"([^"]+)"/g)].map(
    (match) => [match[1]!, match[2]!],
  );
}

describe("rule 3 — every sweep seam alias is real and reachable", () => {
  const aliases = sweepSeamAliases();

  it("the alias map was parsed", () => {
    expect(aliases.length).toBeGreaterThanOrEqual(10);
  });

  it.each(aliases)("%s → %s", (request, standIn) => {
    // The seam itself exists in source…
    expect(() =>
      statSync(path.join(REPO_ROOT, `${request.replace("@/", "")}.ts`)),
    ).not.toThrow();
    // …and so does the stand-in that replaces it.
    expect(() => statSync(path.join(REPO_ROOT, standIn))).not.toThrow();
  });

  /*
   * A webpack alias matches the REQUEST STRING. `./useTabData` and
   * `@/features/tabs/useTabData` name the same file and only the second is
   * aliased — so a relative import is a seam the sweep cannot replace, and the
   * sweep would measure an empty surface with no error anywhere.
   */
  it.each(aliases)("%s is never imported by a relative path", (request) => {
    const moduleName = request.split("/").pop()!;
    const offenders: string[] = [];

    for (const file of SOURCE_FILES) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = match[1]!;
        if (!spec.startsWith(".")) {
          continue;
        }
        if (path.basename(spec) === moduleName) {
          offenders.push(`${file} imports "${spec}"`);
        }
      }
    }

    expect(
      offenders,
      `these imports bypass the sweep's alias for ${request}. Import the seam ` +
        `by its "@/…" path so the sweep can replace it.`,
    ).toEqual([]);
  });
});

describe("rule 4 — the sweep alias cannot exist in a shippable bundle", () => {
  it("is gated on MYTAB_SWEEP_FIXTURES", () => {
    expect(NEXT_CONFIG).toContain('process.env.MYTAB_SWEEP_FIXTURES === "1"');
  });

  it.each([
    ["NEXT_DIST_DIR", "SWEEP_DIST_DIR"],
    ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL"],
    ["NEXT_PUBLIC_PRIVY_APP_ID", "NEXT_PUBLIC_PRIVY_APP_ID"],
    ["VERCEL", "VERCEL"],
    ["CI", "CI"],
  ])("refuses to alias when %s says this build could ship", (_name, token) => {
    const guard = NEXT_CONFIG.slice(
      NEXT_CONFIG.indexOf("function assertSweepBuildIsIsolated"),
      NEXT_CONFIG.indexOf("function sweepSeamReplacement"),
    );
    expect(guard).toContain(token);
    expect(guard).toContain("throw new Error");
  });

  it("asserts before it builds the replacement at all", () => {
    const builder = NEXT_CONFIG.slice(NEXT_CONFIG.indexOf("function sweepSeamReplacement"));
    const assertAt = builder.indexOf("assertSweepBuildIsIsolated()");
    const firstTarget = builder.indexOf("targets.set(");
    expect(assertAt).toBeGreaterThan(-1);
    expect(firstTarget).toBeGreaterThan(-1);
    expect(assertAt).toBeLessThan(firstTarget);
  });

  /*
   * The substitution must NOT be a resolve alias. `@/…` is a tsconfig path,
   * which Next resolves with `JsConfigPathsPlugin` in `resolve.plugins` — that
   * plugin beats `resolve.alias`, and the result was a substitution that
   * applied to one seam out of twelve while every check still reported green.
   */
  it("substitutes at the module factory, upstream of every resolve plugin", () => {
    expect(NEXT_CONFIG).toContain("NormalModuleReplacementPlugin");
    expect(NEXT_CONFIG).not.toMatch(/alias\s*\[\s*`?\$\{request\}/);
  });
});
