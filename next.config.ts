import { existsSync } from "node:fs";
import path from "node:path";
import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

/**
 * The webpack instance Next hands to the `webpack()` hook, narrowed to the one
 * export this file uses. Typed locally because `webpack` is not a dependency of
 * this project and has no types installed.
 */
type WebpackPluginInstance = { apply: (compiler: unknown) => void };
type WebpackModule = {
  NormalModuleReplacementPlugin: new (
    pattern: RegExp,
    replace: (resource: { request: string }) => void,
  ) => WebpackPluginInstance;
};

/*
 * ───────────────────────── the sweep's fixture aliases ─────────────────────
 *
 * `npm run sweep` measures amount-column truncation, name clipping and touch
 * targets at 320px. All of that needs surfaces with content — an empty state
 * has no amount column to truncate — and no fixture data survives anywhere
 * under `app/`, `features/` or `components/`.
 *
 * So the sweep gets its content by replacing the data seams **at build time**:
 * each `use*Data` seam request below is resolved to a stand-in under
 * `tests/sweep/` that returns `tests/fixtures/` data. This is a webpack
 * resolution rule, not a runtime branch. There is no flag any deployed bundle
 * can read, because the substitution happens before the bundle exists.
 *
 * Four conditions have to hold, and `assertSweepBuildIsIsolated` throws rather
 * than degrading if any of them does not:
 *
 *   1. `MYTAB_SWEEP_FIXTURES=1`, which only `scripts/sweep.mjs` ever sets.
 *   2. `NEXT_DIST_DIR=.next-sweep`, so it can never write the deployable
 *      `.next/` that `next start` and `npm run smoke` serve.
 *   3. `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_PRIVY_APP_ID` both empty —
 *      the fixture-auth condition. A build with either credential is a build
 *      that can reach real data, and must never carry fixtures beside it.
 *   4. Not on Vercel and not in CI.
 *
 * The failure mode this shape is chosen against is a silent one: an alias that
 * quietly does nothing would make the sweep measure empty screens and report
 * ten green rows. `scripts/sweep.mjs` therefore also asserts, per route, that
 * the surface actually rendered amounts.
 */

const SWEEP_DIST_DIR = ".next-sweep";

/** Seam request → the populated stand-in that replaces it in the sweep build. */
const SWEEP_SEAM_ALIASES: Record<string, string> = {
  "@/features/balances/useTabsHomeData": "tests/sweep/useTabsHomeData.ts",
  "@/features/balances/useActivityData": "tests/sweep/useActivityData.ts",
  "@/features/balances/useOweData": "tests/sweep/useOweData.ts",
  "@/features/bills/useNewTabData": "tests/sweep/useNewTabData.ts",
  "@/features/claims/useBillReviewData": "tests/sweep/useBillReviewData.ts",
  "@/features/claims/useClaimBoardData": "tests/sweep/useClaimBoardData.ts",
  "@/features/groups/useGroupData": "tests/sweep/useGroupData.ts",
  "@/features/receipts/useReceiptData": "tests/sweep/useReceiptData.ts",
  "@/features/receipts/useReceiptScanEnabled": "tests/sweep/useReceiptScanEnabled.ts",
  "@/features/settlement/usePaymentProgressData": "tests/sweep/usePaymentProgressData.ts",
  "@/features/settlement/useSettleSheetData": "tests/sweep/useSettleSheetData.ts",
  "@/features/tabs/useTabData": "tests/sweep/useTabData.ts",
  "@/features/tips/useTipComposerData": "tests/sweep/useTipComposerData.ts",
  "@/features/you/useYouSurfaceData": "tests/sweep/useYouSurfaceData.ts",
};

const sweepFixturesRequested = process.env.MYTAB_SWEEP_FIXTURES === "1";

function assertSweepBuildIsIsolated(): void {
  const violations: string[] = [];

  if ((process.env.NEXT_DIST_DIR ?? "") !== SWEEP_DIST_DIR) {
    violations.push(
      `NEXT_DIST_DIR is "${process.env.NEXT_DIST_DIR ?? ""}", not "${SWEEP_DIST_DIR}"`,
    );
  }
  for (const key of ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_PRIVY_APP_ID"]) {
    if ((process.env[key] ?? "").trim() !== "") {
      violations.push(`${key} is set — this build can reach real data`);
    }
  }
  for (const key of ["VERCEL", "VERCEL_ENV", "CI"]) {
    if ((process.env[key] ?? "").trim() !== "") {
      violations.push(`${key} is set — this is a deployment build`);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      "MYTAB_SWEEP_FIXTURES=1 was set on a build that is not the responsive " +
        `sweep's own throwaway bundle:\n  - ${violations.join("\n  - ")}\n` +
        "Fixture data must never be aliased into a bundle anyone can ship.",
    );
  }
}

/**
 * The substitution, as a module-factory replacement rather than a resolve alias.
 *
 * `resolve.alias` loses this fight: `@/…` is a tsconfig path, which Next
 * implements with `JsConfigPathsPlugin` in `resolve.plugins`, and that plugin
 * resolves the request before an alias entry is ever consulted. The result was
 * a substitution that applied to some seams and not others — the worst possible
 * outcome, because the sweep would have looked like it was measuring surfaces.
 *
 * `NormalModuleReplacementPlugin` rewrites the request in
 * `normalModuleFactory.beforeResolve`, upstream of the resolver entirely, so no
 * resolve plugin can win against it.
 *
 * Returns `null` — never a partly-built plugin — on any build that is not the
 * sweep's own, and throws before returning anything at all if the flag is set
 * where it must not be.
 */
function sweepSeamReplacement(
  webpack: WebpackModule,
  root: string,
): WebpackPluginInstance | null {
  if (!sweepFixturesRequested) {
    return null;
  }
  assertSweepBuildIsIsolated();

  const targets = new Map<string, string>();
  for (const [request, relative] of Object.entries(SWEEP_SEAM_ALIASES)) {
    const target = path.join(root, relative);
    if (!existsSync(target)) {
      throw new Error(`sweep stand-in missing: ${relative}`);
    }
    targets.set(request, target);
  }

  const pattern = new RegExp(
    `^(${[...targets.keys()].map((r) => r.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})$`,
  );

  return new webpack.NormalModuleReplacementPlugin(pattern, (resource) => {
    const target = targets.get(resource.request);
    if (target) {
      resource.request = target;
    }
  });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /*
   * The build output directory, overridable per-invocation. `npm run sweep`
   * needs its own bundle — one built in fixture mode, so every route renders
   * its real surface instead of the Launch screen — and it must not clobber the
   * `.next/` that `npm run smoke` and `next start` are pointing at. Unset
   * everywhere else, which leaves the default untouched.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /*
   * Astryx ships untranspiled ESM. `transpilePackages` is what lets
   * `@astryxdesign/core/astryx.css` and the `<Theme>` component be
   * imported from app code at all (POLISH-SPEC §2.11). StyleX itself stays
   * unwired — adding its compiler for zero call sites would be churn.
   */
  transpilePackages: ["@astryxdesign/core", "@astryxdesign/theme-neutral"],
  webpack: (config, { isServer, webpack }) => {
    /*
     * Populated surfaces for `npm run sweep`, substituted at build time. Null
     * on every other build — including every build that could be deployed,
     * which `assertSweepBuildIsIsolated` enforces by throwing.
     */
    const sweepReplacement = sweepSeamReplacement(webpack as WebpackModule, process.cwd());
    if (sweepReplacement) {
      config.plugins = config.plugins ?? [];
      config.plugins.push(sweepReplacement);
    }

    /*
     * `config.externals` is an ARRAY in Next 15, not an object. This originally
     * assigned string keys onto it, which webpack never reads — so the
     * externals were silently inert. Making them real exposed the reason they
     * were never noticed: a `commonjs` external emits `require("...")`, which
     * is correct on the server and a hard `ReferenceError: require is not
     * defined` in the browser.
     *
     * These packages are only reached from `lib/solana` / `lib/dflow`, which no
     * client component imports — they run on the server and inside Convex. So
     * externalise on the SERVER build only and leave the client build alone.
     */
    if (isServer && Array.isArray(config.externals)) {
      const serverOnly = [
        "@solana/kit",
        "@solana-program/memo",
        "@solana-program/system",
        "@solana-program/token",
      ];
      config.externals.push(
        ...serverOnly.map((name) => ({ [name]: `commonjs ${name}` })),
      );
    }

    /*
     * An optional Privy connector we have no flow for. Unresolvable peer
     * import, not a feature — alias it away rather than installing an SDK.
     */
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@farcaster/mini-app-solana": false,
    };

    return config;
  },
};

/*
 * `npm run analyze` opens a treemap of every client chunk. It is the only
 * honest way to argue about First Load JS — the build table tells you a route
 * is 400 kB, the treemap tells you which package put it there.
 */
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

export default withBundleAnalyzer(nextConfig);
