import { describe, expect, it } from "vitest";
import {
  AuthError,
  TELEGRAM_CONTEXT_REQUIRED,
  UNAUTHORIZED,
  getCurrentUser,
  requireIdentity,
  requireTelegramContext,
} from "../../convex/lib/auth";

type MockIdentity = {
  tokenIdentifier: string;
  subject: string;
  issuer: string;
};

function createMockCtx(options: {
  identity?: MockIdentity | null;
  user?: Record<string, unknown> | null;
  telegramContext?: Record<string, unknown> | null;
  now?: number;
}) {
  const identity = options.identity ?? null;
  const user = options.user ?? null;
  const telegramContext = options.telegramContext ?? null;
  const now = options.now ?? Date.now();

  return {
    auth: {
      getUserIdentity: async () => identity,
    },
    db: {
      query: (table: string) => ({
        withIndex: (_index: string, builder: (q: { eq: (field: string, value: string) => unknown }) => unknown) => {
          const filter = builder({
            eq: (_field: string, value: string) => ({ privyDid: value, initDataHash: value }),
          }) as { privyDid?: string; initDataHash?: string };

          const doc =
            table === "users"
              ? user && filter.privyDid === user.privyDid
                ? user
                : null
              : table === "telegramContexts"
                ? telegramContext && filter.privyDid === telegramContext.privyDid
                  ? telegramContext
                  : null
                : null;

          return {
            unique: async () => doc,
          };
        },
      }),
    },
    _now: now,
  };
}

describe("Story 1.7 — auth helpers (AC3, AC6)", () => {
  it("requireIdentity throws UNAUTHORIZED when unauthenticated", async () => {
    const ctx = createMockCtx({ identity: null });
    await expect(requireIdentity(ctx)).rejects.toMatchObject({
      code: UNAUTHORIZED,
    });
  });

  it("requireIdentity returns identity when authenticated", async () => {
    const identity = {
      tokenIdentifier: "privy.io|did:privy:test",
      subject: "did:privy:test",
      issuer: "privy.io",
    };
    const ctx = createMockCtx({ identity });
    await expect(requireIdentity(ctx)).resolves.toBe(identity);
  });

  it("getCurrentUser reads by privy DID index", async () => {
    const user = {
      _id: "users:1",
      privyDid: "did:privy:test",
      telegramUserId: "42",
      displayName: "Ada",
    };
    const ctx = createMockCtx({
      identity: {
        tokenIdentifier: "privy.io|did:privy:test",
        subject: "did:privy:test",
        issuer: "privy.io",
      },
      user,
    });

    await expect(getCurrentUser(ctx)).resolves.toEqual(user);
  });

  it("getCurrentUser returns null without identity", async () => {
    const ctx = createMockCtx({ identity: null });
    await expect(getCurrentUser(ctx)).resolves.toBeNull();
  });

  it("requireTelegramContext throws TELEGRAM_CONTEXT_REQUIRED when missing", async () => {
    const ctx = createMockCtx({
      identity: {
        tokenIdentifier: "privy.io|did:privy:test",
        subject: "did:privy:test",
        issuer: "privy.io",
      },
      telegramContext: null,
    });

    await expect(requireTelegramContext(ctx)).rejects.toMatchObject({
      code: TELEGRAM_CONTEXT_REQUIRED,
    });
  });

  it("requireTelegramContext throws when context is expired", async () => {
    const ctx = createMockCtx({
      identity: {
        tokenIdentifier: "privy.io|did:privy:test",
        subject: "did:privy:test",
        issuer: "privy.io",
      },
      telegramContext: {
        privyDid: "did:privy:test",
        expiresAt: Date.now() - 1,
      },
    });

    await expect(requireTelegramContext(ctx)).rejects.toBeInstanceOf(AuthError);
  });

  it("requireTelegramContext returns active context", async () => {
    const telegramContext = {
      privyDid: "did:privy:test",
      telegramUserId: "42",
      chatId: "-1001",
      groupId: "-1001",
      initDataHash: "abc",
      expiresAt: Date.now() + 60_000,
    };
    const ctx = createMockCtx({
      identity: {
        tokenIdentifier: "privy.io|did:privy:test",
        subject: "did:privy:test",
        issuer: "privy.io",
      },
      telegramContext,
    });

    await expect(requireTelegramContext(ctx)).resolves.toEqual(telegramContext);
  });
});
