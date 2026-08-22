import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
/*
 * Astryx's stylesheet. Without it the `<Theme>` wrapper in
 * `MyTabThemeProvider` renders a plain block `<div>` around the entire app
 * instead of the `display: contents` it intends, which silently breaks any
 * `height: 100%` chain through it (POLISH-SPEC §2.11). It is StyleX atomic CSS
 * on generated class names, so it cannot collide with MYTAB_GLOBAL_CSS.
 *
 * The specifier is the package's `./astryx.css` export, which resolves to
 * `dist/astryx.css`; the raw `dist/` path the spec quotes is not in the
 * `exports` map and fails to resolve.
 */
import "@astryxdesign/core/astryx.css";
import { shouldShowNonProductionBadge } from "@/lib/env/preview-guard";
import { NonProductionBadge } from "@/components/primitives/non-production-badge";
import { instrumentSans, schibstedGrotesk } from "@/lib/theme/fonts";
import { MYTAB_GLOBAL_CSS } from "@/lib/theme/globalStyles";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { MYTAB_VIEWPORT_CSS } from "@/lib/theme/viewportCss";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://mytab-liart.vercel.app"),
  title: "My Tab",
  description: "The group tab that lives in Telegram.",
  applicationName: "My Tab",
  icons: {
    icon: [
      { url: "/brand/favicon.ico", sizes: "any" },
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/brand/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: "My Tab",
    title: "My Tab",
    description: "The group tab that lives in Telegram.",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "My Tab" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "My Tab",
    description: "The group tab that lives in Telegram.",
    images: ["/brand/og.png"],
  },
};

/**
 * POLISH-SPEC §2.2. `viewport-fit=cover` is what makes `env(safe-area-inset-*)`
 * non-zero at all; without it every safe-area fallback resolves to `0px` and the
 * sticky footer sits under the home indicator. `user-scalable=no` removes the
 * double-tap zoom that makes a Mini App feel like a page.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: MYTAB_COLORS.paper,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const showBadge = shouldShowNonProductionBadge();

  return (
    // The paper background is set on the elements themselves so it exists in the
    // server-rendered document, before any CSS bundle, theme token or
    // setBackgroundColor() call can land. Nothing here may depend on hydration.
    <html
      lang="en"
      className={`${instrumentSans.variable} ${schibstedGrotesk.variable}`}
      style={{ background: MYTAB_COLORS.paper }}
    >
      <head>
        {/*
          Telegram's docs specify this exact tag in <head>, before any other
          script, so window.Telegram.WebApp exists before application code runs.
          next/script `beforeInteractive` cannot be used here: in the App Router
          it emits a preload plus a runtime-loaded shim rather than a blocking
          tag. The `?63` is Telegram's documented cache-buster — every query
          value returns byte-identical content, but omitting it risks a stale
          cached copy.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- deliberate: Telegram's
            docs require this tag blocking in <head> before any other script, so
            window.Telegram.WebApp exists before application code runs. next/script's
            beforeInteractive emits a runtime-loaded shim in the App Router, which
            reintroduces the race this tag exists to remove. */}
        <script src="https://telegram.org/js/telegram-web-app.js?63" />
        {/*
          Global CSS is hoisted here rather than injected inside the React tree,
          so type-role classes and the reset apply at first paint instead of
          after hydration (§2.2).
        */}
        <style dangerouslySetInnerHTML={{ __html: MYTAB_GLOBAL_CSS }} />
        <style dangerouslySetInnerHTML={{ __html: MYTAB_VIEWPORT_CSS }} />
      </head>
      <body
        className={instrumentSans.className}
        style={{ background: MYTAB_COLORS.paper, margin: 0 }}
      >
        {showBadge ? <NonProductionBadge /> : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
