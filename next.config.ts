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
  webpack: (config) => {
    /*
     * `config.externals` is an ARRAY in Next 15, not an object. The previous
     * code assigned string keys onto it, which webpack never reads — so these
     * were silently not externalised. Push an entry instead.
     */
    const serverOnly = [
      "@solana/kit",
      "@solana-program/memo",
      "@solana-program/system",
      "@solana-program/token",
    ];
    /*
     * Optional Privy connectors we never use (fiat onramp, Farcaster). They are
     * unresolvable peer imports, not features — alias them away rather than
     * installing SDKs for flows this product does not have.
     */
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@farcaster/mini-app-solana": false,
    };

    if (Array.isArray(config.externals)) {
      config.externals.push(
        ...serverOnly.map((name) => ({ [name]: `commonjs ${name}` })),
      );
    }
    return config;
  },
};

export default nextConfig;
