import { describe, expect, it } from "vitest";
import { FIXTURE_GROUP_SURFACE } from "@/features/groups/GroupSurface";
import { avatarTintForUserId } from "@/lib/theme/tokens";

describe("Story 2.7 — Group surface fixture", () => {
  it("AC1 — exposes group currency defaults in plain language", () => {
    expect(FIXTURE_GROUP_SURFACE.defaultCurrency).toBe("THB");
    expect(FIXTURE_GROUP_SURFACE.recipientAsset).toBe("USDC");
  });

  it("AC2 — includes members with wallet readiness flags", () => {
    expect(FIXTURE_GROUP_SURFACE.members.some((m) => m.walletReady)).toBe(true);
    expect(FIXTURE_GROUP_SURFACE.members.some((m) => !m.walletReady)).toBe(true);
  });

  it("AC2 — deterministic avatar tint from user id", () => {
    const member = FIXTURE_GROUP_SURFACE.members[0]!;
    expect(avatarTintForUserId(member.telegramUserId)).toBeTruthy();
  });

  it("AC3 — lists at least one open tab in fixture", () => {
    expect(FIXTURE_GROUP_SURFACE.openTabs.length).toBeGreaterThan(0);
    expect(FIXTURE_GROUP_SURFACE.openTabs[0]?.name).toBe("Sukhumvit Dinner");
  });
});
