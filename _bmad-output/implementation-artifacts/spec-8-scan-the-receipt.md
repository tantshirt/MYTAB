---
title: 'Epic 8: Scan the receipt'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Organizers should photograph a receipt, correct flagged rows, and confirm items without blocking manual entry.

**Approach:** `convex/receipts.ts` handles ticketed upload, fixture extraction scheduling, and confirmation. `lib/domain/receiptParse.ts` re-parses all amounts deterministically. `features/receipts/` renders capture, review, and manual fallback behind `NEXT_PUBLIC_FEATURE_RECEIPT_SCAN`.

## Code Map

- `convex/receipts.ts` — Stories 8.1, 8.5, 8.6
- `convex/internal/receiptScheduler.ts` — Story 8.2
- `convex/lib/receiptExtraction.ts` — Story 8.2
- `lib/domain/receiptParse.ts` — Story 8.3
- `lib/domain/receiptFixture.ts` — Stories 8.6, 8.7
- `features/receipts/ReceiptReview.tsx` — Story 8.4
- `features/receipts/ReceiptCapture.tsx` — Stories 8.1, 8.6

## Verification

- `npm test` — domain/receipt-parse, features/receipt-review, convex/activity-receipts
- `npm run build`

</intent-contract>
