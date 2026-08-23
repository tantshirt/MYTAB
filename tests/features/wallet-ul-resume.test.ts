import { describe, expect, it, beforeEach } from "vitest";
import { resumeUniversalLinkWallet } from "@/features/auth/walletUlHandoff";
import { writePendingUniversalLink } from "@/lib/wallet/universalLinks";

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
});
