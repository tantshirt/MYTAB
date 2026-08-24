import { describe, expect, it } from "vitest";
import { createFakeCtx } from "../helpers/convexFakeDb";
import * as settlements from "@/convex/settlements";
import { USDC_MINT } from "@/lib/solana/constants";
import bs58 from "bs58";

/* eslint-disable @typescript-eslint/no-explicit-any */
const run = (fn: unknown, ctx: unknown, args: unknown = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, args);

const PAYER = {
  _id: "users:payer",
  privyDid: "did:privy:payer",
  telegramUserId: "100",
  displayName: "Alex",
};
const CREDITOR = {
  _id: "users:maya",
  privyDid: "did:privy:maya",
  telegramUserId: "200",
  displayName: "Maya",
};
const identity = { subject: PAYER.privyDid, tokenIdentifier: PAYER.privyDid };

function store(overrides: Record<string, unknown[]> = {}) {
  return {
    users: [PAYER, CREDITOR],
    wallets: [
      {
        _id: "wallets:1",
        userId: PAYER._id,
        kind: "embedded",
        solanaAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJos9mPq",
        isEmbedded: true,
        isDefaultReceiving: true,
      },
    ],
    tabs: [
      {
        _id: "tabs:1",
        name: "Sukhumvit Dinner",
        lockedRevision: 2,
        revision: 2,
        fxSnapshotId: "fxSnapshots:1",
      },
    ],
    fxSnapshots: [
      {
        _id: "fxSnapshots:1",
        numeratorAtomic: 1_000_000n,
        denominatorMinor: 3_536n,
      },
    ],
    obligations: [
      {
        _id: "obligations:1",
        tabId: "tabs:1",
        tabRevision: 2,
        debtorUserId: PAYER._id,
        creditorUserId: CREDITOR._id,
        displayAmountThbMinor: 29_174n,
        amountAtomic: 8_250_000n,
        outputMint: USDC_MINT,
        settlementIntentId: "settlementIntents:1",
      },
    ],
    settlementIntents: [
      {
        _id: "settlementIntents:1",
        obligationId: "obligations:1",
        status: "ready_for_signature",
        inputMint: USDC_MINT,
        outputMint: USDC_MINT,
        maximumInputAtomic: 8_250_000n,
        minimumOutputAtomic: 8_000_000n,
        quotedOtherAmountThreshold: 8_250_000n,
        expiresAt: Date.now() + 60_000,
        createdAt: 1,
        serializedMessage: "prepared-tx",
      },
    ],
    ...overrides,
  };
}

describe("getObligationQuoteBaseInternal", () => {
  it("reads the recipient and threshold from stored rows", async () => {
    const { ctx } = createFakeCtx(store(), identity);
    const result = await run(settlements.getObligationQuoteBaseInternal, ctx, {
      obligationId: "obligations:1",
    });
    expect(result.recipientName).toBe("Maya");
    expect(result.tabName).toBe("Sukhumvit Dinner");
    expect(result.payerAddress).toBe("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJos9mPq");
    expect(result.intent.quotedOtherAmountThreshold).toBe(8_250_000n);
    expect(result.intent.serializedMessage).toBe("prepared-tx");
  });

  it("shows the active intent payment-time FX instead of the lock-time snapshot", async () => {
    const seeded = store();
    seeded.fxSnapshots!.push({
      _id: "fxSnapshots:payment",
      numeratorAtomic: 2_000_000n,
      denominatorMinor: 7_000n,
    });
    Object.assign(seeded.settlementIntents![0]!, {
      paymentFxSnapshotId: "fxSnapshots:payment",
    });
    const { ctx } = createFakeCtx(seeded, identity);
    const result = await run(settlements.getObligationQuoteBaseInternal, ctx, {
      obligationId: "obligations:1",
    });
    expect(result.rateNumeratorAtomic).toBe(2_000_000n);
    expect(result.rateDenominatorMinor).toBe(7_000n);
  });

  it("refuses anyone who is not the debtor", async () => {
    const { ctx } = createFakeCtx(store(), {
      subject: CREDITOR.privyDid,
      tokenIdentifier: CREDITOR.privyDid,
    });
    await expect(
      run(settlements.getObligationQuoteBaseInternal, ctx, { obligationId: "obligations:1" }),
    ).rejects.toThrow("UNAUTHORIZED");
  });

  it("does not take a wallet address from the arguments", async () => {
    const { ctx } = createFakeCtx(
      store({
        wallets: [],
      }),
      identity,
    );
    const result = await run(settlements.getObligationQuoteBaseInternal, ctx, {
      obligationId: "obligations:1",
    });
    expect(result.payerAddress).toBeNull();
  });

  it("projects v2 generic fiat and currency instead of the legacy THB lane", async () => {
    const seeded = store();
    Object.assign(seeded.obligations![0]!, {
      displayAmountThbMinor: 1n,
      displayAmountMinor: 12_345n,
      displayCurrency: "KWD",
      displayCurrencyMinorDigits: 3,
    });
    const { ctx } = createFakeCtx(seeded, identity);
    const result = await run(settlements.getObligationQuoteBaseInternal, ctx, {
      obligationId: "obligations:1",
    });
    expect(result).toMatchObject({
      displayAmountMinor: 12_345n,
      displayAmountThbMinor: 12_345n,
      displayCurrency: "KWD",
    });
  });
});

describe("held-token account admission", () => {
  function tokenAccountData(state: number): string {
    const bytes = new Uint8Array(165);
    bytes.set(bs58.decode(USDC_MINT), 0);
    bytes.set(bs58.decode("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJos9mPq"), 32);
    bytes[108] = state;
    return Buffer.from(bytes).toString("base64");
  }

  it("admits only initialized accounts and excludes uninitialized/frozen balances", () => {
    expect(settlements.initializedOwnedTokenAccount(
      tokenAccountData(1),
      "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJos9mPq",
    )).not.toBeNull();
    expect(settlements.initializedOwnedTokenAccount(
      tokenAccountData(0),
      "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJos9mPq",
    )).toBeNull();
    expect(settlements.initializedOwnedTokenAccount(
      tokenAccountData(2),
      "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJos9mPq",
    )).toBeNull();
  });
});

describe("getIntent — post-payment detail", () => {
  it("projects the recipient and the guaranteed USDC they received", async () => {
    const { ctx } = createFakeCtx(
      store({
        settlementIntents: [
          {
            _id: "settlementIntents:1",
            userId: PAYER._id,
            recipientUserId: CREDITOR._id,
            obligationId: "obligations:1",
            status: "confirmed",
            quotedOtherAmountThreshold: 8_250_000n,
            minimumOutputAtomic: 8_000_000n,
            expiresAt: Date.now() + 60_000,
            failureCode: null,
            transactionSignature: "sig",
          },
        ],
        telegramStatusMessages: [
          { _id: "telegramStatusMessages:1", tabId: "tabs:1", deepLinkToken: "tabtok" },
        ],
      }),
      identity,
    );

    const result = await run(settlements.getIntent, ctx, { intentId: "settlementIntents:1" });
    expect(result.recipientName).toBe("Maya");
    expect(result.recipientReceivesLabel).toBe("8.250000 USDC");
    expect(result.amountLabel).toBe("฿291.74");
    expect(result.billName).toBe("Sukhumvit Dinner");
    expect(result.tabHref).toBe("/tabs/tabtok");
    expect(JSON.stringify(result)).not.toMatch(/swap|route|slippage/i);
  });
});
