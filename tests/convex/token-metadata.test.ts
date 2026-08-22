/**
 * The Convex surface: what the payment sheet actually receives, and what the
 * cache actually stores.
 *
 * The pure decision table is covered in `tests/tokens/resolve.test.ts`. What is
 * exercised here is the part that only exists at the Convex boundary — the auth
 * gate, the per-mint scoping that keeps a token list off the wire, the upsert's
 * refusal to lose a decimals proof, and the failure cooldown.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";
import * as tokens from "@/convex/tokens";
import { getClusterConfig } from "@/lib/solana/cluster";
import { TOKEN_METADATA_FAILURE } from "@/lib/tokens/types";
import { TOKEN_METADATA_FRESH_MS } from "@/lib/tokens/policy";

/* eslint-disable @typescript-eslint/no-explicit-any */
const run = (fn: unknown, ctx: unknown, args: unknown = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, args);

const DID = "did:privy:andre";
const identity = { subject: DID, tokenIdentifier: DID };

// No SOLANA_CLUSTER in the test environment, so the active cluster is devnet —
// which is also the interesting one, since no registry lists its USDC.
const DEVNET = getClusterConfig("devnet");
const MAINNET = getClusterConfig("mainnet-beta");
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const OBSCURE = "5EHZz9Qsw8AhQqSJTGjBkVLcbUeAeCVDLXbFLFvpump";

function store(rows: Row[] = [], status: Row[] = []): Record<string, Row[]> {
  return { tokenMetadata: rows, tokenSourceStatus: status };
}

function cachedRow(overrides: Partial<Row> = {}): Row {
  return {
    _id: "tokenMetadata:1",
    cluster: "devnet",
    mint: BONK,
    symbol: "Bonk",
    name: "Bonk",
    decimals: 5,
    verified: true,
    source: "jupiter",
    fetchedAt: Date.now() - 1000,
    decimalsVerifiedAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
    ...overrides,
  };
}

describe("getTokenMetadata", () => {
  it("refuses an unauthenticated caller", async () => {
    const { ctx } = createFakeCtx(store(), null);
    await expect(run(tokens.getTokenMetadata, ctx, { mints: [BONK] })).rejects.toThrow(
      "UNAUTHORIZED",
    );
  });

  it("returns one entry per requested mint and nothing else", async () => {
    // The whole point of the design: asking about two mints returns two mints,
    // never a list. There is no argument that would make it return the cache.
    const { ctx } = createFakeCtx(
      store([cachedRow(), cachedRow({ _id: "tokenMetadata:2", mint: OBSCURE, symbol: "SPAM" })]),
      identity,
    );
    const result = await run(tokens.getTokenMetadata, ctx, { mints: [BONK] });
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].metadata.mint).toBe(BONK);
  });

  it("names devnet USDC from the pin with an entirely empty cache", async () => {
    const { ctx } = createFakeCtx(store(), identity);
    const result = await run(tokens.getTokenMetadata, ctx, { mints: [DEVNET.usdcMint] });
    expect(result.cluster).toBe("devnet");
    expect(result.tokens[0].metadata).toMatchObject({
      mint: DEVNET.usdcMint,
      symbol: "USDC",
      decimals: 6,
    });
    expect(result.tokens[0].metadata.provenance.source).toBe("cluster_pin");
    // Nameable but not yet payable — the decimals proof is still owed.
    expect(result.unprovenMints).toContain(DEVNET.usdcMint);
  });

  it("does not serve the OTHER cluster's USDC on devnet", async () => {
    const { ctx } = createFakeCtx(store(), identity);
    const result = await run(tokens.getTokenMetadata, ctx, { mints: [MAINNET.usdcMint] });
    expect(result.tokens[0].status).toBe("unknown");
  });

  it("ignores a cached row stamped with the wrong cluster", async () => {
    const poisoned = cachedRow({ cluster: "mainnet-beta", symbol: "WRONG" });
    const { ctx } = createFakeCtx(store([poisoned]), identity);
    const result = await run(tokens.getTokenMetadata, ctx, { mints: [BONK] });
    expect(result.tokens[0].status).toBe("unknown");
  });

  it("defaults to verified-only", async () => {
    const shady = cachedRow({ mint: OBSCURE, symbol: "usdc1", verified: false });
    const { ctx } = createFakeCtx(store([shady]), identity);

    const guarded = await run(tokens.getTokenMetadata, ctx, { mints: [OBSCURE] });
    expect(guarded.tokens[0]).toMatchObject({
      status: "unavailable",
      code: TOKEN_METADATA_FAILURE.UNVERIFIED,
    });

    const opened = await run(tokens.getTokenMetadata, ctx, {
      mints: [OBSCURE],
      verifiedOnly: false,
    });
    expect(opened.tokens[0].status).toBe("ok");
  });

  it("reports which mints are worth refreshing without failing", async () => {
    const stale = cachedRow({ fetchedAt: Date.now() - TOKEN_METADATA_FRESH_MS - 1 });
    const { ctx } = createFakeCtx(store([stale]), identity);
    const result = await run(tokens.getTokenMetadata, ctx, { mints: [BONK, OBSCURE] });
    expect(result.needsRefresh).toEqual(expect.arrayContaining([BONK, OBSCURE]));
    expect(result.tokens[0].status).toBe("ok");
  });

  it("carries the attribution Jupiter's licence requires", async () => {
    const { ctx } = createFakeCtx(store(), identity);
    const result = await run(tokens.getTokenMetadata, ctx, { mints: [] });
    expect(result.attribution).toBe("Powered by Jupiter");
  });

  it("caps the request rather than letting a caller ask about a whole wallet", async () => {
    const { ctx } = createFakeCtx(store(), identity);
    const many = Array.from({ length: tokens.MAX_MINTS_PER_QUERY + 1 }, (_, i) => `mint-${i}`);
    await expect(run(tokens.getTokenMetadata, ctx, { mints: many })).rejects.toThrow(
      TOKEN_METADATA_FAILURE.SOURCE_MALFORMED,
    );
  });
});

describe("commitRows", () => {
  const now = Date.now();

  it("inserts a new row stamped with the ACTIVE cluster, not the caller's", async () => {
    const { ctx, store: db } = createFakeCtx(store());
    await run(tokens.commitRows, ctx, {
      rows: [
        {
          mint: BONK,
          symbol: "Bonk",
          name: "Bonk",
          decimals: 5,
          verified: true,
          source: "jupiter",
          fetchedAt: now,
          decimalsVerifiedAt: now,
        },
      ],
    });
    expect(db.tokenMetadata).toHaveLength(1);
    expect(db.tokenMetadata[0]).toMatchObject({ cluster: "devnet", mint: BONK });
  });

  it("KEEPS an existing decimals proof when the RPC was down this round", async () => {
    // Losing the proof would take a perfectly good token off the payment path
    // for the duration of an RPC blip.
    const existing = cachedRow({ decimalsVerifiedAt: now - 5000 });
    const { ctx, store: db } = createFakeCtx(store([existing]));
    await run(tokens.commitRows, ctx, {
      rows: [
        {
          mint: BONK,
          symbol: "Bonk",
          name: "Bonk",
          decimals: 5,
          verified: true,
          source: "jupiter",
          fetchedAt: now,
          // no decimalsVerifiedAt
        },
      ],
    });
    expect(db.tokenMetadata[0]!.decimalsVerifiedAt).toBe(now - 5000);
  });

  it("VOIDS an old proof when the decimals value itself changed", async () => {
    const existing = cachedRow({ decimals: 5, decimalsVerifiedAt: now - 5000 });
    const { ctx, store: db } = createFakeCtx(store([existing]));
    await run(tokens.commitRows, ctx, {
      rows: [
        {
          mint: BONK,
          symbol: "Bonk",
          name: "Bonk",
          decimals: 9,
          verified: true,
          source: "jupiter",
          fetchedAt: now,
        },
      ],
    });
    // The proof attested to 5, and the row now says 9. Carrying it forward
    // would certify a number nothing ever checked.
    expect(db.tokenMetadata[0]!.decimals).toBe(9);
    expect(db.tokenMetadata[0]!.decimalsVerifiedAt).toBeUndefined();
  });

  it("skips a row whose mint is not plausible base58", async () => {
    const { ctx, store: db } = createFakeCtx(store());
    const result = await run(tokens.commitRows, ctx, {
      rows: [
        { mint: "garbage", verified: false, source: "chain", fetchedAt: now },
      ],
    });
    expect(result.written).toBe(0);
    expect(db.tokenMetadata).toHaveLength(0);
  });
});

describe("recordSourceAttempt", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("backs off exponentially on repeated failures", async () => {
    const { ctx, store: db } = createFakeCtx(store());

    await run(tokens.recordSourceAttempt, ctx, { ok: false, failureCode: "X" });
    const first = db.tokenSourceStatus[0]!;
    const firstWindow = (first.cooldownUntil as number) - (first.lastAttemptAt as number);
    expect(firstWindow).toBe(tokens.SOURCE_COOLDOWN_MS);

    await run(tokens.recordSourceAttempt, ctx, { ok: false, failureCode: "X" });
    const second = db.tokenSourceStatus[0]!;
    expect(second.consecutiveFailures).toBe(2);
    expect((second.cooldownUntil as number) - (second.lastAttemptAt as number)).toBe(
      tokens.SOURCE_COOLDOWN_MS * 2,
    );
  });

  it("clears the cooldown and the failure count on success", async () => {
    const { ctx, store: db } = createFakeCtx(store());
    await run(tokens.recordSourceAttempt, ctx, { ok: false, failureCode: "X" });
    await run(tokens.recordSourceAttempt, ctx, { ok: true });

    const status = db.tokenSourceStatus[0]!;
    expect(status.consecutiveFailures).toBe(0);
    expect(status.cooldownUntil).toBeUndefined();
    expect(status.lastSuccessAt).toBeTypeOf("number");
    // The last failure is retained — an outage that just ended is worth seeing.
    expect(status.lastFailureCode).toBe("X");
  });

  it("caps the backoff so a long outage does not disable refresh for hours", async () => {
    const { ctx, store: db } = createFakeCtx(store());
    for (let i = 0; i < 12; i += 1) {
      await run(tokens.recordSourceAttempt, ctx, { ok: false, failureCode: "X" });
    }
    const status = db.tokenSourceStatus[0]!;
    expect((status.cooldownUntil as number) - (status.lastAttemptAt as number)).toBe(
      15 * 60_000,
    );
  });
});
