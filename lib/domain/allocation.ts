import { applyPercentageBpsToMinor } from "./bounds";
import { DomainError, DomainErrorCode } from "./errors";
import {
  addFiatMinor,
  assertIntegerNumber,
  divFiatMinor,
  fiatMinorFromInteger,
  subFiatMinor,
  type FiatMinor,
} from "./money";

/** Stable participant ordering for largest-remainder tie-breaking (FR-M4). */
export const ALLOCATION_ORDER_RULE =
  "Participants are sorted lexicographically by participantId ascending; remainder minor units go to the first participants in that order.";

export type AllocationMode = "full" | "equal" | "quantity" | "percentage" | "fixed";

export type AdjustmentKind = "tax" | "service" | "discount" | "group_tip";

export type ClaimWeight = {
  participantId: string;
  /** Integer weight for proportional split; equal mode uses weight 1 per claimant. */
  weight: number;
  /** Fixed amount input for fixed mode (before normalization). */
  fixedMinor?: FiatMinor;
  /** Basis points for percentage mode. */
  percentageBps?: number;
  /** Consumed quantity for quantity mode. */
  quantity?: number;
};

export type PersistedShare = {
  participantId: string;
  amountMinor: FiatMinor;
  /** Extra minor units received from remainder distribution (for rounding disclosure). */
  roundingMinor: FiatMinor;
};

export type AdjustmentAllocation = {
  kind: AdjustmentKind;
  byParticipant: PersistedShare[];
};

export type ParticipantBreakdown = {
  participantId: string;
  itemShareMinor: FiatMinor;
  taxMinor: FiatMinor;
  serviceMinor: FiatMinor;
  tipMinor: FiatMinor;
  discountMinor: FiatMinor;
  roundingMinor: FiatMinor;
  totalMinor: FiatMinor;
};

export type LockInvariantResult =
  | { valid: true }
  | { valid: false; shortfallMinor: FiatMinor };

function sortParticipantIds(participantIds: readonly string[]): string[] {
  return [...participantIds].sort((a, b) => a.localeCompare(b));
}

function assertNonNegativeWeight(weight: number, context: string): void {
  assertIntegerNumber(weight, context);
  if (weight < 0) {
    throw new DomainError(
      DomainErrorCode.NEGATIVE_NOT_ALLOWED,
      `${context}: weight must not be negative`,
    );
  }
}

/**
 * Distributes `totalMinor` across weights using floor division plus largest-remainder
 * allocation in stable participant order (FR-M4).
 */
export function allocateLargestRemainder(
  totalMinor: FiatMinor,
  weights: readonly ClaimWeight[],
): PersistedShare[] {
  assertIntegerNumber(totalMinor, "allocateLargestRemainder");
  if (totalMinor < 0) {
    throw new DomainError(
      DomainErrorCode.NEGATIVE_NOT_ALLOWED,
      "allocateLargestRemainder: total must not be negative",
    );
  }

  if (weights.length === 0) {
    if (totalMinor !== 0) {
      throw new DomainError(
        DomainErrorCode.ZERO_RECIPIENTS,
        "allocateLargestRemainder: no recipients for non-zero total",
      );
    }
    return [];
  }

  const active = weights.filter((entry) => entry.weight > 0);
  if (active.length === 0) {
    if (totalMinor !== 0) {
      throw new DomainError(
        DomainErrorCode.ZERO_DENOMINATOR,
        "allocateLargestRemainder: sum of weights is zero",
      );
    }
    return sortParticipantIds(weights.map((entry) => entry.participantId)).map((participantId) => ({
      participantId,
      amountMinor: fiatMinorFromInteger(0),
      roundingMinor: fiatMinorFromInteger(0),
    }));
  }

  const weightSum = active.reduce((sum, entry) => {
    assertNonNegativeWeight(entry.weight, "allocateLargestRemainder");
    return sum + entry.weight;
  }, 0);

  if (weightSum <= 0) {
    throw new DomainError(
      DomainErrorCode.ZERO_DENOMINATOR,
      "allocateLargestRemainder: sum of weights must be greater than zero",
    );
  }

  type Row = {
    participantId: string;
    floorMinor: FiatMinor;
    remainderNumerator: bigint;
  };

  const rows: Row[] = active.map((entry) => {
    const product = BigInt(totalMinor) * BigInt(entry.weight);
    const floorMinor = Number(product / BigInt(weightSum)) as FiatMinor;
    const remainderNumerator = product % BigInt(weightSum);
    return {
      participantId: entry.participantId,
      floorMinor,
      remainderNumerator,
    };
  });

  const distributed = rows.reduce(
    (sum, row) => sum + row.floorMinor,
    0,
  ) as FiatMinor;
  let remainderUnits = subFiatMinor(totalMinor, distributed);

  const bonusOrder = [...rows].sort((a, b) => {
    if (a.remainderNumerator === b.remainderNumerator) {
      return a.participantId.localeCompare(b.participantId);
    }
    return a.remainderNumerator > b.remainderNumerator ? -1 : 1;
  });

  const bonusByParticipant = new Map<string, FiatMinor>();
  for (const row of bonusOrder) {
    bonusByParticipant.set(row.participantId, fiatMinorFromInteger(0));
  }

  for (const row of bonusOrder) {
    if (remainderUnits <= 0) {
      break;
    }
    bonusByParticipant.set(row.participantId, fiatMinorFromInteger(1));
    remainderUnits = subFiatMinor(remainderUnits, fiatMinorFromInteger(1));
  }

  const orderedIds = sortParticipantIds(weights.map((entry) => entry.participantId));
  return orderedIds.map((participantId) => {
    const row = rows.find((candidate) => candidate.participantId === participantId);
    if (!row) {
      return {
        participantId,
        amountMinor: fiatMinorFromInteger(0),
        roundingMinor: fiatMinorFromInteger(0),
      };
    }
    const roundingMinor = bonusByParticipant.get(participantId) ?? fiatMinorFromInteger(0);
    return {
      participantId,
      amountMinor: addFiatMinor(row.floorMinor, roundingMinor),
      roundingMinor,
    };
  });
}

/** Equal split among claimants — FR-M4, FR-C1 P0 mode. */
export function allocateEqualSplit(
  totalMinor: FiatMinor,
  participantIds: readonly string[],
): PersistedShare[] {
  if (participantIds.length === 0) {
    if (totalMinor !== 0) {
      throw new DomainError(
        DomainErrorCode.ZERO_RECIPIENTS,
        "allocateEqualSplit: no claimants for non-zero item",
      );
    }
    return [];
  }

  return allocateLargestRemainder(
    totalMinor,
    sortParticipantIds(participantIds).map((participantId) => ({
      participantId,
      weight: 1,
    })),
  );
}

/** Single-participant full allocation — FR-C1 P0 mode. */
export function allocateFullShare(
  totalMinor: FiatMinor,
  participantId: string,
): PersistedShare[] {
  return [
    {
      participantId,
      amountMinor: totalMinor,
      roundingMinor: fiatMinorFromInteger(0),
    },
  ];
}

function buildWeightsForMode(
  totalMinor: FiatMinor,
  mode: AllocationMode,
  claims: readonly ClaimWeight[],
): ClaimWeight[] {
  if (mode === "full") {
    if (claims.length !== 1) {
      throw new DomainError(
        DomainErrorCode.OUT_OF_BOUNDS,
        "allocateByMode: full mode requires exactly one claimant",
      );
    }
    return [{ participantId: claims[0]!.participantId, weight: 1 }];
  }

  if (mode === "equal") {
    return sortParticipantIds(claims.map((claim) => claim.participantId)).map((participantId) => ({
      participantId,
      weight: 1,
    }));
  }

  if (mode === "quantity") {
    return claims.map((claim) => {
      const quantity = claim.quantity ?? 1;
      assertIntegerNumber(quantity, "quantity mode");
      if (quantity <= 0) {
        throw new DomainError(
          DomainErrorCode.ZERO_DENOMINATOR,
          "allocateByMode: quantity must be greater than zero",
        );
      }
      return { participantId: claim.participantId, weight: quantity };
    });
  }

  if (mode === "percentage") {
    let totalBps = 0;
    const weights = claims.map((claim) => {
      const bps = claim.percentageBps ?? 0;
      assertIntegerNumber(bps, "percentage mode");
      if (bps < 0) {
        throw new DomainError(
          DomainErrorCode.NEGATIVE_NOT_ALLOWED,
          "allocateByMode: percentage basis points must not be negative",
        );
      }
      totalBps += bps;
      return { participantId: claim.participantId, weight: bps, percentageBps: bps };
    });
    if (totalBps > 10_000) {
      throw new DomainError(
        DomainErrorCode.PERCENTAGE_OUT_OF_BOUNDS,
        "allocateByMode: percentage claims exceed 100%",
      );
    }
    if (totalBps <= 0) {
      throw new DomainError(
        DomainErrorCode.ZERO_DENOMINATOR,
        "allocateByMode: percentage claims must sum above zero",
      );
    }
    return weights;
  }

  if (mode === "fixed") {
    let fixedTotal = fiatMinorFromInteger(0);
    const weights = claims.map((claim) => {
      const fixedMinor = claim.fixedMinor ?? fiatMinorFromInteger(0);
      if (fixedMinor < 0) {
        throw new DomainError(
          DomainErrorCode.NEGATIVE_NOT_ALLOWED,
          "allocateByMode: fixed amount must not be negative",
        );
      }
      fixedTotal = addFiatMinor(fixedTotal, fixedMinor);
      return { participantId: claim.participantId, weight: fixedMinor, fixedMinor };
    });
    if (fixedTotal <= 0) {
      throw new DomainError(
        DomainErrorCode.ZERO_DENOMINATOR,
        "allocateByMode: fixed claims must sum above zero",
      );
    }
    // Normalize fixed inputs to the line total via largest remainder on declared weights.
    void totalMinor;
    return weights;
  }

  throw new DomainError(
    DomainErrorCode.OUT_OF_BOUNDS,
    `allocateByMode: unsupported mode ${String(mode)}`,
  );
}

/** Computes item shares for any supported allocation mode (FR-C1, FR-C2). */
export function allocateByMode(
  totalMinor: FiatMinor,
  mode: AllocationMode,
  claims: readonly ClaimWeight[],
): PersistedShare[] {
  if (mode === "full") {
    return allocateFullShare(totalMinor, claims[0]!.participantId);
  }
  const weights = buildWeightsForMode(totalMinor, mode, claims);
  return allocateLargestRemainder(totalMinor, weights);
}

/** Proportional adjustment allocation with largest-remainder distribution (FR-M5). */
export function allocateAdjustmentProportional(
  adjustmentMinor: FiatMinor,
  itemShares: readonly PersistedShare[],
): PersistedShare[] {
  assertIntegerNumber(adjustmentMinor, "allocateAdjustmentProportional");
  if (adjustmentMinor < 0) {
    throw new DomainError(
      DomainErrorCode.NEGATIVE_NOT_ALLOWED,
      "allocateAdjustmentProportional: adjustment must not be negative",
    );
  }

  const weights = itemShares
    .filter((share) => share.amountMinor > 0)
    .map((share) => ({
      participantId: share.participantId,
      weight: share.amountMinor,
    }));

  return allocateLargestRemainder(adjustmentMinor, weights);
}

export type BillAdjustmentInput = {
  kind: AdjustmentKind;
  amountMinor: FiatMinor;
  calculation: "fixed" | "percentage";
  percentageBaseMinor?: FiatMinor;
  percentageBps?: number;
};

/** Resolves an adjustment line to a total minor amount. */
export function resolveAdjustmentAmountMinor(adjustment: BillAdjustmentInput): FiatMinor {
  if (adjustment.calculation === "fixed") {
    return adjustment.amountMinor;
  }
  const baseMinor = adjustment.percentageBaseMinor ?? fiatMinorFromInteger(0);
  const bps = adjustment.percentageBps ?? 0;
  return applyPercentageBpsToMinor(baseMinor, bps);
}

/** Allocates every bill adjustment proportionally to item shares (FR-M5). */
export function allocateAllAdjustments(
  itemShares: readonly PersistedShare[],
  adjustments: readonly BillAdjustmentInput[],
): AdjustmentAllocation[] {
  return adjustments.map((adjustment) => {
    const totalMinor = resolveAdjustmentAmountMinor(adjustment);
    const byParticipant = allocateAdjustmentProportional(totalMinor, itemShares);
    return { kind: adjustment.kind, byParticipant };
  });
}

function shareMap(shares: readonly PersistedShare[]): Map<string, FiatMinor> {
  return new Map(shares.map((share) => [share.participantId, share.amountMinor]));
}

function roundingMap(shares: readonly PersistedShare[]): Map<string, FiatMinor> {
  return new Map(shares.map((share) => [share.participantId, share.roundingMinor]));
}

/** Builds per-participant totals including disclosed rounding lines (FR-M5, UX-DR28). */
export function buildParticipantBreakdowns(
  itemShares: readonly PersistedShare[],
  adjustmentAllocations: readonly AdjustmentAllocation[],
): ParticipantBreakdown[] {
  const participantIds = sortParticipantIds(itemShares.map((share) => share.participantId));
  const itemByParticipant = shareMap(itemShares);

  const taxByParticipant = new Map<string, FiatMinor>();
  const serviceByParticipant = new Map<string, FiatMinor>();
  const tipByParticipant = new Map<string, FiatMinor>();
  const discountByParticipant = new Map<string, FiatMinor>();
  let roundingMinor = fiatMinorFromInteger(0);

  for (const share of itemShares) {
    roundingMinor = addFiatMinor(roundingMinor, share.roundingMinor);
  }

  for (const allocation of adjustmentAllocations) {
    const target =
      allocation.kind === "tax"
        ? taxByParticipant
        : allocation.kind === "service"
          ? serviceByParticipant
          : allocation.kind === "group_tip"
            ? tipByParticipant
            : discountByParticipant;

    for (const share of allocation.byParticipant) {
      target.set(
        share.participantId,
        addFiatMinor(target.get(share.participantId) ?? fiatMinorFromInteger(0), share.amountMinor),
      );
      roundingMinor = addFiatMinor(roundingMinor, share.roundingMinor);
    }
  }

  return participantIds.map((participantId) => {
    const itemShareMinor = itemByParticipant.get(participantId) ?? fiatMinorFromInteger(0);
    const taxMinor = taxByParticipant.get(participantId) ?? fiatMinorFromInteger(0);
    const serviceMinor = serviceByParticipant.get(participantId) ?? fiatMinorFromInteger(0);
    const tipMinor = tipByParticipant.get(participantId) ?? fiatMinorFromInteger(0);
    const discountMinor = discountByParticipant.get(participantId) ?? fiatMinorFromInteger(0);
    const participantRounding = addFiatMinor(
      roundingMap(itemShares).get(participantId) ?? fiatMinorFromInteger(0),
      adjustmentAllocations.reduce((sum, allocation) => {
        const share = allocation.byParticipant.find(
          (candidate) => candidate.participantId === participantId,
        );
        return addFiatMinor(sum, share?.roundingMinor ?? fiatMinorFromInteger(0));
      }, fiatMinorFromInteger(0)),
    );

    const totalMinor = subFiatMinor(
      addFiatMinor(
        addFiatMinor(addFiatMinor(itemShareMinor, taxMinor), serviceMinor),
        tipMinor,
      ),
      discountMinor,
    );

    if (totalMinor < 0) {
      throw new DomainError(
        DomainErrorCode.NEGATIVE_NOT_ALLOWED,
        `buildParticipantBreakdowns: participant ${participantId} obligation would be negative`,
      );
    }

    return {
      participantId,
      itemShareMinor,
      taxMinor,
      serviceMinor,
      tipMinor,
      discountMinor,
      roundingMinor: participantRounding,
      totalMinor,
    };
  });
}

/** Sums persisted item shares. */
export function sumShareAmounts(shares: readonly PersistedShare[]): FiatMinor {
  return shares.reduce(
    (sum, share) => addFiatMinor(sum, share.amountMinor),
    fiatMinorFromInteger(0),
  );
}

/**
 * Verifies FR-M6 lock invariant:
 * sum(item shares) + tax + service + tip − discount = locked bill total.
 */
export function verifyLockInvariant(args: {
  itemSharesTotalMinor: FiatMinor;
  taxMinor: FiatMinor;
  serviceMinor: FiatMinor;
  tipMinor: FiatMinor;
  discountMinor: FiatMinor;
  billTotalMinor: FiatMinor;
}): LockInvariantResult {
  const computedTotal = subFiatMinor(
    addFiatMinor(
      addFiatMinor(addFiatMinor(args.itemSharesTotalMinor, args.taxMinor), args.serviceMinor),
      args.tipMinor,
    ),
    args.discountMinor,
  );

  if (computedTotal === args.billTotalMinor) {
    return { valid: true };
  }

  const shortfallMinor =
    computedTotal < args.billTotalMinor
      ? subFiatMinor(args.billTotalMinor, computedTotal)
      : subFiatMinor(computedTotal, args.billTotalMinor);

  return { valid: false, shortfallMinor };
}

/** Computes bill total from item subtotal and canonical adjustment order. */
export function computeBillTotalMinor(args: {
  itemSubtotalMinor: FiatMinor;
  serviceMinor: FiatMinor;
  taxMinor: FiatMinor;
  discountMinor: FiatMinor;
  groupTipMinor: FiatMinor;
}): FiatMinor {
  const afterService = addFiatMinor(args.itemSubtotalMinor, args.serviceMinor);
  const afterTax = addFiatMinor(afterService, args.taxMinor);
  const afterDiscount = subFiatMinor(afterTax, args.discountMinor);
  if (afterDiscount < 0) {
    throw new DomainError(
      DomainErrorCode.NEGATIVE_NOT_ALLOWED,
      "computeBillTotalMinor: discount exceeds subtotal",
    );
  }
  return addFiatMinor(afterDiscount, args.groupTipMinor);
}

/** Per-head share for display ("Split N ways · ฿X each"). */
export function perHeadDisplayMinor(totalMinor: FiatMinor, claimantCount: number): FiatMinor {
  if (claimantCount <= 0) {
    return fiatMinorFromInteger(0);
  }
  return divFiatMinor(totalMinor, claimantCount);
}
