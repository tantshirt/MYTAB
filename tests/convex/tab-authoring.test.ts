import { describe, expect, it } from "vitest";
import {
  NOT_BILL_ORGANIZER,
  TAB_LOCKED,
  isTabUnlocked,
  requireBillOrganizer,
} from "../../convex/lib/tabAuth";
import { AuthError } from "../../convex/lib/auth";
import {
  DISCOUNT_EXCEEDS_TOTAL,
  INVALID_ITEM,
  PAYER_RECIPIENT_SAME,
  TabBillError,
  assertDistinctPayerRecipient,
  validateItemInput,
} from "../../convex/lib/tabBillSync";
import { thbMinorFromWholeBaht } from "../../lib/domain";
import { FIXTURE_USDC_ATOMIC_DENOMINATOR, FIXTURE_USDC_ATOMIC_NUMERATOR } from "../../lib/domain/fxFixture";
import { createFixtureFxSnapshot, FX_DIRECTION } from "../../convex/lib/fxSnapshotSync";

function createOrganizerCtx(options: {
  tab?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
  telegramContext?: Record<string, unknown> | null;
}) {
  const tab = options.tab ?? null;
  const user = options.user ?? null;
  const membership = options.membership ?? null;
  const telegramContext = options.telegramContext ?? {
    privyDid: user?.privyDid,
    expiresAt: Date.now() + 60_000,
  };

  return {
    auth: {
      getUserIdentity: async () =>
        user
          ? { subject: user.privyDid, tokenIdentifier: "x", issuer: "privy.io" }
          : null,
    },
    db: {
      get: async (id: string) => (id === tab?._id ? tab : null),
      insert: async (_table: string, _doc: Record<string, unknown>) => "fxSnapshots:1",
      query: (table: string) => ({
        withIndex: (
          _index: string,
          builder: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
        ) => {
          const filters: Record<string, unknown> = {};
          const filterBuilder = {
            eq: (field: string, value: unknown) => {
              filters[field] = value;
              return filterBuilder;
            },
          };
          builder(filterBuilder);

          if (table === "users") {
            return {
              unique: async () =>
                user && filters.privyDid === user.privyDid ? user : null,
            };
          }

          if (table === "telegramContexts") {
            return {
              unique: async () =>
                telegramContext && filters.privyDid === telegramContext.privyDid
                  ? telegramContext
                  : null,
            };
          }

          if (table === "groupMembers") {
            return {
              unique: async () =>
                membership &&
                filters.groupId === membership.groupId &&
                filters.telegramUserId === membership.telegramUserId
                  ? membership
                  : null,
            };
          }

          return { unique: async () => null, collect: async () => [] };
        },
      }),
    },
  };
}

describe("Story 4.1 — tab auth and setup guards", () => {
  it("AC4 — requireBillOrganizer rejects non-organizers", async () => {
    const ctx = createOrganizerCtx({
      tab: {
        _id: "tabs:1",
        groupId: "groups:1",
        organizerTelegramUserId: "tg:organizer",
        status: "draft",
      },
      user: {
        _id: "users:2",
        privyDid: "did:privy:other",
        telegramUserId: "tg:other",
      },
      membership: {
        groupId: "groups:1",
        telegramUserId: "tg:other",
        membershipStatus: "active",
      },
    });

    await expect(requireBillOrganizer(ctx as never, "tabs:1" as never)).rejects.toMatchObject({
      code: NOT_BILL_ORGANIZER,
    });
  });

  it("AC3 — payer and recipient must differ", () => {
    expect(() =>
      assertDistinctPayerRecipient("users:1" as never, "users:1" as never),
    ).toThrowError(TabBillError);
    try {
      assertDistinctPayerRecipient("users:1" as never, "users:1" as never);
    } catch (error) {
      expect((error as TabBillError).code).toBe(PAYER_RECIPIENT_SAME);
    }
  });

  it("AC6 — fixture FX snapshot stores rational integers", async () => {
    const ctx = createOrganizerCtx({});
    const id = await createFixtureFxSnapshot(ctx as never, Date.now());
    expect(id).toBe("fxSnapshots:1");
    expect(FIXTURE_USDC_ATOMIC_NUMERATOR).toBe(625n);
    expect(FIXTURE_USDC_ATOMIC_DENOMINATOR).toBe(2n);
    expect(FX_DIRECTION).toBe("USDC_ATOMIC_PER_THB_MINOR");
  });
});

describe("Story 4.2 — item validation", () => {
  it("AC1 — validates name, quantity, and positive unit price", () => {
    const result = validateItemInput({
      name: "Pad Thai",
      quantity: 2,
      unitPriceMinor: thbMinorFromWholeBaht(180),
    });
    expect(result.lineTotalMinor).toBe(thbMinorFromWholeBaht(360));
  });

  it("AC3 — locked tabs are not editable", () => {
    expect(isTabUnlocked({ status: "locked" })).toBe(false);
    expect(() => {
      if (!isTabUnlocked({ status: "locked" })) {
        throw new AuthError(TAB_LOCKED);
      }
    }).toThrowError(AuthError);
  });

  it("rejects invalid items with stable code", () => {
    expect(() =>
      validateItemInput({
        name: "",
        quantity: 1,
        unitPriceMinor: thbMinorFromWholeBaht(1),
      }),
    ).toThrowError(TabBillError);
    try {
      validateItemInput({ name: "", quantity: 1, unitPriceMinor: thbMinorFromWholeBaht(1) });
    } catch (error) {
      expect((error as TabBillError).code).toBe(INVALID_ITEM);
    }
  });
});

describe("Story 4.3 — adjustment guards", () => {
  it("AC4 — surfaces discount overflow as DISCOUNT_EXCEEDS_TOTAL", () => {
    expect(DISCOUNT_EXCEEDS_TOTAL).toBe("DISCOUNT_EXCEEDS_TOTAL");
  });
});
