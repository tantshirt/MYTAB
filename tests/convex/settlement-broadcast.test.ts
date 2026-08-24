import { afterEach, describe, expect, it } from "vitest";
import bs58 from "bs58";
import {
  RPC_FAILURE,
  SolanaRpcClient,
  SolanaRpcError,
  classifyJsonRpcError,
  classifySendFailure,
  safeU64FromJson,
} from "@/lib/solana/rpc";
import {
  classifyRecipientAta,
  decodeTokenAccount,
  deriveRecipientUsdcAta,
} from "@/lib/solana/tokenAccount";
import { TOKEN_PROGRAM_ID, USDC_MINT } from "@/lib/solana/constants";
import {
  CONFIRMATION_FAILURE,
  parseFinalizedConfirmation,
} from "@/convex/internal/confirmations";
import {
  SponsorCoSignError,
  coSignAndBroadcast,
  verifySponsorCoSignedTransaction,
} from "@/convex/internal/privy";
import {
  buildPrivySignTransactionRequest,
  readSignedTransaction,
  sponsorIdempotencyKey,
} from "@/lib/privy/signTransaction";
import { validateBeforeSponsorCoSign } from "@/lib/solana/validateTransactionMessage";
import { sha256Hex } from "@/lib/crypto/convexCrypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Keypair,
} from "@solana/web3.js";
import { BLOCKHASH, ata, buildTx, makeActors, memoFor, signAs, toBase64 } from "../helpers/solanaTx";
import { decodeTransactionBase64 } from "@/lib/solana/decodeTransaction";
import dflowFixture from "../fixtures/dflow-order-mainnet.json";

const actors = makeActors(31);
const PAYER = actors.payer.publicKey.toBase58();
const SPONSOR = actors.sponsor.publicKey.toBase58();
const RECIPIENT = actors.recipient.publicKey.toBase58();
const AMOUNT = 1_000_000n;

function ed25519Sign(message: Uint8Array, signer: Keypair): Uint8Array {
  return ed25519.sign(message, signer.secretKey.slice(0, 32));
}

const savedEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, savedEnv);
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** A fetch stub that records every call and replays scripted responses. */
function scriptedFetch(handler: (body: { method: string }, callIndex: number) => Response | Error) {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method: string };
    calls.push({
      url: String(url),
      body: body as Record<string, unknown>,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const next = handler(body, calls.length - 1);
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function rpcOk(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function rpcErr(code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code, message } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** The exact transaction shape the direct USDC path produces. */
function directTransfer(overrides: Parameters<typeof buildTx>[0] extends infer T ? Partial<T> : never = {}) {
  return buildTx({
    actors,
    amount: AMOUNT,
    memoText: memoFor("tips:test", AMOUNT),
    ...overrides,
  });
}

function partialSigned() {
  const tx = directTransfer();
  const messageHash = sha256Hex(tx.message.serialize());
  // What `applyQuotedTransactionInternal` persists is the whole (unsigned)
  // transaction, not a bare message — match that exactly.
  const serializedMessageBase64 = toBase64(directTransfer());
  signAs(tx, actors.payer);
  return { tx, base64: toBase64(tx), messageHash, serializedMessageBase64 };
}

function fullySigned() {
  const { tx, base64, messageHash, serializedMessageBase64 } = partialSigned();
  const full = signAs(
    (() => {
      const clone = directTransfer();
      clone.signatures = [...tx.signatures];
      return clone;
    })(),
    actors.sponsor,
  );
  return {
    partialBase64: base64,
    fullBase64: toBase64(full),
    messageHash,
    serializedMessageBase64,
    expectedSignature: bs58.encode(full.signatures[0]!),
  };
}

function validationContext(messageHash: string) {
  return {
    routingKind: "exact_usdc" as const,
    intentId: "settlementIntents:x",
    sponsorAddress: SPONSOR,
    blockhash: BLOCKHASH,
    lastValidBlockHeight: 500,
    nowMs: Date.now(),
    telegramContextFresh: true,
    targetSuperseded: false,
    sponsorPaused: false,
    reservationActive: true,
    reservationOwnerIntentId: "settlementIntents:x",
    expectedMemo: memoFor("tips:test", AMOUNT),
    intent: {
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      inputMint: USDC_MINT,
      outputMint: USDC_MINT,
      targetOutputAtomic: AMOUNT.toString(),
      maxInputAtomic: AMOUNT.toString(),
      minimumOutputAtomic: AMOUNT.toString(),
      messageHash,
      status: "user_signed",
    },
  };
}

// ---------------------------------------------------------------------------

describe("SolanaRpcClient failure classification", () => {
  it("retries a read on 429 and succeeds when the node recovers", async () => {
    const { impl, calls } = scriptedFetch((_body, i) =>
      i === 0 ? new Response("slow down", { status: 429 }) : rpcOk(1234),
    );
    const rpc = new SolanaRpcClient({ url: "https://api.devnet.solana.com", fetchImpl: impl });
    await expect(rpc.getBlockHeight("finalized")).resolves.toBe(1234);
    expect(calls).toHaveLength(2);
  });

  it("classifies a node that is behind as retryable, not as a method error", () => {
    const error = classifyJsonRpcError({ code: -32005, message: "Node is behind by 200 slots" });
    expect(error.code).toBe(RPC_FAILURE.NODE_BEHIND);
    expect(error.retryable).toBe(true);
  });

  it("broadcasts exactly once and never retries the send", async () => {
    const { impl, calls } = scriptedFetch(() => new Response("boom", { status: 503 }));
    const rpc = new SolanaRpcClient({ url: "https://api.devnet.solana.com", fetchImpl: impl });

    await expect(rpc.sendTransactionOnce("AAA=")).rejects.toMatchObject({
      code: RPC_FAILURE.BROADCAST_AMBIGUOUS,
    });
    // One attempt. A retry loop here is one refactor away from a second payment.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.method).toBe("sendTransaction");
  });

  it("maps a preflight rejection to definitively-not-broadcast", async () => {
    const { impl } = scriptedFetch(() => rpcErr(-32002, "Transaction simulation failed"));
    const rpc = new SolanaRpcClient({ url: "https://api.devnet.solana.com", fetchImpl: impl });
    await expect(rpc.sendTransactionOnce("AAA=")).rejects.toMatchObject({
      code: RPC_FAILURE.BROADCAST_REJECTED,
    });
  });

  it("maps a timeout on the send to ambiguous, never to failed", () => {
    const timeout = new SolanaRpcError(RPC_FAILURE.TIMEOUT, "deadline", true);
    expect(classifySendFailure(timeout).code).toBe(RPC_FAILURE.BROADCAST_AMBIGUOUS);
  });

  it("treats 'already processed' as on-chain rather than rejected", () => {
    const alreadyProcessed = new SolanaRpcError(
      RPC_FAILURE.METHOD_ERROR,
      "This transaction has already been processed",
    );
    expect(classifySendFailure(alreadyProcessed).code).toBe(RPC_FAILURE.BROADCAST_AMBIGUOUS);
  });

  it("refuses a u64 that lost precision in JSON", () => {
    expect(() => safeU64FromJson(2 ** 53, "lamports")).toThrow(SolanaRpcError);
    expect(safeU64FromJson("18446744073709551615", "amount")).toBe(18_446_744_073_709_551_615n);
  });

  it("reads the wallet's complete SPL-token account inventory as base64 evidence", async () => {
    const { impl, calls } = scriptedFetch(() => rpcOk({
      context: { slot: 123 },
      value: [{
        pubkey: actors.attacker.publicKey.toBase58(),
        account: {
          data: ["AA==", "base64"],
          owner: TOKEN_PROGRAM_ID,
          lamports: "2039280",
          executable: false,
        },
      }],
    }));
    const rpc = new SolanaRpcClient({ url: "https://api.devnet.solana.com", fetchImpl: impl });
    await expect(rpc.getTokenAccountsByOwner(PAYER, TOKEN_PROGRAM_ID)).resolves.toEqual([{
      address: actors.attacker.publicKey.toBase58(),
      dataBase64: "AA==",
      owner: TOKEN_PROGRAM_ID,
      lamports: 2_039_280n,
      executable: false,
    }]);
    expect(calls[0]?.body).toMatchObject({
      method: "getTokenAccountsByOwner",
      params: [PAYER, { programId: TOKEN_PROGRAM_ID }, { commitment: "confirmed", encoding: "base64" }],
    });
  });
});

// ---------------------------------------------------------------------------

describe("recipient ATA existence (live answer, never a guess)", () => {
  const mint = USDC_MINT;
  const address = deriveRecipientUsdcAta(RECIPIENT, mint);

  function tokenAccountData(owner: string, accountMint: string, state = 1): string {
    const bytes = new Uint8Array(165);
    bytes.set(bs58.decode(accountMint), 0);
    bytes.set(bs58.decode(owner), 32);
    bytes[108] = state;
    return Buffer.from(bytes).toString("base64");
  }

  it("derives the same ATA the SPL library does", () => {
    expect(address).toBe(ata(actors.recipient.publicKey).toBase58());
  });

  it("reports does-not-exist for a null account", () => {
    const result = classifyRecipientAta({
      address,
      account: null,
      expectedOwner: RECIPIENT,
      expectedMint: mint,
    });
    expect(result).toMatchObject({ ok: true, exists: false });
  });

  it("reports exists for a healthy initialised USDC account", () => {
    const result = classifyRecipientAta({
      address,
      account: { dataBase64: tokenAccountData(RECIPIENT, mint), owner: TOKEN_PROGRAM_ID },
      expectedOwner: RECIPIENT,
      expectedMint: mint,
    });
    expect(result).toMatchObject({ ok: true, exists: true });
  });

  it("refuses an account holding the wrong mint at the derived address", () => {
    const result = classifyRecipientAta({
      address,
      account: {
        dataBase64: tokenAccountData(RECIPIENT, "So11111111111111111111111111111111111111112"),
        owner: TOKEN_PROGRAM_ID,
      },
      expectedOwner: RECIPIENT,
      expectedMint: mint,
    });
    expect(result).toMatchObject({ ok: false, failureCode: "RECIPIENT_ATA_UNUSABLE" });
  });

  it("refuses an uninitialised account rather than transferring into it", () => {
    const result = classifyRecipientAta({
      address,
      account: { dataBase64: tokenAccountData(RECIPIENT, mint, 0), owner: TOKEN_PROGRAM_ID },
      expectedOwner: RECIPIENT,
      expectedMint: mint,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses an account the token program does not own", () => {
    const result = classifyRecipientAta({
      address,
      account: { dataBase64: tokenAccountData(RECIPIENT, mint), owner: "11111111111111111111111111111111" },
      expectedOwner: RECIPIENT,
      expectedMint: mint,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("decodes the amount as a BigInt, never a double", () => {
    const bytes = new Uint8Array(165);
    bytes.set(bs58.decode(USDC_MINT), 0);
    bytes.set(bs58.decode(RECIPIENT), 32);
    // 2^63 — well past what a double can represent exactly.
    new DataView(bytes.buffer).setBigUint64(64, 9_223_372_036_854_775_808n, true);
    bytes[108] = 1;
    const decoded = decodeTokenAccount(Buffer.from(bytes).toString("base64"));
    expect(decoded?.amount).toBe(9_223_372_036_854_775_808n);
  });
});

// ---------------------------------------------------------------------------

describe("sponsor co-signature verification", () => {
  it("derives the transaction signature from the fee payer's slot", () => {
    const { partialBase64, fullBase64, expectedSignature } = fullySigned();
    const result = verifySponsorCoSignedTransaction({
      partialSignedTxBase64: partialBase64,
      fullySignedTxBase64: fullBase64,
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
    });
    expect(result).toMatchObject({ ok: true, transactionSignature: expectedSignature });
  });

  it("rejects a signer that changed the message", () => {
    const { partialBase64 } = fullySigned();
    // A different amount is a different message, however it is signed.
    const other = buildTx({ actors, amount: 2_000_000n });
    signAs(other, actors.payer);
    signAs(other, actors.sponsor);

    const result = verifySponsorCoSignedTransaction({
      partialSignedTxBase64: partialBase64,
      fullySignedTxBase64: toBase64(other),
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
    });
    expect(result).toMatchObject({
      ok: false,
      failureCode: "SPONSOR_MESSAGE_MUTATED_BY_SIGNER",
    });
  });

  it("rejects a return that dropped the user's signature", () => {
    const { partialBase64, fullBase64 } = fullySigned();
    const stripped = directTransfer();
    const decoded = Buffer.from(fullBase64, "base64");
    void decoded;
    signAs(stripped, actors.sponsor); // sponsor only; payer slot left empty

    const result = verifySponsorCoSignedTransaction({
      partialSignedTxBase64: partialBase64,
      fullySignedTxBase64: toBase64(stripped),
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
    });
    expect(result).toMatchObject({ ok: false, failureCode: "SPONSOR_USER_SIGNATURE_DROPPED" });
  });

  it("rejects a sponsor slot filled by a key that is not the sponsor", () => {
    const { partialBase64 } = fullySigned();
    // Splice a syntactically valid but wrong signature into the fee-payer slot.
    const forged = directTransfer();
    const partial = partialSigned();
    forged.signatures = [...partial.tx.signatures];
    forged.signatures[0] = ed25519Sign(forged.message.serialize(), actors.attacker);

    const result = verifySponsorCoSignedTransaction({
      partialSignedTxBase64: partialBase64,
      fullySignedTxBase64: toBase64(forged),
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
    });
    expect(result).toMatchObject({
      ok: false,
      failureCode: "SPONSOR_SIGNATURE_INVALID",
    });
  });
});

// ---------------------------------------------------------------------------

describe("Privy signing request shape", () => {
  it("uses the documented endpoint, auth scheme and idempotency header", () => {
    const request = buildPrivySignTransactionRequest({
      appId: "app-1",
      appSecret: "secret-1",
      walletId: "wallet-1",
      transactionBase64: "AAA=",
      idempotencyKey: sponsorIdempotencyKey("intent-1", "hash-1"),
    });

    expect(request.url).toBe("https://api.privy.io/v1/wallets/wallet-1/rpc");
    expect(request.headers["privy-app-id"]).toBe("app-1");
    expect(request.headers.Authorization).toBe(
      `Basic ${Buffer.from("app-1:secret-1").toString("base64")}`,
    );
    expect(request.headers["privy-idempotency-key"]).toBe(
      "mytab-cosign-v1:intent-1:hash-1",
    );
    expect(JSON.parse(request.body)).toEqual({
      method: "signTransaction",
      params: { transaction: "AAA=", encoding: "base64" },
    });
  });

  it("binds the idempotency key to the message hash, not just the intent", () => {
    expect(sponsorIdempotencyKey("i", "hashA")).not.toBe(sponsorIdempotencyKey("i", "hashB"));
  });

  it("refuses a signing response in any encoding but base64", () => {
    expect(() =>
      readSignedTransaction({ data: { signed_transaction: "x", encoding: "base58" } }),
    ).toThrow(/base64/);
    expect(readSignedTransaction({ data: { signed_transaction: "abc", encoding: "base64" } })).toBe(
      "abc",
    );
  });
});

// ---------------------------------------------------------------------------

describe("coSignAndBroadcast live path", () => {
  function withLiveCredentials(): void {
    process.env.PRIVY_APP_ID = "app-1";
    process.env.PRIVY_APP_SECRET = "secret-1";
    process.env.PRIVY_SPONSOR_WALLET_ID = "wallet-1";
    process.env.PRIVY_SPONSOR_WALLET_ADDRESS = SPONSOR;
    process.env.SOLANA_CLUSTER = "devnet";
    process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
  }

  it("persists the signature BEFORE broadcasting and returns it", async () => {
    withLiveCredentials();
    const signed = fullySigned();
    const order: string[] = [];

    const privyFetch = (async () =>
      new Response(
        JSON.stringify({
          method: "signTransaction",
          data: { signed_transaction: signed.fullBase64, encoding: "base64" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const { impl: rpcFetch } = scriptedFetch((body) => {
      order.push(`rpc:${body.method}`);
      if (body.method === "getBlockHeight") return rpcOk(100);
      if (body.method === "sendTransaction") return rpcOk(signed.expectedSignature);
      return rpcOk(null);
    });

    const result = await coSignAndBroadcast({
      intentId: "settlementIntents:x",
      partialSignedTxBase64: signed.partialBase64,
      messageHash: signed.messageHash,
      serializedMessageBase64: signed.serializedMessageBase64,
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
      lastValidBlockHeight: 500,
      validationContext: validationContext(signed.messageHash),
      fetchImpl: privyFetch,
      rpcClient: new SolanaRpcClient({
        url: "https://api.devnet.solana.com",
        fetchImpl: rpcFetch,
      }),
      onSignatureDerived: async () => {
        order.push("persisted");
      },
    });

    expect(result).toMatchObject({
      signature: signed.expectedSignature,
      broadcast: "sent",
    });
    // The durable record must exist before the transaction can.
    expect(order.indexOf("persisted")).toBeLessThan(order.indexOf("rpc:sendTransaction"));
  });

  it("returns ambiguous — never throws — when the broadcast cannot be observed", async () => {
    withLiveCredentials();
    const signed = fullySigned();

    const privyFetch = (async () =>
      new Response(
        JSON.stringify({ data: { signed_transaction: signed.fullBase64, encoding: "base64" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const { impl: rpcFetch } = scriptedFetch((body) => {
      if (body.method === "getBlockHeight") return rpcOk(100);
      return new Response("gateway timeout", { status: 504 });
    });

    const result = await coSignAndBroadcast({
      intentId: "settlementIntents:x",
      partialSignedTxBase64: signed.partialBase64,
      messageHash: signed.messageHash,
      serializedMessageBase64: signed.serializedMessageBase64,
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
      lastValidBlockHeight: 500,
      validationContext: validationContext(signed.messageHash),
      fetchImpl: privyFetch,
      rpcClient: new SolanaRpcClient({
        url: "https://api.devnet.solana.com",
        fetchImpl: rpcFetch,
      }),
    });

    expect(result.broadcast).toBe("ambiguous");
    expect(result.signature).toBe(signed.expectedSignature);
  });

  it("refuses to sign when the blockhash can no longer land", async () => {
    withLiveCredentials();
    const signed = fullySigned();
    let privyCalled = false;

    const privyFetch = (async () => {
      privyCalled = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const { impl: rpcFetch } = scriptedFetch((body) =>
      body.method === "getBlockHeight" ? rpcOk(9_999) : rpcOk(null),
    );

    const error = await coSignAndBroadcast({
      intentId: "settlementIntents:x",
      partialSignedTxBase64: signed.partialBase64,
      messageHash: signed.messageHash,
      serializedMessageBase64: signed.serializedMessageBase64,
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
      lastValidBlockHeight: 500,
      validationContext: validationContext(signed.messageHash),
      fetchImpl: privyFetch,
      rpcClient: new SolanaRpcClient({
        url: "https://api.devnet.solana.com",
        fetchImpl: rpcFetch,
      }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SponsorCoSignError);
    expect(error).toMatchObject({ code: "BLOCKHASH_EXPIRED", phase: "pre_sign" });
    // Proven pre-broadcast: the sponsor key was never touched.
    expect(privyCalled).toBe(false);
  });

  it("never broadcasts a transaction whose message Privy altered", async () => {
    withLiveCredentials();
    const signed = fullySigned();
    const tampered = buildTx({ actors, amount: 5_000_000n });
    signAs(tampered, actors.payer);
    signAs(tampered, actors.sponsor);

    const privyFetch = (async () =>
      new Response(
        JSON.stringify({ data: { signed_transaction: toBase64(tampered), encoding: "base64" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    let sent = false;
    const { impl: rpcFetch } = scriptedFetch((body) => {
      if (body.method === "sendTransaction") {
        sent = true;
      }
      return body.method === "getBlockHeight" ? rpcOk(100) : rpcOk("sig");
    });

    const error = await coSignAndBroadcast({
      intentId: "settlementIntents:x",
      partialSignedTxBase64: signed.partialBase64,
      messageHash: signed.messageHash,
      serializedMessageBase64: signed.serializedMessageBase64,
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
      lastValidBlockHeight: 500,
      validationContext: validationContext(signed.messageHash),
      fetchImpl: privyFetch,
      rpcClient: new SolanaRpcClient({
        url: "https://api.devnet.solana.com",
        fetchImpl: rpcFetch,
      }),
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ phase: "pre_broadcast" });
    expect(sent).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("finalized confirmation parsing (AD-11)", () => {
  const recipientAta = deriveRecipientUsdcAta(RECIPIENT, USDC_MINT);
  const payerAta = deriveRecipientUsdcAta(PAYER, USDC_MINT);

  function finalizedResponse(overrides: {
    recipientDelta?: bigint;
    payerDelta?: bigint;
    sponsorDebit?: bigint;
    err?: unknown;
    extraTokenAccount?: { index: number; pre: bigint; post: bigint };
    mint?: string;
  } = {}) {
    const { fullBase64 } = fullySigned();
    const decodedKeys = directTransfer().message.staticAccountKeys.map((k) => k.toBase58());
    const recipientIndex = decodedKeys.indexOf(recipientAta);
    const payerIndex = decodedKeys.indexOf(payerAta);
    const mint = overrides.mint ?? USDC_MINT;

    const recipientDelta = overrides.recipientDelta ?? AMOUNT;
    const payerDelta = overrides.payerDelta ?? -AMOUNT;
    const sponsorDebit = overrides.sponsorDebit ?? 15_000n;

    const preLamports = decodedKeys.map(() => 1_000_000_000);
    const postLamports = [...preLamports];
    postLamports[0] = Number(BigInt(preLamports[0]!) - sponsorDebit);

    const preTokenBalances = [
      tokenBalance(recipientIndex, mint, RECIPIENT, 5_000_000n),
      tokenBalance(payerIndex, mint, PAYER, 10_000_000n),
    ];
    const postTokenBalances = [
      tokenBalance(recipientIndex, mint, RECIPIENT, 5_000_000n + recipientDelta),
      tokenBalance(payerIndex, mint, PAYER, 10_000_000n + payerDelta),
    ];

    if (overrides.extraTokenAccount) {
      preTokenBalances.push(
        tokenBalance(overrides.extraTokenAccount.index, mint, "SomeoneElse", overrides.extraTokenAccount.pre),
      );
      postTokenBalances.push(
        tokenBalance(overrides.extraTokenAccount.index, mint, "SomeoneElse", overrides.extraTokenAccount.post),
      );
    }

    return {
      slot: 1_000,
      blockTime: 1,
      transactionBase64: fullBase64,
      meta: {
        err: overrides.err ?? null,
        fee: 5_000,
        preBalances: preLamports,
        postBalances: postLamports,
        preTokenBalances,
        postTokenBalances,
        loadedAddresses: { writable: [], readonly: [] },
      } as Record<string, unknown>,
    };
  }

  function tokenBalance(accountIndex: number, mint: string, owner: string, amount: bigint) {
    return {
      accountIndex,
      mint,
      owner,
      programId: TOKEN_PROGRAM_ID,
      uiTokenAmount: { amount: amount.toString(), decimals: 6 },
    };
  }

  function expectation(messageHash: string) {
    return {
      messageHash,
      recipientAddress: RECIPIENT,
      outputMint: USDC_MINT,
      inputMint: USDC_MINT,
      routingKind: "exact_usdc" as const,
      minimumOutputAtomic: AMOUNT,
      maximumInputAtomic: AMOUNT,
      reservedSponsorLamports: 3_000_000n,
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
    };
  }

  it("accepts a finalized transfer that matches the locked intent exactly", () => {
    const signed = fullySigned();
    const parsed = parseFinalizedConfirmation(
      signed.expectedSignature,
      finalizedResponse(),
      expectation(signed.messageHash),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.recipientDeltaAtomic).toBe(AMOUNT);
      expect(parsed.payerDebitAtomic).toBe(AMOUNT);
      expect(parsed.platformFeeAtomic).toBe(0n);
      expect(parsed.sponsorDebitLamports).toBe(15_000n);
    }
  });

  it("refuses a transaction that finalized with an error", () => {
    const signed = fullySigned();
    const parsed = parseFinalizedConfirmation(
      signed.expectedSignature,
      finalizedResponse({ err: { InstructionError: [2, "Custom"] } }),
      expectation(signed.messageHash),
    );
    expect(parsed).toMatchObject({ success: false, failureCode: CONFIRMATION_FAILURE.TX_FAILED });
  });

  it("refuses a message hash that is not the one we locked", () => {
    const signed = fullySigned();
    const parsed = parseFinalizedConfirmation(
      signed.expectedSignature,
      finalizedResponse(),
      { ...expectation(signed.messageHash), messageHash: sha256Hex("something else") },
    );
    expect(parsed).toMatchObject({
      success: false,
      failureCode: CONFIRMATION_FAILURE.MESSAGE_HASH,
    });
  });

  it("binds confirmation to the exact RPC signature", () => {
    const signed = fullySigned();
    const parsed = parseFinalizedConfirmation(
      bs58.encode(new Uint8Array(64).fill(7)),
      finalizedResponse(),
      expectation(signed.messageHash),
    );
    expect(parsed).toMatchObject({
      success: false,
      failureCode: CONFIRMATION_FAILURE.SIGNATURE_MISMATCH,
    });
  });

  it("accepts and indexes resolved routed lookup tables before destination proof", () => {
    const body = JSON.parse(
      Buffer.from(dflowFixture.response.bodyBase64, "base64").toString("utf8"),
    ) as {
      transaction: string;
      addressLookupTables: Array<{
        address: string;
        addresses: Record<string, string>;
      }>;
    };
    const decoded = decodeTransactionBase64(body.transaction);
    const tables = new Map(body.addressLookupTables.map((table) => [table.address, table.addresses]));
    const writable: string[] = [];
    const readonly: string[] = [];
    for (const lookup of decoded.message.addressTableLookups) {
      const table = tables.get(lookup.accountKey)!;
      writable.push(...lookup.writableIndexes.map((index) => table[String(index)]!));
      readonly.push(...lookup.readonlyIndexes.map((index) => table[String(index)]!));
    }
    const keys = [...decoded.message.staticAccountKeys, ...writable, ...readonly];
    const recipient = dflowFixture.keys.recipient;
    const outputMint = USDC_MINT;
    const zeroBalances = keys.map(() => 1_000_000);
    const signature = bs58.encode(decoded.signatures[0]!);
    const minimumOutputAtomic = BigInt(dflowFixture.order.otherAmountThreshold);
    const parsed = parseFinalizedConfirmation(
      signature,
      {
        slot: dflowFixture.order.contextSlot,
        blockTime: null,
        transactionBase64: body.transaction,
        meta: {
          err: null,
          preBalances: zeroBalances,
          postBalances: zeroBalances,
          preTokenBalances: [],
          postTokenBalances: [],
          loadedAddresses: { writable, readonly },
        },
      },
      {
        messageHash: sha256Hex(decoded.message.serialized),
        recipientAddress: recipient,
        outputMint,
        inputMint: "So11111111111111111111111111111111111111112",
        routingKind: "dflow_sync",
        minimumOutputAtomic,
        maximumInputAtomic: 100_000_000n,
        reservedSponsorLamports: 3_000_000n,
        payerAddress: dflowFixture.keys.user,
        sponsorAddress: dflowFixture.keys.sponsor,
        resolvedAltWritableAddresses: writable,
        resolvedAltReadonlyAddresses: readonly,
      },
    );
    // The parser has accepted and indexed the resolved ALTs; this fixture's
    // order transaction does not itself carry the recipient ATA balance delta,
    // so the next independent predicate is the expected failure.
    expect(parsed).toMatchObject({
      success: false,
      failureCode: CONFIRMATION_FAILURE.RECIPIENT_ACCOUNT,
    });
  });

  it("confirms a routed non-native settlement with exact resolved ALT keys and actual deltas", () => {
    const inputMint = actors.attacker.publicKey.toBase58();
    const payerInputAta = deriveRecipientUsdcAta(PAYER, inputMint);
    const recipientOutputAta = deriveRecipientUsdcAta(RECIPIENT, USDC_MINT);
    const lookupKey = makeActors(88).attacker.publicKey;
    const lookup = new AddressLookupTableAccount({
      key: lookupKey,
      state: {
        deactivationSlot: 0xffffffffffffffffn,
        lastExtendedSlot: 1,
        lastExtendedSlotStartIndex: 0,
        authority: undefined,
        addresses: [new PublicKey(payerInputAta), new PublicKey(recipientOutputAta)],
      },
    });
    const routedIx = new TransactionInstruction({
      programId: new PublicKey(TOKEN_PROGRAM_ID),
      keys: [
        { pubkey: new PublicKey(payerInputAta), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(recipientOutputAta), isSigner: false, isWritable: true },
        { pubkey: actors.payer.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from([3, 1, 0, 0, 0, 0, 0, 0, 0]),
    });
    const message = new TransactionMessage({
      payerKey: actors.sponsor.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: [routedIx],
    }).compileToV0Message([lookup]);
    const tx = new VersionedTransaction(message);
    signAs(tx, actors.payer);
    signAs(tx, actors.sponsor);

    const transactionBase64 = toBase64(tx);
    const decoded = decodeTransactionBase64(transactionBase64);
    const writable = decoded.message.addressTableLookups.flatMap((entry) =>
      entry.writableIndexes.map((index) => lookup.state.addresses[index]!.toBase58()),
    );
    const readonly = decoded.message.addressTableLookups.flatMap((entry) =>
      entry.readonlyIndexes.map((index) => lookup.state.addresses[index]!.toBase58()),
    );
    const keys = [...decoded.message.staticAccountKeys, ...writable, ...readonly];
    const payerInputIndex = keys.indexOf(payerInputAta);
    const recipientOutputIndex = keys.indexOf(recipientOutputAta);
    expect(payerInputIndex).toBeGreaterThanOrEqual(0);
    expect(recipientOutputIndex).toBeGreaterThanOrEqual(0);

    const preBalances = keys.map(() => 1_000_000_000);
    const postBalances = [...preBalances];
    postBalances[0] = preBalances[0]! - 15_000;
    const recipientOutput = 1_100_000n;
    const payerInput = 875_000n;
    const signature = bs58.encode(decoded.signatures[0]!);
    const parsed = parseFinalizedConfirmation(
      signature,
      {
        slot: 44_001,
        blockTime: 1_777_777,
        transactionBase64,
        meta: {
          err: null,
          preBalances,
          postBalances,
          preTokenBalances: [
            tokenBalance(payerInputIndex, inputMint, PAYER, 2_000_000n),
            tokenBalance(recipientOutputIndex, USDC_MINT, RECIPIENT, 100_000n),
          ],
          postTokenBalances: [
            tokenBalance(payerInputIndex, inputMint, PAYER, 2_000_000n - payerInput),
            tokenBalance(recipientOutputIndex, USDC_MINT, RECIPIENT, 100_000n + recipientOutput),
          ],
          loadedAddresses: { writable, readonly },
        },
      },
      {
        messageHash: sha256Hex(decoded.message.serialized),
        recipientAddress: RECIPIENT,
        outputMint: USDC_MINT,
        inputMint,
        routingKind: "dflow_sync",
        minimumOutputAtomic: 1_000_000n,
        maximumInputAtomic: 900_000n,
        reservedSponsorLamports: 3_000_000n,
        payerAddress: PAYER,
        sponsorAddress: SPONSOR,
        resolvedAltWritableAddresses: writable,
        resolvedAltReadonlyAddresses: readonly,
      },
    );

    expect(parsed).toMatchObject({
      success: true,
      recipientDeltaAtomic: recipientOutput,
      payerDebitAtomic: payerInput,
      sponsorDebitLamports: 15_000n,
      slot: 44_001,
    });
  });

  it("refuses a recipient credit that is off by one atomic unit", () => {
    const signed = fullySigned();
    for (const delta of [AMOUNT - 1n, AMOUNT + 1n]) {
      const parsed = parseFinalizedConfirmation(
        signed.expectedSignature,
        finalizedResponse({ recipientDelta: delta, payerDelta: -delta }),
        expectation(signed.messageHash),
      );
      expect(parsed).toMatchObject({
        success: false,
        failureCode: CONFIRMATION_FAILURE.RECIPIENT_DELTA,
      });
    }
  });

  it("fails closed for native input until lamport attribution is implemented", () => {
    const signed = fullySigned();
    const parsed = parseFinalizedConfirmation(
      signed.expectedSignature,
      finalizedResponse(),
      {
        ...expectation(signed.messageHash),
        routingKind: "dflow_sync",
        inputMint: "So11111111111111111111111111111111111111112",
      },
    );
    expect(parsed).toMatchObject({
      success: false,
      failureCode: CONFIRMATION_FAILURE.NATIVE_INPUT_UNPROVEN,
    });
  });

  it("refuses a third account skimming the same mint — that is a platform fee", () => {
    const signed = fullySigned();
    const parsed = parseFinalizedConfirmation(
      signed.expectedSignature,
      finalizedResponse({
        payerDelta: -(AMOUNT + 1_000n),
        extraTokenAccount: { index: 1, pre: 0n, post: 1_000n },
      }),
      // Max input is raised so the skim is not caught by the debit cap first —
      // the point of this test is that the fee check catches it on its own.
      { ...expectation(signed.messageHash), maximumInputAtomic: AMOUNT + 1_000n },
    );
    expect(parsed).toMatchObject({
      success: false,
      failureCode: CONFIRMATION_FAILURE.PLATFORM_FEE_PRESENT,
    });
  });

  it("refuses a sponsor debit above the reservation it owns", () => {
    const signed = fullySigned();
    const parsed = parseFinalizedConfirmation(
      signed.expectedSignature,
      finalizedResponse({ sponsorDebit: 4_000_000n }),
      expectation(signed.messageHash),
    );
    expect(parsed).toMatchObject({
      success: false,
      failureCode: CONFIRMATION_FAILURE.SPONSOR_DEBIT,
    });
  });

  it("refuses a payer debit above the locked maximum input", () => {
    const signed = fullySigned();
    const parsed = parseFinalizedConfirmation(
      signed.expectedSignature,
      finalizedResponse(),
      { ...expectation(signed.messageHash), maximumInputAtomic: AMOUNT - 1n },
    );
    expect(parsed).toMatchObject({
      success: false,
      failureCode: CONFIRMATION_FAILURE.PAYER_DEBIT,
    });
  });

  it("refuses to verify without server-owned payer and sponsor addresses", () => {
    const signed = fullySigned();
    const parsed = parseFinalizedConfirmation(signed.expectedSignature, finalizedResponse(), {
      ...expectation(signed.messageHash),
      payerAddress: undefined,
      sponsorAddress: undefined,
    });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("blockhash expiry is enforced by the gate (AD-10)", () => {
  it("rejects a transaction whose lastValidBlockHeight has passed", () => {
    const signed = partialSigned();
    const context = validationContext(signed.messageHash);

    expect(validateBeforeSponsorCoSign(signed.base64, context).ok).toBe(true);

    const expired = validateBeforeSponsorCoSign(signed.base64, {
      ...context,
      currentBlockHeight: context.lastValidBlockHeight + 1,
    });
    expect(expired).toMatchObject({ ok: false, code: "BLOCKHASH_EXPIRED" });

    // Still inside the window is still fine.
    expect(
      validateBeforeSponsorCoSign(signed.base64, {
        ...context,
        currentBlockHeight: context.lastValidBlockHeight,
      }).ok,
    ).toBe(true);
  });
});
