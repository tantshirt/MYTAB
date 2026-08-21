import { Instrument_Sans } from "next/font/google";

/** Instrument Sans via next/font with documented fallback stack (UX-DR2). */
export const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
  weight: ["400", "500", "600"],
});
