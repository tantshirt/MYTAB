import { describe, expect, it } from "vitest";
import { MYTAB_GLOBAL_CSS, withThaiFallback } from "@/lib/theme/globalStyles";
import { MYTAB_COLORS, MYTAB_ELEVATION, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

/**
 * POLISH-SPEC §6.3 — these four classes are referenced across `features/bills/*`.
 * Before this suite they were defined nowhere and every control rendered as a
 * raw browser default.
 */
describe("POLISH-SPEC §6.3 — control classes", () => {
  const rule = (selector: string) => {
    const start = MYTAB_GLOBAL_CSS.indexOf(`${selector} {`);
    expect(start, `${selector} is not defined`).toBeGreaterThan(-1);
    const end = MYTAB_GLOBAL_CSS.indexOf("}", start);
    return MYTAB_GLOBAL_CSS.slice(start, end);
  };

  it("defines all four referenced classes", () => {
    for (const selector of [
      ".mytab-button-primary",
      ".mytab-button-secondary",
      ".mytab-link-button",
      ".mytab-input",
    ]) {
      expect(MYTAB_GLOBAL_CSS).toContain(`${selector} {`);
    }
  });

  it("every control clears the 44px touch target; primary fields are 52px", () => {
    expect(rule(".mytab-button-primary,\n  .mytab-button-secondary")).toContain(
      "min-height: 52px",
    );
    expect(rule(".mytab-link-button")).toContain("min-height: 44px");
    expect(rule(".mytab-input")).toContain("min-height: 52px");
    // The dense variant still clears the floor.
    expect(rule(".mytab-input--compact")).toContain("min-height: 44px");
  });

  it("controls take their radius from MYTAB_RADIUS.sm", () => {
    expect(rule(".mytab-button-primary,\n  .mytab-button-secondary")).toContain(
      `border-radius: ${MYTAB_RADIUS.sm}`,
    );
    expect(rule(".mytab-input")).toContain(`border-radius: ${MYTAB_RADIUS.sm}`);
  });

  it("the primary button carries the button inset elevation", () => {
    expect(rule(".mytab-button-primary")).toContain(
      `box-shadow: ${MYTAB_ELEVATION.buttonInset}`,
    );
  });

  it("inputs are 16px so iOS does not focus-zoom", () => {
    expect(rule(".mytab-input")).toContain("font-size: 16px");
  });

  it("never uses the `font` shorthand, which would reset tabular numerals", () => {
    expect(MYTAB_GLOBAL_CSS).not.toMatch(/\n\s+font:\s/);
  });

  it("focus-visible rings are colors/primary and visible", () => {
    for (const selector of [
      ".mytab-button-primary:focus-visible",
      ".mytab-button-secondary:focus-visible",
      ".mytab-link-button:focus-visible",
      ".mytab-input:focus-visible",
      ".mytab-focus:focus-visible",
    ]) {
      expect(MYTAB_GLOBAL_CSS).toContain(selector);
    }
    expect(MYTAB_GLOBAL_CSS).toContain(`outline: 2px solid ${MYTAB_COLORS.primary}`);
    expect(MYTAB_GLOBAL_CSS).toContain("outline-offset: 2px");
  });

  it("has :active states on every pressable control", () => {
    expect(MYTAB_GLOBAL_CSS).toContain(".mytab-button-primary:active:not(:disabled)");
    expect(MYTAB_GLOBAL_CSS).toContain(".mytab-button-secondary:active:not(:disabled)");
    expect(MYTAB_GLOBAL_CSS).toContain(".mytab-link-button:active:not(:disabled)");
  });

  it("primary press inverts the inset edge rather than lifting", () => {
    expect(rule(".mytab-button-primary:active:not(:disabled)")).toContain(
      `box-shadow: ${MYTAB_ELEVATION.buttonPressed}`,
    );
    expect(MYTAB_GLOBAL_CSS).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("disabled uses the paper/ink-muted pairing, not border/ink-muted", () => {
    const disabled = rule(
      ".mytab-button-primary:disabled,\n  .mytab-button-secondary:disabled," +
        '\n  .mytab-button-primary[aria-disabled="true"],' +
        '\n  .mytab-button-secondary[aria-disabled="true"]',
    );
    // paper (#F4F7FA) behind ink-muted (#55677D) measures 5.39:1 — clears WCAG AA.
    // The border fill (#DFE7EF) it replaces sat at 4.64:1.
    expect(disabled).toContain(`background: ${MYTAB_COLORS.paper}`);
    expect(disabled).toContain(`color: ${MYTAB_COLORS.inkMuted}`);
    expect(disabled).toContain("cursor: not-allowed");
  });

  it("hardcodes no hex outside the token module", () => {
    const hexes = MYTAB_GLOBAL_CSS.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
    const known = new Set<string>(Object.values(MYTAB_COLORS));
    for (const hex of hexes) {
      expect(known, `${hex} is not a DESIGN.md token`).toContain(hex);
    }
  });
});

describe("POLISH-SPEC §2.3 — the amount column", () => {
  it("sets tabular lining numerals globally on :root", () => {
    expect(MYTAB_GLOBAL_CSS).toMatch(
      /:root\s*\{[^}]*font-variant-numeric:\s*tabular-nums lining-nums/,
    );
  });

  it("carries them into form controls, which do not inherit type by default", () => {
    expect(MYTAB_GLOBAL_CSS).toMatch(
      /button,\s*\n\s*input,\s*\n\s*select,\s*\n\s*textarea\s*\{[^}]*font-variant-numeric: inherit/,
    );
  });

  it("defines the row utilities — names ellipse, amounts never do", () => {
    expect(MYTAB_GLOBAL_CSS).toContain("grid-template-columns: minmax(0, 1fr) auto");
    const label = MYTAB_GLOBAL_CSS.slice(MYTAB_GLOBAL_CSS.indexOf(".mytab-row__label {"));
    expect(label).toContain("min-width: 0");
    expect(label).toContain("text-overflow: ellipsis");
    const amount = MYTAB_GLOBAL_CSS.slice(MYTAB_GLOBAL_CSS.indexOf(".mytab-row__amount {"));
    expect(amount).toContain("flex: none");
    expect(amount).toContain("white-space: nowrap");
    expect(amount).not.toContain("text-overflow: ellipsis");
  });
});

describe("POLISH-SPEC §6.3 — the custom properties .mytab-card depends on", () => {
  it("defines --radius-md and --mytab-elevation-card", () => {
    expect(MYTAB_GLOBAL_CSS).toContain(`--radius-md: ${MYTAB_RADIUS.md}`);
    expect(MYTAB_GLOBAL_CSS).toContain(
      `--mytab-elevation-card: ${MYTAB_ELEVATION.cardShadow}`,
    );
    expect(MYTAB_GLOBAL_CSS).toContain(
      `--mytab-elevation-button-pressed: ${MYTAB_ELEVATION.buttonPressed}`,
    );
  });

  it(".mytab-card consumes them without a silent fallback", () => {
    const card = MYTAB_GLOBAL_CSS.slice(MYTAB_GLOBAL_CSS.indexOf(".mytab-card {"));
    expect(card).toContain("box-shadow: var(--mytab-elevation-card)");
    expect(card).toContain("border-radius: var(--radius-md)");
  });
});

/**
 * DESIGN.md, *Typography*: "Thai and Latin text share the stack and appear
 * together in item names on scanned receipts — line height must accommodate Thai
 * ascenders and descenders without clipping."
 *
 * Every number asserted here was measured in headless Chrome against the
 * canonical fixture strings (ต้มยำกุ้ง, ส้มตำ, ผัดไทย, แกงเขียวหวาน) rendered in
 * Noto Sans Thai, by comparing each element's clip box against the glyph ink box
 * from `measureText().actualBoundingBox*` and counting ink pixels lost to a
 * cropped raster. They are not derived from font tables and they are not
 * guesses; if one of them changes, re-measure before changing the assertion.
 */
describe("DESIGN.md — Thai and Latin on one line", () => {
  const rule = (selector: string) => {
    const start = MYTAB_GLOBAL_CSS.indexOf(`${selector} {`);
    expect(start, `${selector} is not defined`).toBeGreaterThan(-1);
    return MYTAB_GLOBAL_CSS.slice(start, MYTAB_GLOBAL_CSS.indexOf("}", start));
  };

  it("puts the Thai face in the name stack and keeps it out of the global one", () => {
    // Instrument Sans has no U+0E3F either, so ฿ is a Thai codepoint: splice the
    // Thai face into --mytab-font-family and every amount row at line-height
    // normal takes Noto's taller box (measured: 23px -> 30px at 20px/600).
    expect(MYTAB_GLOBAL_CSS).toContain("--mytab-font-family: var(--font-instrument-sans)");
    expect(MYTAB_GLOBAL_CSS).not.toContain("--mytab-font-family: var(--font-instrument-sans), var(--font-noto-thai)");
    expect(withThaiFallback(MYTAB_TYPOGRAPHY.family)).toContain(
      "var(--font-instrument-sans), var(--font-noto-thai)",
    );
  });

  it("splices Thai second, so Latin still resolves from Instrument Sans", () => {
    const spliced = withThaiFallback(MYTAB_TYPOGRAPHY.family).split(",").map((one) => one.trim());
    expect(spliced[0]).toBe("var(--font-instrument-sans)");
    expect(spliced[1]).toBe("var(--font-noto-thai)");
  });

  it("never names Noto Sans Thai as a bare local family", () => {
    // A locally installed copy carries no unicode-range, so it would cover Latin
    // too and inflate every Latin line in the product (measured: 23px -> 30px).
    expect(MYTAB_GLOBAL_CSS).not.toContain('"Noto Sans Thai"');
  });

  it("gives name-bearing elements the Thai stack, with the Latin stack as fallback", () => {
    const names = rule(".mytab-name,\n  .mytab-item-name");
    expect(names).toContain("var(--mytab-font-family-thai, var(--mytab-font-family))");
  });

  it("pins the item-name line box above the measured clipping threshold", () => {
    // At 15px/500 the fixture strings draw ink 12.71px above the baseline and
    // 3.91px below. A 1.2 box clips (12 ink pixels lost on ต้มยำกุ้ง); 1.45
    // clears by 3.29px above and 1.84px below.
    const match = /\.mytab-item-name \{\s*line-height: ([\d.]+);/.exec(MYTAB_GLOBAL_CSS);
    expect(match, ".mytab-item-name must pin a line-height").toBeTruthy();
    expect(Number(match![1])).toBeGreaterThanOrEqual(1.4);
  });

  it("leaves the input a content box tall enough for a Thai descender", () => {
    // 16px text, 1.4 line box, 13px padding => 24px of content against a
    // baseline 18px down and 4.18px of descender: 1.82px of clearance. The
    // previous 15px/1.2 pairing left 20px and lost 4 ink pixels.
    const input = rule(".mytab-input");
    expect(input).toContain("padding: 13px 16px");
    expect(input).toContain("line-height: 1.4");
    expect(input).toContain("min-height: 52px");
    expect(input).toContain("var(--mytab-font-family-thai, var(--mytab-font-family))");

    const compact = rule(".mytab-input--compact");
    expect(compact).toContain("padding: 9px 14px");
    expect(compact).toContain("min-height: 44px");
  });
});
