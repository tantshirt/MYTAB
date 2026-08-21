import { DomainError, DomainErrorCode } from "./errors";
import {
  addFiatMinor,
  assertIntegerNumber,
  fiatMinorFromInteger,
  mulFiatMinorByInt,
  subFiatMinor,
  type FiatMinor,
} from "./money";
import {
  applyPercentageBpsToMinor,
  assertBillTotalMinor,
  assertPositiveFiatMinor,
  MAX_BILL_TOTAL_MINOR,
} from "./bounds";

export const ITEM_NAME_MIN_LENGTH = 1;
export const ITEM_NAME_MAX_LENGTH = 120;
export const ITEM_QUANTITY_MIN = 1;
export const ITEM_QUANTITY_MAX = 999;

export type ItemSource = "manual" | "receipt";

export type AdjustmentKind = "service" | "tax" | "discount" | "group_tip";
export type AdjustmentCalculation = "fixed" | "percentage";

export type PercentageBaseKind =
  | "item_subtotal"
  | "after_service_charge"
  | "after_tax"
  | "pre_discount_total"
  | "after_discount";

export const CANONICAL_ADJUSTMENT_ORDER: readonly AdjustmentKind[] = [
  "service",
  "tax",
  "discount",
  "group_tip",
] as const;

export const DEFAULT_PERCENTAGE_BASE: Record<AdjustmentKind, PercentageBaseKind> = {
  service: "item_subtotal",
  tax: "after_service_charge",
  discount: "pre_discount_total",
  group_tip: "after_discount",
};

export type BillItemInput = {
  name: string;
  quantity: number;
  unitPriceMinor: FiatMinor;
};

export type BillAdjustmentInput = {
  kind: AdjustmentKind;
  calculation: AdjustmentCalculation;
  valueMinorOrBps: number;
  percentageBase?: PercentageBaseKind;
};

export type BillLineBreakdown = {
  label: string;
  amountMinor: FiatMinor;
  kind?: AdjustmentKind | "subtotal" | "total";
};

export type BillBreakdown = {
  subtotalMinor: FiatMinor;
  lines: BillLineBreakdown[];
  totalMinor: FiatMinor;
};

export function assertItemName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length < ITEM_NAME_MIN_LENGTH || trimmed.length > ITEM_NAME_MAX_LENGTH) {
    throw new DomainError(
      DomainErrorCode.OUT_OF_BOUNDS,
      `Item name must be between ${ITEM_NAME_MIN_LENGTH} and ${ITEM_NAME_MAX_LENGTH} characters`,
    );
  }
}

export function assertItemQuantity(quantity: number): void {
  assertIntegerNumber(quantity, "assertItemQuantity");
  if (quantity < ITEM_QUANTITY_MIN || quantity > ITEM_QUANTITY_MAX) {
    throw new DomainError(
      DomainErrorCode.OUT_OF_BOUNDS,
      `Item quantity must be between ${ITEM_QUANTITY_MIN} and ${ITEM_QUANTITY_MAX}`,
    );
  }
}

export function computeLineTotalMinor(quantity: number, unitPriceMinor: FiatMinor): FiatMinor {
  assertItemQuantity(quantity);
  assertPositiveFiatMinor(unitPriceMinor, "computeLineTotalMinor");
  const lineTotal = mulFiatMinorByInt(unitPriceMinor, quantity);
  assertBillTotalMinor(lineTotal);
  return lineTotal;
}

export function computeItemsSubtotalMinor(
  items: ReadonlyArray<{ lineTotalMinor: FiatMinor }>,
): FiatMinor {
  let subtotal = fiatMinorFromInteger(0);
  for (const item of items) {
    subtotal = addFiatMinor(subtotal, item.lineTotalMinor);
  }
  return subtotal;
}

function resolvePercentageBaseMinor(
  kind: AdjustmentKind,
  bases: {
    itemSubtotalMinor: FiatMinor;
    afterServiceMinor: FiatMinor;
    afterTaxMinor: FiatMinor;
    afterDiscountMinor: FiatMinor;
  },
  explicit?: PercentageBaseKind,
): FiatMinor {
  const baseKind = explicit ?? DEFAULT_PERCENTAGE_BASE[kind];
  switch (baseKind) {
    case "item_subtotal":
      return bases.itemSubtotalMinor;
    case "after_service_charge":
      return bases.afterServiceMinor;
    case "after_tax":
      return bases.afterTaxMinor;
    case "pre_discount_total":
      return bases.afterTaxMinor;
    case "after_discount":
      return bases.afterDiscountMinor;
    default:
      return bases.itemSubtotalMinor;
  }
}

function computeAdjustmentAmountMinor(
  adjustment: BillAdjustmentInput,
  bases: {
    itemSubtotalMinor: FiatMinor;
    afterServiceMinor: FiatMinor;
    afterTaxMinor: FiatMinor;
    afterDiscountMinor: FiatMinor;
  },
): FiatMinor {
  if (adjustment.calculation === "fixed") {
    const amount = fiatMinorFromInteger(adjustment.valueMinorOrBps);
    assertPositiveFiatMinor(amount, "fixed adjustment");
    return amount;
  }

  const baseMinor = resolvePercentageBaseMinor(
    adjustment.kind,
    bases,
    adjustment.percentageBase,
  );
  return applyPercentageBpsToMinor(baseMinor, adjustment.valueMinorOrBps);
}

const ADJUSTMENT_LABELS: Record<AdjustmentKind, string> = {
  service: "Service charge",
  tax: "Tax",
  discount: "Discount",
  group_tip: "Group tip",
};

/** Applies adjustments in canonical order with explicit percentage bases (FR-B3, FR-M7). */
export function computeBillBreakdown(
  items: ReadonlyArray<{ lineTotalMinor: FiatMinor }>,
  adjustments: ReadonlyArray<BillAdjustmentInput>,
): BillBreakdown {
  const subtotalMinor = computeItemsSubtotalMinor(items);
  const lines: BillLineBreakdown[] = [{ label: "Subtotal", amountMinor: subtotalMinor, kind: "subtotal" }];

  const byKind = new Map<AdjustmentKind, BillAdjustmentInput>();
  for (const adjustment of adjustments) {
    byKind.set(adjustment.kind, adjustment);
  }

  let afterServiceMinor = subtotalMinor;
  let serviceMinor = fiatMinorFromInteger(0);
  let taxMinor = fiatMinorFromInteger(0);
  let discountMinor = fiatMinorFromInteger(0);
  let groupTipMinor = fiatMinorFromInteger(0);

  const service = byKind.get("service");
  if (service) {
    serviceMinor = computeAdjustmentAmountMinor(service, {
      itemSubtotalMinor: subtotalMinor,
      afterServiceMinor: subtotalMinor,
      afterTaxMinor: subtotalMinor,
      afterDiscountMinor: subtotalMinor,
    });
    afterServiceMinor = addFiatMinor(subtotalMinor, serviceMinor);
    lines.push({ label: ADJUSTMENT_LABELS.service, amountMinor: serviceMinor, kind: "service" });
  }

  const afterTaxBase = afterServiceMinor;
  let afterTaxMinor = afterTaxBase;
  const tax = byKind.get("tax");
  if (tax) {
    taxMinor = computeAdjustmentAmountMinor(tax, {
      itemSubtotalMinor: subtotalMinor,
      afterServiceMinor,
      afterTaxMinor: afterTaxBase,
      afterDiscountMinor: afterTaxBase,
    });
    afterTaxMinor = addFiatMinor(afterTaxBase, taxMinor);
    lines.push({ label: ADJUSTMENT_LABELS.tax, amountMinor: taxMinor, kind: "tax" });
  }

  const preDiscountMinor = afterTaxMinor;
  const discount = byKind.get("discount");
  let afterDiscountMinor = preDiscountMinor;
  if (discount) {
    discountMinor = computeAdjustmentAmountMinor(discount, {
      itemSubtotalMinor: subtotalMinor,
      afterServiceMinor,
      afterTaxMinor,
      afterDiscountMinor: preDiscountMinor,
    });
    if (discountMinor > preDiscountMinor) {
      throw new DomainError(
        DomainErrorCode.NEGATIVE_NOT_ALLOWED,
        "Discount cannot exceed the subtotal plus charges",
      );
    }
    afterDiscountMinor = subFiatMinor(preDiscountMinor, discountMinor);
    lines.push({
      label: ADJUSTMENT_LABELS.discount,
      amountMinor: discountMinor,
      kind: "discount",
    });
  }

  const groupTip = byKind.get("group_tip");
  if (groupTip) {
    groupTipMinor = computeAdjustmentAmountMinor(groupTip, {
      itemSubtotalMinor: subtotalMinor,
      afterServiceMinor,
      afterTaxMinor,
      afterDiscountMinor,
    });
    lines.push({
      label: ADJUSTMENT_LABELS.group_tip,
      amountMinor: groupTipMinor,
      kind: "group_tip",
    });
  }

  const totalMinor = addFiatMinor(afterDiscountMinor, groupTipMinor);
  if (totalMinor <= 0) {
    throw new DomainError(
      DomainErrorCode.NEGATIVE_NOT_ALLOWED,
      "Bill total must be greater than zero",
    );
  }
  if (totalMinor > MAX_BILL_TOTAL_MINOR) {
    throw new DomainError(
      DomainErrorCode.OUT_OF_BOUNDS,
      `Bill total exceeds maximum of ${MAX_BILL_TOTAL_MINOR} satang`,
    );
  }

  lines.push({ label: "Total", amountMinor: totalMinor, kind: "total" });
  return { subtotalMinor, lines, totalMinor };
}
