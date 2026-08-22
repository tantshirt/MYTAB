import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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

export default nextConfig;
