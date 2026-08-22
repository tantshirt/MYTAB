/**
 * Group surface fixture — tests and the responsive sweep only.
 *
 * Nothing under `app/`, `features/` or `components/` may import this file.
 */
import type { GroupSurfaceProps } from "@/features/groups/GroupSurface";

export const FIXTURE_GROUP_SURFACE: GroupSurfaceProps = {
  groupId: "groups:fixture-sukhumvit",
  groupName: "Sukhumvit Dinner",
  defaultCurrency: "THB",
  recipientAsset: "USDC",
  position: {
    amountLabel: "฿291.74",
    amountA11yLabel: "291 baht 74",
    subLine: "You owe Maya",
    tone: "owed",
    settleHref: "/?settle=obl-1",
  },
  /*
   * The cast is Maya, Andre, Noi, Ploy and Tim (DESIGN.md) — five, because §1.3
   * draws five, and under the ids the rest of the product already uses
   * (`user_maya`, not `user-maya`). The id is what `avatarTintsForGroup` keys
   * on, so a shape of its own here would have given Maya one colour on the
   * group and another on the claim board.
   */
  members: [
    {
      telegramUserId: "user_maya",
      displayName: "Maya",
      walletReady: true,
      settled: true,
    },
    {
      telegramUserId: "user_andre",
      displayName: "Andre",
      walletReady: true,
      settled: false,
    },
    {
      telegramUserId: "user_noi",
      displayName: "Noi",
      walletReady: true,
      settled: true,
    },
    {
      telegramUserId: "user_ploy",
      displayName: "Ploy",
      walletReady: false,
      settled: false,
    },
    {
      telegramUserId: "user_tim",
      displayName: "Tim",
      walletReady: true,
      settled: false,
    },
  ],
  openTabs: [
    {
      _id: "tabs:fixture-primary",
      name: "Sukhumvit Dinner",
      status: "open",
      updatedAt: Date.now(),
      peopleCount: 5,
      totalLabel: "฿1,840.00",
      settledCount: 1,
      totalCount: 5,
    },
  ],
  activity: [],
};
