/**
 * The regression guard for fixture code.
 *
 * Everything in this suite is a static check over the source tree, because the
 * failure mode it defends against is not a wrong value at runtime — it is a
 * fixture path that *exists* on a deployment and gets taken when a secret is
 * missing. By the time such a path runs in production, the damage (a settlement
 * to an address nobody holds, an invite to a bot that does not exist, a JWT
 * verified against a published key) is already done.
 *
 * Four rules:
 *
 *   1. No module under `convex/` exports a `FIXTURE_*` symbol. Fixture data
 *      lives under `lib/`, where it is inert; a deployed Convex module must not
 *      carry it in its public surface.
 *   2. Every exported function that touches a `FIXTURE_*` constant calls
 *      `assertFixturePathAllowed`. The allowlist below is the complete set of
 *      exceptions, each with a reason.
 *   3. No module under `convex/` reads a `NEXT_PUBLIC_*` variable. Those exist
 *      only in the Vercel runtime, so in Convex such a read is always
 *      `undefined` — a flag answering a question nobody asked.
 *   4. No deployed Convex function named like a demo/seed/fixture ships without
 *      `assertFixturePathAllowed` in it. `resetDemoData`, `seedFixtureEvents`
 *      and `useSampleReceipt` were all public, all callable in production, and
 *      all wrote invented data into real records.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function listTsFiles(dir: string): string[] {
  const absolute = path.join(REPO_ROOT, dir);
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "_generated" || entry === "node_modules") {
          continue;
        }
        walk(full);
        continue;
      }
      if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        out.push(path.relative(REPO_ROOT, full));
      }
    }
  };
  walk(absolute);
  return out.sort();
}

/** Strips comments and string literals so matches come from real code only. */
function stripNoise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/'(?:\\.|[^\\'])*'/g, "''")
    .replace(/"(?:\\.|[^\\"])*"/g, '""');
}

const CONVEX_FILES = listTsFiles("convex");
const LIB_FILES = listTsFiles("lib");

describe("rule 1 — no FIXTURE_* symbol is exported from a module under convex/", () => {
  it("finds convex modules to check at all", () => {
    // Guards against a broken walker silently passing the whole suite.
    expect(CONVEX_FILES.length).toBeGreaterThan(20);
  });

  it.each(CONVEX_FILES)("%s exports no FIXTURE_* symbol", (file) => {
    const code = stripNoise(readFileSync(path.join(REPO_ROOT, file), "utf8"));
    const offenders: string[] = [];

    // export const FIXTURE_X / export function FIXTURE_X / export type FIXTURE_X
    for (const match of code.matchAll(
      /export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|type|interface|class|enum)\s+(FIXTURE_\w*)/g,
    )) {
      offenders.push(match[1]!);
    }

    // export { FIXTURE_X } / export { X as FIXTURE_Y } / export type { ... }
    for (const match of code.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
      for (const specifier of match[1]!.split(",")) {
        const exposed = specifier.includes(" as ")
          ? specifier.split(" as ").pop()!
          : specifier;
        const name = exposed.trim();
        if (/^FIXTURE_/.test(name)) {
          offenders.push(name);
        }
      }
    }

    // `export *` re-exports whatever the target has, including future FIXTURE_*.
    if (/export\s+\*\s+from/.test(code)) {
      offenders.push("export * (re-exports an unreviewable surface)");
    }

    expect(
      offenders,
      `${file} exposes fixture symbols from a deployed Convex module. Move them to lib/ and import instead.`,
    ).toEqual([]);
  });
});

/**
 * Exported functions allowed to reference a FIXTURE_* constant without calling
 * `assertFixturePathAllowed` themselves. Each entry needs a reason that explains
 * why the reference cannot put fixture data on a deployment.
 */
const GUARD_EXEMPT: Record<string, string> = {
  // The guard cannot assert on itself.
  "lib/solana/runtimeGuard.ts": "defines assertFixturePathAllowed and its error code",
  // Pure PEM -> JWKS mapping. It echoes the key its caller already holds and
  // decides nothing; buildPrivyAuthProviders in the same file does the asserting.
  "lib/privy/authProviders.ts::buildJwksDataUri":
    "pure encoding of a key the caller supplied; the provider builder asserts",
  // Names the fixture key in order to REFUSE it. Guarding this predicate would
  // invert its purpose: it is the detector that lets buildPrivyAuthProviders
  // assert, and it returns a boolean rather than any fixture value.
  "lib/privy/authProviders.ts::isFixtureVerificationKey":
    "predicate that detects the fixture key so the provider builder can reject it",
};

type ExportedFn = { name: string; body: string };

/** Extracts exported function bodies by brace matching from `export function`. */
function exportedFunctions(code: string): ExportedFn[] {
  const out: ExportedFn[] = [];
  const header = /export\s+(?:async\s+)?function\s+(\w+)/g;
  for (const match of code.matchAll(header)) {
    const name = match[1]!;
    const open = code.indexOf("{", match.index! + match[0].length);
    if (open === -1) {
      continue;
    }
    let depth = 0;
    let end = open;
    for (let i = open; i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out.push({ name, body: code.slice(open, end + 1) });
  }
  return out;
}

describe("rule 2 — every exported function that touches a FIXTURE_* constant is guarded", () => {
  it.each([...CONVEX_FILES, ...LIB_FILES])("%s", (file) => {
    if (GUARD_EXEMPT[file]) {
      return;
    }
    const code = stripNoise(readFileSync(path.join(REPO_ROOT, file), "utf8"));
    const unguarded: string[] = [];

    for (const fn of exportedFunctions(code)) {
      if (GUARD_EXEMPT[`${file}::${fn.name}`]) {
        continue;
      }
      // `\b` would match the tail of DFLOW_FIXTURE_PROGRAM_ID; anchor on a
      // non-identifier character so only real FIXTURE_* names count.
      if (!/(?:^|[^A-Za-z0-9_$])FIXTURE_[A-Z0-9_]+/.test(fn.body)) {
        continue;
      }
      if (fn.body.includes("assertFixturePathAllowed")) {
        continue;
      }
      unguarded.push(fn.name);
    }

    expect(
      unguarded,
      `${file}: these exported functions can hand back fixture data with no ` +
        `assertFixturePathAllowed on the path. Guard them, delete them, or add an ` +
        `entry to GUARD_EXEMPT with a reason.`,
    ).toEqual([]);
  });
});

/**
 * Convex function names that look like seeds/demos/fixtures but are legitimate.
 * Keep this empty if you can — a guarded fixture helper is fine, an unguarded
 * one is not, and the check below already allows the guarded case.
 */
const SEED_SHAPED_EXEMPT: string[] = [];

describe("rule 4 — no unguarded demo/seed/fixture Convex function is deployed", () => {
  it.each(CONVEX_FILES)("%s", (file) => {
    const code = stripNoise(readFileSync(path.join(REPO_ROOT, file), "utf8"));
    const offenders: string[] = [];

    const declaration =
      /export\s+const\s+(\w*(?:demo|fixture|sample|seed)\w*)\s*=\s*(internalMutation|internalAction|internalQuery|mutation|action|query)\s*\(/gi;

    for (const match of code.matchAll(declaration)) {
      const name = match[1]!;
      if (SEED_SHAPED_EXEMPT.includes(`${file}::${name}`)) {
        continue;
      }
      // Brace-match the handler so the guard has to be inside this function.
      let depth = 0;
      let end = code.length;
      for (let i = match.index! + match[0].length - 1; i < code.length; i += 1) {
        if (code[i] === "(") depth += 1;
        else if (code[i] === ")") {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const body = code.slice(match.index!, end);
      if (!body.includes("assertFixturePathAllowed")) {
        offenders.push(`${name} (${match[2]})`);
      }
    }

    expect(
      offenders,
      `${file} deploys a demo/seed/fixture Convex function with no ` +
        `assertFixturePathAllowed in it. On a real deployment these write ` +
        `invented data into real records. Delete it, or guard it.`,
    ).toEqual([]);
  });
});

describe("rule 3 — no Convex module reads a NEXT_PUBLIC_* variable", () => {
  it.each(CONVEX_FILES)("%s", (file) => {
    const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
    const code = stripNoise(source);
    const reads = [...code.matchAll(/process\.env\.(NEXT_PUBLIC_\w+)/g)].map((m) => m[1]!);
    expect(
      reads,
      `${file} reads a Vercel-only variable inside the Convex runtime, where it ` +
        `is always undefined.`,
    ).toEqual([]);

    expect(
      /from\s+["'][^"']*lib\/features\/flags["']/.test(source),
      `${file} imports the Next.js client feature flags, which read NEXT_PUBLIC_* ` +
        `variables that do not exist in Convex.`,
    ).toBe(false);
  });
});

describe("the demo surface is gone", () => {
  it("convex/demo.ts no longer exists", () => {
    expect(() => statSync(path.join(REPO_ROOT, "convex/demo.ts"))).toThrow();
  });

  it("no Convex module still declares a demo mutation or seed", () => {
    for (const file of CONVEX_FILES) {
      const code = stripNoise(readFileSync(path.join(REPO_ROOT, file), "utf8"));
      expect(code, `${file}`).not.toMatch(/\bresetDemoData\b|\bDEMO_PROTAGONISTS\b/);
      expect(code, `${file}`).not.toMatch(/\buseSampleReceipt\b/);
      expect(code, `${file}`).not.toMatch(/\bseedFixtureEvents\b/);
    }
  });

  it("NEXT_PUBLIC_DEMO_MODE is not read anywhere in convex/ or lib/", () => {
    for (const file of [...CONVEX_FILES, ...LIB_FILES]) {
      const code = stripNoise(readFileSync(path.join(REPO_ROOT, file), "utf8"));
      expect(code, `${file}`).not.toContain("NEXT_PUBLIC_DEMO_MODE");
    }
  });
});
