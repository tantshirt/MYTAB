import { Instrument_Sans, Noto_Sans_Thai, Schibsted_Grotesk } from "next/font/google";
import { MYTAB_TYPOGRAPHY } from "./tokens";
import { withThaiFallback } from "./globalStyles";

/** Instrument Sans via next/font with documented fallback stack (UX-DR2). */
export const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
  weight: ["400", "500", "600"],
});

/**
 * Thai companion face (POLISH-SPEC §2.2).
 *
 * Instrument Sans has **no Thai glyphs at all** — every Thai codepoint in a
 * scanned item name (ต้มยำกุ้ง, ส้มตำ, ผัดไทย, แกงเขียวหวาน) falls straight
 * through it. Without a named Thai family next in line it lands on whatever the
 * platform installs, in the middle of a card whose whole job is looking exact.
 * Measured in Chrome, the macOS fallback draws Thai ink 14.17px above and
 * 3.88px below the baseline at 15px; Noto Sans Thai draws the same string at
 * 12.64px / 3.91px — a tighter face, and the same one on every device.
 *
 * Noto rather than IBM Plex Sans Thai, from the two files Google serves
 * (units/em 1000 for all three faces):
 *
 * | face               | ascent | descent | line box | Thai ink, canonical set |
 * |--------------------|--------|---------|----------|-------------------------|
 * | Instrument Sans    |   970  |  −250   | 1.220 em | — (no Thai)             |
 * | Noto Sans Thai     |  1061  |  −450   | 1.511 em | −0.261 … +0.846 em      |
 * | IBM Plex Sans Thai |  1116  |  −534   | 1.650 em | −0.344 … +0.866 em      |
 *
 * Plex's box is 0.14 em taller and its ink descends 0.083 em further, so every
 * mixed line it touches outgrows the Latin-only line beside it by more. Noto
 * sits closer to Instrument Sans on both counts and carries the same 400/500/600
 * weights, which is what pairing "at the same optical size" asks for.
 *
 * Two settings here are load-bearing, and both were verified by measurement
 * rather than inference:
 *
 * - `subsets: ["thai"]` keeps only Google's thai `@font-face` block, whose
 *   `unicode-range: U+0E01-0E5B, …` confines this family to Thai codepoints.
 *   That is what stops it touching Latin: with the range, a Latin-only line at
 *   20px/600 measures 23px with or without this family in the stack. Pull in
 *   the latin subsets as well and the same line jumps to 30px — a 30% rhythm
 *   regression on every Latin line in the product, for text that has no Thai
 *   in it at all.
 *
 * - `adjustFontFallback: false`. Next's metric-matched fallback is an unranged
 *   `local("Arial")` face carrying *this* font's ascent/descent overrides, so it
 *   applies to Latin too and reintroduces the exact same regression: measured at
 *   30px for the 20px/600 Latin line. A metric-matched fallback for a Thai-only
 *   face buys nothing anyway — Arial has no Thai to match.
 */
export const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai"],
  variable: "--font-noto-thai",
  display: "swap",
  weight: ["400", "500", "600"],
  adjustFontFallback: false,
});

/**
 * Wordmark face — the lockup only, never UI text.
 *
 * A warmer grotesque than Instrument Sans: enough character to read as a
 * wordmark, close enough that the two read as relatives rather than strangers.
 */
export const schibstedGrotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted-grotesk",
  display: "swap",
  weight: ["600"],
});

/**
 * Publishes the Thai face to the global CSS.
 *
 * `MYTAB_GLOBAL_CSS` cannot import this module: `next/font/google` is a
 * build-time loader and resolves to a plain, non-callable module anywhere the
 * Next compiler is not running — including the unit tests that assert on the
 * global CSS string. So the Latin stack is declared there and the Thai-bearing
 * stack is declared here, later in the cascade, by `MyTabThemeProvider`.
 *
 * That ordering is the safe degradation: `.mytab-name` and friends ask for
 * `var(--mytab-font-family-thai, var(--mytab-font-family))`, so a surface that
 * somehow renders outside the provider falls back to the Latin stack rather
 * than inheriting an invalid `font-family` from an unbound `var()`.
 */
export const MYTAB_FONT_VARIABLE_CSS = `:root {
  --font-noto-thai: ${notoSansThai.style.fontFamily};
  --mytab-font-family-thai: ${withThaiFallback(MYTAB_TYPOGRAPHY.family)};
}`;
