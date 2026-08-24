import { MYTAB_TYPOGRAPHY } from "./tokens";
import { withThaiFallback } from "./globalStyles";

/**
 * Deterministic font bindings.
 *
 * `next/font/google` downloads font CSS during every production build. That
 * made a deploy depend on Google Fonts being reachable and left `next build`
 * stuck in its retry loop when the connection reset. The product now uses the
 * same named families when they are installed and explicit platform fallbacks
 * otherwise. This keeps first paint and CI deterministic; bundled local font
 * files can replace these declarations later without changing any consumer.
 */
export const instrumentSans = {
  className: "mytab-font-sans",
  variable: "mytab-font-sans-variable",
  style: {
    fontFamily:
      '"Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
} as const;

export const notoSansThai = {
  className: "mytab-font-thai",
  variable: "mytab-font-thai-variable",
  style: {
    fontFamily:
      '"Noto Sans Thai", "Leelawadee UI", Tahoma, ui-sans-serif, system-ui, sans-serif',
  },
} as const;

export const schibstedGrotesk = {
  className: "mytab-font-wordmark",
  variable: "mytab-font-wordmark-variable",
  style: {
    fontFamily:
      '"Schibsted Grotesk", "Instrument Sans", ui-sans-serif, system-ui, sans-serif',
  },
} as const;

/** Publishes stable font variables and the classes consumed by the root layout. */
export const MYTAB_FONT_VARIABLE_CSS = `:root {
  --font-instrument-sans: "Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-noto-thai: "Noto Sans Thai", "Leelawadee UI", Tahoma, ui-sans-serif, system-ui, sans-serif;
  --font-schibsted-grotesk: "Schibsted Grotesk", "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  --mytab-font-family-thai: ${withThaiFallback(MYTAB_TYPOGRAPHY.family)};
}

.mytab-font-sans {
  font-family: var(--font-instrument-sans);
}

.mytab-font-wordmark {
  font-family: var(--font-schibsted-grotesk);
}`;
