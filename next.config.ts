import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

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
  webpack: (config, { isServer }) => {
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
