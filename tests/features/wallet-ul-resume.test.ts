import { describe, expect, it, beforeEach } from "vitest";
import { shouldStartWalletUlResume } from "@/features/auth/walletUlResumeStatus";
import { resumeUniversalLinkWallet } from "@/features/auth/walletUlHandoff";
import {
  readUniversalLinkSecret,
  writePendingUniversalLink,
  writeUniversalLinkSecret,
} from "@/lib/wallet/universalLinks";
import { encodeKeyBase58, generateX25519Keypair } from "@/lib/wallet/deeplinkBox";

function installMemoryStorage() {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() {
      return memory.size;
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
}

describe("universal-link resume", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("fails closed when the WebView secret is gone", async () => {
    writePendingUniversalLink({
      provider: "phantom",
      step: "connect",
      challengeId: "k57abcde0123",
      messagePrefix: "x",
      userId: "users:1",
      nonce: "n",
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      dappPublicKey: "pk",
    });

    const result = await resumeUniversalLinkWallet({
      challengeId: "k57abcde0123" as never,
      deps: {
        queryCallback: async () => ({
          status: "ready",
          data: "d",
          nonce: "n",
          encryptionPublicKey: "pk",
        }),
        consumeCallback: async () => undefined,
        submitSigned: async () => undefined,
        openUrl: () => undefined,
      },
    });

    expect(result).toBe("failed");
  });

  it("hydrates the secret from Convex when localStorage is empty", async () => {
    const result = await resumeUniversalLinkWallet({
      challengeId: "k57abcde0123" as never,
      deps: {
        queryCallback: async () => ({
          status: "pending",
          ulSecret: "server-secret",
          ulPending: JSON.stringify({
            provider: "phantom",
            step: "connect",
            challengeId: "other-challenge",
            messagePrefix: "x",
            userId: "users:1",
            nonce: "n",
            expiresAt: Date.now() + 60_000,
            issuedAt: Date.now(),
            dappPublicKey: "pk",
          }),
        }),
        consumeCallback: async () => undefined,
        submitSigned: async () => undefined,
        openUrl: () => undefined,
      },
    });

    expect(result).toBe("idle");
    expect(readUniversalLinkSecret()).toBe("server-secret");
  });

  it("retries only after Privy is ready and authenticated", () => {
    expect(
      shouldStartWalletUlResume({
        started: false,
        ready: false,
        authenticated: false,
        challengeId: "k57abcde0123",
      }),
    ).toBe(false);
    expect(
      shouldStartWalletUlResume({
        started: false,
        ready: true,
        authenticated: false,
        challengeId: "k57abcde0123",
      }),
    ).toBe(false);
    expect(
      shouldStartWalletUlResume({
        started: true,
        ready: true,
        authenticated: true,
        challengeId: "k57abcde0123",
      }),
    ).toBe(false);
    expect(
      shouldStartWalletUlResume({
        started: false,
        ready: true,
        authenticated: true,
        challengeId: "k57abcde0123",
      }),
    ).toBe(true);
  });
});

/*
 * The connect leg lands, and then nothing asks for the signature.
 *
 * Telegram reopens the Mini App in a FRESH WebView on `startapp=ulcb_*`, so the
 * instance that opened the signMessage link — and the promise awaiting it — is
 * gone. Resuming into `step: "sign"` used to fall straight through to
 * `waitForUniversalLinkCallback`, which waits two minutes for a callback that
 * only exists if somebody is looking at a wallet prompt. Nobody was: this
 * instance never opened one. Observed on a physical iPhone as an approved
 * Phantom connect followed by "Waiting for your wallet…" until it timed out.
 */
describe("universal-link resume — the sign step re-asks instead of waiting", () => {
  beforeEach(() => {
    installMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      value: { location: { origin: "https://mytab.example" } },
      configurable: true,
    });
  });

  function pendingAtSignStep() {
    const dapp = generateX25519Keypair();
    const wallet = generateX25519Keypair();
    writeUniversalLinkSecret(encodeKeyBase58(dapp.secretKey));
    writePendingUniversalLink({
      provider: "phantom",
      step: "sign",
      challengeId: "k57abcde0123",
      messagePrefix: "mytab:link-wallet",
      userId: "users:1",
      nonce: "nonce-1",
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      dappPublicKey: encodeKeyBase58(dapp.publicKey),
      session: "session-1",
      publicKey: "7RzMXy1WRE8xEUCVLTJeH1TdquRJwJYESJ7882igZhwC",
      // Carried in the pending record precisely so a cold resume can rebuild
      // the link without the web storage the dead WebView took with it.
      walletEncryptionPublicKey: encodeKeyBase58(wallet.publicKey),
    });
  }

  it("opens the wallet again when no signature has been recorded", async () => {
    pendingAtSignStep();
    const opened: string[] = [];

    const resume = resumeUniversalLinkWallet({
      deps: {
        queryCallback: async () => null,
        consumeCallback: async () => undefined,
        submitSigned: async () => undefined,
        openUrl: (url) => opened.push(url),
      },
      challengeId: "k57abcde0123" as never,
    });

    // Let the re-open run; the wait that follows is not what is under test.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("https://phantom.app/ul/v1/signMessage");
    expect(opened[0]).toContain("redirect_link=");

    void resume.catch(() => undefined);
  });

  it("does not re-open when the wallet already answered", async () => {
    pendingAtSignStep();
    const opened: string[] = [];

    void resumeUniversalLinkWallet({
      deps: {
        // A recorded error still counts as an answer: the wallet was asked.
        queryCallback: async () => ({ status: "error", errorCode: "rejected" }),
        consumeCallback: async () => undefined,
        submitSigned: async () => undefined,
        openUrl: (url) => opened.push(url),
      },
      challengeId: "k57abcde0123" as never,
    }).catch(() => undefined);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(opened).toEqual([]);
  });
});
