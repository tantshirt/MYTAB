import { describe, expect, it } from "vitest";
import type { Doc } from "../../convex/_generated/dataModel";
import { computeBillSnapshotHash, computeObligationCommitmentHash } from "../../lib/solana/memoHash";
import { buildExactUsdcTransfer } from "../../lib/solana/buildExactUsdcTransfer";
import {
  FIXTURE_PAYER_WALLET_ADDRESS,
  FIXTURE_RECIPIENT_WALLET_ADDRESS,
  FIXTURE_SPONSOR_WALLET_ADDRESS,
  USDC_MINT,
} from "../../lib/solana/constants";
import { applySettlementOffset, isTargetAlreadySettled } from "../../convex/lib/settlementLedger";
import { SETTLEMENT_FAILURE } from "../../convex/lib/settlementState";
import {
  createObligationIntentCore,
  OBLIGATION_FAILURE,
} from "../../convex/lib/settlementObligationSync";
import { computeBillSnapshotForObligation } from "../../convex/lib/billSnapshot";

const PAYER = {
  _id: "users:payer",
  privyDid: "did:privy:payer",
  telegramUserId: "100",
  displayName: "Alex",
};

const CREDITOR = {
  _id: "users:creditor",
  privyDid: "did:privy:creditor",
  telegramUserId: "200",
  displayName: "Maya",
};

const GROUP_ID = "groups:1";
const TAB_ID = "tabs:1";
const OBLIGATION_ID = "obligations:1";

function createObligationStore() {
  const users = [PAYER, CREDITOR];
  const obligations = [
    {
      _id: OBLIGATION_ID,
      groupId: GROUP_ID,
      tabId: TAB_ID,
      tabRevision: 2,
      debtorUserId: PAYER._id,
      creditorUserId: CREDITOR._id,
      displayAmountThbMinor: 29_174n,
      amountAtomic: 10_000_000n,
      billSnapshotHash: "abc123",
      outputMint: USDC_MINT,
      status: "open" as Doc<"obligations">["status"],
      updatedAt: 0,
      createdAt: 0,
    },
  ];

  const tabs = [
    {
      _id: TAB_ID,
      groupId: GROUP_ID,
      lockedRevision: 2,
      revision: 2,
      status: "locked",
    },
  ];

  const settlementIntents: Array<Record<string, unknown>> = [];
  let nextId = 1;

  const ctx = {
    auth: {
      getUserIdentity: async () => ({ subject: PAYER.privyDid, tokenIdentifier: PAYER.privyDid }),
    },
    db: {
      get: async (id: string) => {
        if (id === PAYER._id) return PAYER;
        if (id === CREDITOR._id) return CREDITOR;
        if (id === OBLIGATION_ID) return obligations[0];
        if (id === TAB_ID) return tabs[0];
        return null;
      },
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

          const rows =
            table === "users"
              ? users.filter((row) =>
                  Object.entries(filters).every(([field, value]) => row[field as keyof typeof row] === value),
                )
              : table === "telegramContexts"
                ? [{ privyDid: PAYER.privyDid, expiresAt: Date.now() + 60_000 }].filter((row) =>
                    Object.entries(filters).every(([field, value]) => row[field as keyof typeof row] === value),
                  )
              : table === "settlementIntents"
              ? settlementIntents.filter((row) =>
                  Object.entries(filters).every(([field, value]) => row[field] === value),
                )
              : table === "obligations"
                ? obligations.filter((row) =>
                    Object.entries(filters).every(([field, value]) => row[field as keyof typeof row] === value),
                  )
                : table === "groupMembers"
                    ? [
                        { groupId: GROUP_ID, telegramUserId: PAYER.telegramUserId, membershipStatus: "active" },
                        { groupId: GROUP_ID, telegramUserId: CREDITOR.telegramUserId, membershipStatus: "active" },
                      ].filter((row) =>
                        Object.entries(filters).every(([field, value]) => row[field as keyof typeof row] === value),
                      )
                    : table === "wallets"
                      ? [
                          {
                            _id: "wallets:payer",
                            userId: PAYER._id,
                            solanaAddress: FIXTURE_PAYER_WALLET_ADDRESS,
                            isDefaultReceiving: true,
                          },
                          {
                            _id: "wallets:creditor",
                            userId: CREDITOR._id,
                            solanaAddress: FIXTURE_RECIPIENT_WALLET_ADDRESS,
                            isDefaultReceiving: true,
                          },
                        ].filter((row) =>
                          Object.entries(filters).every(([field, value]) => row[field as keyof typeof row] === value),
                        )
                      : [];

          return {
            unique: async () => rows[0] ?? null,
            collect: async () => rows,
          };
        },
      }),
      insert: async (table: string, doc: Record<string, unknown>) => {
        const id = `${table}:${nextId++}`;
        if (table === "settlementIntents") {
          settlementIntents.push({ _id: id, ...doc });
        }
        return id;
      },
      patch: async (id: string, patch: Record<string, unknown>) => {
        if (id === OBLIGATION_ID) {
          obligations[0] = { ...obligations[0]!, ...patch };
        }
      },
    },
  };

  return { ctx: ctx as never, settlementIntents, obligations };
}

describe("Story 6.1 — obligation settlement intent", () => {
  it("creates an intent bound to the obligation and locked revision", async () => {
    const { ctx, settlementIntents } = createObligationStore();
    const result = await createObligationIntentCore(ctx, {
      obligationId: OBLIGATION_ID as never,
      inputMint: USDC_MINT,
      idempotencyKey: "obligation-key-1",
    });

    expect(result.created).toBe(true);
    expect(settlementIntents[0]?.targetKind).toBe("obligation");
    expect(settlementIntents[0]?.tabRevision).toBe(2);
    expect(settlementIntents[0]?.minimumOutputAtomic).toBe(10_000_000n);
  });

  it("blocks duplicate settlement of the same obligation", async () => {
    const { ctx, obligations } = createObligationStore();
    obligations[0]!.status = "settled";

    await expect(
      createObligationIntentCore(ctx, {
        obligationId: OBLIGATION_ID as never,
        inputMint: USDC_MINT,
        idempotencyKey: "obligation-key-2",
      }),
    ).rejects.toMatchObject({ code: OBLIGATION_FAILURE.OBLIGATION_NOT_OPEN });
  });

  it("binds exact-USDC memo commitment to the bill snapshot hash", () => {
    const hash = computeBillSnapshotForObligation({
      tabId: TAB_ID,
      lockedRevision: 2,
      obligationAmountAtomic: 10_000_000n,
      outputMint: USDC_MINT,
    });

    expect(hash).toBe(
      computeBillSnapshotHash({
        tabId: TAB_ID,
        lockedRevision: 2,
        obligationAmountAtomic: "10000000",
        outputMint: USDC_MINT,
      }),
    );

    const built = buildExactUsdcTransfer({
      payerAddress: FIXTURE_PAYER_WALLET_ADDRESS,
      recipientAddress: FIXTURE_RECIPIENT_WALLET_ADDRESS,
      sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
      amountAtomic: 10_000_000n,
      obligationId: OBLIGATION_ID,
      billSnapshotHash: hash,
      recipientAtaExists: true,
    });

    expect(built.messageHash).toBeTruthy();
    expect(
      computeObligationCommitmentHash({
        obligationId: OBLIGATION_ID,
        billSnapshotHash: hash,
        targetOutputAtomic: "10000000",
        outputMint: USDC_MINT,
        outputDecimals: 6,
      }),
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it("includes round-up in the same intent minimum output", async () => {
    const { ctx, settlementIntents } = createObligationStore();
    await createObligationIntentCore(ctx, {
      obligationId: OBLIGATION_ID as never,
      inputMint: USDC_MINT,
      idempotencyKey: "obligation-key-roundup",
      roundUpAtomic: 500_000n,
    });

    expect(settlementIntents[0]?.minimumOutputAtomic).toBe(10_500_000n);
    expect(settlementIntents[0]?.roundUpAtomic).toBe(500_000n);
  });
});

describe("Story 6.1 — ledger offset", () => {
  it("offsets an obligation exactly once", async () => {
    const { ctx, obligations } = createObligationStore();

    const first = await applySettlementOffset(ctx, {
      intentId: "settlementIntents:1" as never,
      targetKind: "obligation",
      obligationId: OBLIGATION_ID as never,
      transactionSignature: "sig-1",
      now: 1000,
    });
    expect(first.alreadyApplied).toBe(false);
    expect(obligations[0]?.status).toBe("settled");

    const settled = await isTargetAlreadySettled(ctx, {
      targetKind: "obligation",
      obligationId: OBLIGATION_ID as never,
    });
    expect(settled).toBe(true);
  });
});

describe("Story 6.6 — stale revision", () => {
  it("rejects intent creation when the tab revision moved on", async () => {
    const { ctx, obligations } = createObligationStore();
    obligations[0]!.tabRevision = 1;

    await expect(
      createObligationIntentCore(ctx, {
        obligationId: OBLIGATION_ID as never,
        inputMint: USDC_MINT,
        idempotencyKey: "stale-revision",
      }),
    ).rejects.toMatchObject({ code: OBLIGATION_FAILURE.STALE_TAB_REVISION });
  });
});
