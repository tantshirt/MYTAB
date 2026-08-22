import { describe, expect, it } from "vitest";
import {
  MYTAB_AVATAR_TINTS,
  avatarTintForUserId,
  avatarTintsForGroup,
} from "@/lib/theme/tokens";

/**
 * The demo cast, in both id shapes the fixtures use.
 * DESIGN.md: "terracotta, blue, emerald, amber, slate, at matched lightness so a
 * row of five reads as one family." Five people who read as one family still
 * have to be told apart.
 */
const CASTS = {
  underscore: ["user_maya", "user_andre", "user_noi", "user_ploy", "user_tim"],
  colon: ["users:maya", "users:andre", "users:noi", "users:ploy", "users:tim"],
};

describe("avatar tints", () => {
  for (const [shape, cast] of Object.entries(CASTS)) {
    it(`gives all five of the demo cast a distinct tint (${shape} ids)`, () => {
      const tints = avatarTintsForGroup(cast);
      expect(new Set(tints.values()).size).toBe(5);
    });
  }

  it("depends on the set, not on render order — an avatar never changes colour when someone joins", () => {
    const a = avatarTintsForGroup(["user_maya", "user_andre", "user_noi"]);
    const b = avatarTintsForGroup(["user_noi", "user_maya", "user_andre"]);
    for (const [userId, tint] of a) {
      expect(b.get(userId)).toBe(tint);
    }
  });

  it("only ever returns palette values", () => {
    const tints = avatarTintsForGroup(CASTS.underscore);
    for (const tint of tints.values()) {
      expect(MYTAB_AVATAR_TINTS).toContain(tint);
    }
    expect(MYTAB_AVATAR_TINTS).toContain(avatarTintForUserId("user_maya"));
  });

  it("keeps assigning past the palette size rather than leaving anyone untinted", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `user_${i}`);
    const tints = avatarTintsForGroup(eight);
    expect(tints.size).toBe(8);
  });

  it("de-duplicates repeated ids", () => {
    const tints = avatarTintsForGroup(["user_maya", "user_maya", "user_noi"]);
    expect(tints.size).toBe(2);
  });

  it("is deterministic across calls", () => {
    expect([...avatarTintsForGroup(CASTS.underscore)]).toEqual([
      ...avatarTintsForGroup(CASTS.underscore),
    ]);
  });
});
