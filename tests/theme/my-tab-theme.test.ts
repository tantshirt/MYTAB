import { describe, expect, it } from "vitest";
import {
  MYTAB_COLORS,
  MYTAB_RADIUS,
  MYTAB_SPACING,
  avatarTintForUserId,
} from "@/lib/theme/tokens";
import { myTabTheme } from "@/lib/theme/myTabTheme";

describe("Story 1.2 — My Tab design foundation", () => {
  it("AC1 — defines DESIGN.md color tokens", () => {
    expect(MYTAB_COLORS.paper).toBe("#F4F7FA");
    expect(MYTAB_COLORS.primary).toBe("#1E51D2");
    expect(MYTAB_COLORS.settled).toBe("#0B7561");
    expect(MYTAB_COLORS.avatar5).toBe("#55677D");
  });

  it("AC1 — defines 4 radius and 8 spacing tokens", () => {
    expect(Object.keys(MYTAB_RADIUS)).toHaveLength(4);
    expect(Object.keys(MYTAB_SPACING)).toHaveLength(8);
    expect(MYTAB_RADIUS.md).toBe("12px");
    expect(MYTAB_SPACING["4"]).toBe("16px");
  });

  it("AC1 — theme extends neutral and forces light-only tokens", () => {
    expect(myTabTheme.name).toBe("mytab");
    expect(myTabTheme.tokens["--color-background-body"]).toBe(MYTAB_COLORS.paper);
    expect(myTabTheme.tokens["--color-accent"]).toBe(MYTAB_COLORS.primary);
  });

  it("AC3 — avatar tints are deterministic by user id", () => {
    const a = avatarTintForUserId("user-42");
    const b = avatarTintForUserId("user-42");
    const c = avatarTintForUserId("user-99");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
