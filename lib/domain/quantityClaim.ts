import { allocateLargestRemainder, type ClaimWeight, type PersistedShare } from "./allocation";
import { assertItemQuantity } from "./bill";
import { DomainError, DomainErrorCode } from "./errors";
import { assertIntegerNumber, type FiatMinor } from "./money";

/**
 * Sentinel weight bucket for units nobody has claimed yet.
 * Filtered out of persisted shares — it exists so k-of-n preview allocates
 * k/n of the line, not the whole line among whoever tapped first (D-29).
 */
const UNCLAIMED_QUANTITY_ID = "__unclaimed__";

export type QuantityClaimInput = {
  participantId: string;
  quantity: number;
};

/** Integer units this person is taking. Missing quantity (legacy rows) counts as 1. */
export function claimUnitCount(claim: { quantity?: number }): number {
  const quantity = claim.quantity ?? 1;
  assertIntegerNumber(quantity, "claim quantity");
  if (quantity < 0) {
    throw new DomainError(
      DomainErrorCode.NEGATIVE_NOT_ALLOWED,
      "claim quantity must not be negative",
    );
  }
  return quantity;
}

/** Sum of integer claimed units. */
export function claimedQuantitySum(claims: readonly { quantity?: number }[]): number {
  return claims.reduce((sum, claim) => sum + claimUnitCount(claim), 0);
}

/**
 * Units still unclaimed. 0 when counts sum to n.
 * A negative never leaves this function — overflow is a write refusal, not a display.
 */
export function quantityShortfall(itemQuantity: number, claimedSum: number): number {
  assertItemQuantity(itemQuantity);
  assertIntegerNumber(claimedSum, "claimed quantity sum");
  if (claimedSum < 0) {
    throw new DomainError(
      DomainErrorCode.NEGATIVE_NOT_ALLOWED,
      "claimed quantity sum must not be negative",
    );
  }
  return claimedSum >= itemQuantity ? 0 : itemQuantity - claimedSum;
}

/**
 * Quantity mode is explicit, or inferred from a receipt/manual line with n > 1
 * that predates the allocationMode write (D-23).
 */
export function resolveItemAllocationMode(
  allocationMode: string | undefined,
  itemQuantity: number,
): "full" | "equal" | "quantity" | "percentage" | "fixed" {
  if (
    allocationMode === "full" ||
    allocationMode === "equal" ||
    allocationMode === "quantity" ||
    allocationMode === "percentage" ||
    allocationMode === "fixed"
  ) {
    return allocationMode;
  }
  assertItemQuantity(itemQuantity);
  return itemQuantity > 1 ? "quantity" : "equal";
}

/** Receipt/manual lines with n > 1 start in quantity mode so the board can do k-of-n. */
export function allocationModeForItemQuantity(quantity: number): "equal" | "quantity" {
  assertItemQuantity(quantity);
  return quantity > 1 ? "quantity" : "equal";
}

export function isQuantityClaimMode(
  allocationMode: string | undefined,
  itemQuantity: number,
): boolean {
  return resolveItemAllocationMode(allocationMode, itemQuantity) === "quantity";
}

/**
 * Refuses a write that would make claimed counts exceed n, or a non-integer /
 * negative quantity. `nextQuantity === 0` is a release and always fits.
 */
export function assertQuantityClaimWrite(args: {
  itemQuantity: number;
  nextQuantity: number;
  othersClaimed: number;
}): void {
  assertItemQuantity(args.itemQuantity);
  assertIntegerNumber(args.nextQuantity, "claim quantity");
  assertIntegerNumber(args.othersClaimed, "others claimed");
  if (args.nextQuantity < 0) {
    throw new DomainError(
      DomainErrorCode.NEGATIVE_NOT_ALLOWED,
      "claim quantity must not be negative",
    );
  }
  if (args.othersClaimed < 0) {
    throw new DomainError(
      DomainErrorCode.NEGATIVE_NOT_ALLOWED,
      "others claimed must not be negative",
    );
  }
  if (args.nextQuantity === 0) {
    return;
  }
  if (args.nextQuantity + args.othersClaimed > args.itemQuantity) {
    throw new DomainError(
      DomainErrorCode.OUT_OF_BOUNDS,
      `claim quantity ${args.nextQuantity} plus ${args.othersClaimed} already claimed exceeds ${args.itemQuantity}`,
    );
  }
}

/**
 * Next integer count after a stepper tap. Returns null when the step is
 * refused (below zero or would exceed n).
 */
export function quantityAfterStep(args: {
  itemQuantity: number;
  viewerQuantity: number;
  othersClaimed: number;
  delta: number;
}): number | null {
  assertIntegerNumber(args.delta, "quantity step");
  assertIntegerNumber(args.viewerQuantity, "viewer quantity");
  const next = args.viewerQuantity + args.delta;
  if (next < 0) {
    return null;
  }
  try {
    assertQuantityClaimWrite({
      itemQuantity: args.itemQuantity,
      nextQuantity: next,
      othersClaimed: args.othersClaimed,
    });
  } catch {
    return null;
  }
  return next;
}

export function quantityStepperState(args: {
  itemQuantity: number;
  viewerQuantity: number;
  othersClaimed: number;
}): {
  canIncrement: boolean;
  canDecrement: boolean;
  nextIncrement: number | null;
  nextDecrement: number | null;
} {
  const nextIncrement = quantityAfterStep({ ...args, delta: 1 });
  const nextDecrement = quantityAfterStep({ ...args, delta: -1 });
  return {
    canIncrement: nextIncrement !== null,
    canDecrement: nextDecrement !== null,
    nextIncrement,
    nextDecrement,
  };
}

/**
 * k-of-n allocation. Unclaimed units keep their share of the line so a
 * shortfall is visible and lock can refuse UNASSIGNED_ITEMS (D-29).
 * Remainder still lives at satang level only — never a fractional beer.
 */
export function allocateQuantityKOfN(
  totalMinor: FiatMinor,
  itemQuantity: number,
  claims: readonly ClaimWeight[],
): PersistedShare[] {
  assertItemQuantity(itemQuantity);
  const claimed = claimedQuantitySum(claims);
  if (claimed > itemQuantity) {
    throw new DomainError(
      DomainErrorCode.OUT_OF_BOUNDS,
      `claimed counts ${claimed} exceed item quantity ${itemQuantity}`,
    );
  }

  const weights: ClaimWeight[] = claims.map((claim) => {
    const quantity = claimUnitCount(claim);
    if (quantity <= 0) {
      throw new DomainError(
        DomainErrorCode.ZERO_DENOMINATOR,
        "allocateQuantityKOfN: claim quantity must be greater than zero",
      );
    }
    return { participantId: claim.participantId, weight: quantity, quantity };
  });

  const shortfall = quantityShortfall(itemQuantity, claimed);
  if (shortfall > 0) {
    weights.push({ participantId: UNCLAIMED_QUANTITY_ID, weight: shortfall });
  }

  return allocateLargestRemainder(totalMinor, weights).filter(
    (share) => share.participantId !== UNCLAIMED_QUANTITY_ID,
  );
}

/** Board caption for quantity-mode items — never "Split N ways", never a percent. */
export function quantityClaimedCaption(claimedCount: number, itemQuantity: number): string {
  assertIntegerNumber(claimedCount, "claimed count");
  assertItemQuantity(itemQuantity);
  return `${claimedCount} of ${itemQuantity} claimed`;
}
