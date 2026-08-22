/**
 * Layout custom properties, published at first paint (POLISH-SPEC §2.7).
 *
 * These resolve correctly with zero JavaScript: Telegram injects
 * `--tg-safe-area-inset-*`, `--tg-content-safe-area-inset-*` and
 * `--tg-viewport-stable-height` on the root element itself (Bot API 8.0), and
 * `env()` covers the standalone-browser and old-client cases. `AppViewportVars`
 * only overwrites them where a client exposes better numbers through JS than it
 * does through CSS.
 *
 * Layout consumes these instead of threading inset numbers through React props.
 */
export const MYTAB_VIEWPORT_CSS = `
  :root {
    --app-pad-top: var(--tg-content-safe-area-inset-top, env(safe-area-inset-top, 0px));
    --app-pad-bottom: max(var(--tg-safe-area-inset-bottom, 0px), env(safe-area-inset-bottom, 0px));
    --app-pad-left: max(var(--tg-safe-area-inset-left, 0px), env(safe-area-inset-left, 0px));
    --app-pad-right: max(var(--tg-safe-area-inset-right, 0px), env(safe-area-inset-right, 0px));
    --app-height: var(--tg-viewport-stable-height, 100dvh);
    --tab-bar-height: 56px;
  }
`;
