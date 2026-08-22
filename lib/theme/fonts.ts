import { Instrument_Sans, Schibsted_Grotesk } from "next/font/google";

/** Instrument Sans via next/font with documented fallback stack (UX-DR2). */
export const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
  weight: ["400", "500", "600"],
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
