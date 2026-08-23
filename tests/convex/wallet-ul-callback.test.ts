import { describe, expect, it } from "vitest";
import { recordWalletUlCallbackCore } from "../../convex/lib/walletUlCallback";
import { createFakeCtx, fakeId } from "../helpers/convexFakeDb";
import {
  isWalletUlChallengeId,
  parseWalletUlStartParam,
  WALLET_UL_START_PREFIX,
} from "@/lib/wallet/universalLinks";

function makeCtx(overrides?: { consumedAt?: number; expiresAt?: number }) {
  const now = 1_700_000_000_000;
  const { ctx, store } = createFakeCtx({
    walletLinkChallenges: [
      {
        _id: "walletLinkChallenges:1",
        userId: "users:alice",
        nonce: "nonce-alice",
        expiresAt: overrides?.expiresAt ?? now + 60_000,
        createdAt: now,
        ...(overrides?.consumedAt === undefined ? {} : { consumedAt: overrides.consumedAt }),
      },
    ],
  });
  return { ctx, store, now };
}

describe("wallet UL callback record — no existence leak", () => {
  it("records a blob on an unconsumed live challenge", async () => {
    const { ctx, store, now } = makeCtx();
    const result = await recordWalletUlCallbackCore(ctx, {
      challengeId: fakeId("walletLinkChallenges:1"),
      data: "cipher",
      nonce: "n",
      encryptionPublicKey: "pk",
      now,
    });
    expect(result).toEqual({ ok: true });
    expect(store.walletLinkChallenges?.[0]).toMatchObject({
      ulData: "cipher",
      ulNonce: "n",
      ulEncryptionPublicKey: "pk",
    });
  });

  it("refuses a missing challenge", async () => {
    const { ctx, now } = makeCtx();
    const result = await recordWalletUlCallbackCore(ctx, {
      challengeId: fakeId("walletLinkChallenges:missing"),
      data: "cipher",
      nonce: "n",
      encryptionPublicKey: "pk",
      now,
    });
    expect(result).toEqual({ ok: false });
  });

  it("refuses an expired challenge", async () => {
    const { ctx, now } = makeCtx({ expiresAt: 10 });
    const result = await recordWalletUlCallbackCore(ctx, {
      challengeId: fakeId("walletLinkChallenges:1"),
      data: "cipher",
      nonce: "n",
      encryptionPublicKey: "pk",
      now,
    });
    expect(result).toEqual({ ok: false });
  });

  it("refuses a consumed challenge", async () => {
    const { ctx, now } = makeCtx({ consumedAt: 99 });
    const result = await recordWalletUlCallbackCore(ctx, {
      challengeId: fakeId("walletLinkChallenges:1"),
      data: "cipher",
      nonce: "n",
      encryptionPublicKey: "pk",
      now,
    });
    expect(result).toEqual({ ok: false });
  });

  it("reserves the ulcb_ start param", () => {
    expect(WALLET_UL_START_PREFIX).toBe("ulcb_");
    expect(parseWalletUlStartParam("ulcb_k57abcde0123")).toBe("k57abcde0123");
    expect(parseWalletUlStartParam("tabsess_9fA2Kx7QpL")).toBeNull();
    expect(isWalletUlChallengeId("k57abcde0123")).toBe(true);
    expect(isWalletUlChallengeId("walletLinkChallenges:1")).toBe(false);
  });
});
