/**
 * Claim Board and Bill Review fixtures — tests and the responsive sweep only.
 *
 * Nothing under `app/`, `features/` or `components/` may import this file.
 */
import type { ClaimBoardProps } from "@/features/claims/ClaimBoard";
import type { BillReviewProps } from "@/features/claims/BillReview";

/*
 * The canonical demo fixture: Sukhumvit Dinner, five people, items totalling ฿1,540.00
 * with the Mango Sticky Rice still an orphan — the exact mid-state the artboard draws
 * and the state Flow 4 opens on. Maya is the viewer and the organizer, so her lock is
 * blocked until she assigns that last dish.
 *
 * Per-person item shares here match `BillReview.dc.html` once Ploy takes the mango:
 * Maya ฿460.00, Tim ฿360.00, Ploy ฿270.00, Noi ฿210.00, Andre ฿240.00.
 */
export const FIXTURE_CLAIM_BOARD: ClaimBoardProps = {
  tabName: "Sukhumvit Dinner",
  revision: 3,
  isLocked: false,
  isOrganizer: true,
  viewerUserId: "user_maya",
  organizerDisplayName: "Maya",
  participants: [
    { userId: "user_maya", displayName: "Maya" },
    { userId: "user_noi", displayName: "Noi" },
    { userId: "user_ploy", displayName: "Ploy" },
    { userId: "user_tim", displayName: "Tim" },
    { userId: "user_andre", displayName: "Andre" },
  ],
  items: [
    {
      id: "item_som_tam",
      name: "Som Tam",
      quantity: 1,
      lineTotalMinor: 12000,
      claimantIds: ["user_noi", "user_ploy"],
      viewerOwns: false,
      unassigned: false,
    },
    {
      id: "item_pad_thai",
      name: "Pad Thai",
      quantity: 2,
      lineTotalMinor: 24000,
      claimantIds: ["user_maya", "user_noi"],
      viewerOwns: true,
      unassigned: false,
    },
    {
      id: "item_green_curry",
      name: "Green Curry",
      quantity: 1,
      lineTotalMinor: 18000,
      claimantIds: ["user_andre"],
      viewerOwns: false,
      unassigned: false,
    },
    {
      id: "item_tom_yum",
      name: "Tom Yum Goong",
      quantity: 1,
      lineTotalMinor: 28000,
      claimantIds: ["user_maya"],
      viewerOwns: true,
      unassigned: false,
    },
    {
      id: "item_massaman",
      name: "Massaman Beef",
      quantity: 1,
      lineTotalMinor: 28400,
      claimantIds: ["user_tim"],
      viewerOwns: false,
      unassigned: false,
    },
    {
      id: "item_mango",
      name: "Mango Sticky Rice",
      quantity: 1,
      lineTotalMinor: 18000,
      claimantIds: [],
      viewerOwns: false,
      unassigned: true,
    },
    {
      id: "item_coconut_rice",
      name: "Coconut rice",
      quantity: 4,
      lineTotalMinor: 12000,
      claimantIds: ["user_andre", "user_maya", "user_noi", "user_tim"],
      viewerOwns: true,
      unassigned: false,
    },
    {
      id: "item_singha",
      name: "Singha",
      quantity: 4,
      lineTotalMinor: 12000,
      claimantIds: ["user_andre", "user_maya", "user_ploy", "user_tim"],
      viewerOwns: true,
      unassigned: false,
    },
  ],
  unassignedCount: 1,
  viewerSubtotalMinor: 46000,
  viewerHasClaims: true,
  presenceUserIds: ["user_noi", "user_ploy", "user_andre"],
};

/*
 * The canonical demo fixture from DESIGN.md: Sukhumvit Dinner, five people,
 * ฿1,840.00 total, Andre owing ฿291.74 (240.00 + 24.00 + 18.48 + 9.25 + 0.01).
 *
 * Service is 10% of items; tax is 7% of (items + service); the group tip is a
 * flat ฿9.25 a head. Largest-remainder allocation hands Andre the spare satang
 * and takes it from Tim — which is exactly the asymmetry EXPERIENCE.md requires
 * be disclosed rather than hidden, so this fixture also exercises the negative
 * rounding line.
 *
 * The five totals sum to 184000 exactly, and the "Applied to everyone" block is
 * summed from these same rows, so the two halves of the surface cannot disagree.
 */
export const FIXTURE_BILL_REVIEW: BillReviewProps = {
  tabName: "Sukhumvit Dinner",
  isOrganizer: false,
  isLocked: false,
  viewerUserId: "user_andre",
  billTotalMinor: 184000,
  reconciles: true,
  organizerDisplayName: "Maya",
  servicePercent: 10,
  taxPercent: 7,
  breakdowns: [
    {
      participantId: "user_maya",
      displayName: "Maya",
      itemShareMinor: 46000,
      serviceMinor: 4600,
      taxMinor: 3542,
      tipMinor: 925,
      discountMinor: 0,
      roundingMinor: 0,
      totalMinor: 55067,
    },
    {
      participantId: "user_noi",
      displayName: "Noi",
      itemShareMinor: 21000,
      serviceMinor: 2100,
      taxMinor: 1617,
      tipMinor: 925,
      discountMinor: 0,
      roundingMinor: 0,
      totalMinor: 25642,
    },
    {
      participantId: "user_ploy",
      displayName: "Ploy",
      itemShareMinor: 9000,
      serviceMinor: 900,
      taxMinor: 693,
      tipMinor: 925,
      discountMinor: 0,
      roundingMinor: 0,
      totalMinor: 11518,
    },
    {
      participantId: "user_tim",
      displayName: "Tim",
      itemShareMinor: 52400,
      serviceMinor: 5240,
      taxMinor: 4035,
      tipMinor: 925,
      discountMinor: 0,
      roundingMinor: -1,
      totalMinor: 62599,
    },
    {
      participantId: "user_andre",
      displayName: "Andre",
      itemShareMinor: 24000,
      serviceMinor: 2400,
      taxMinor: 1848,
      tipMinor: 925,
      discountMinor: 0,
      roundingMinor: 1,
      totalMinor: 29174,
    },
  ],
};
