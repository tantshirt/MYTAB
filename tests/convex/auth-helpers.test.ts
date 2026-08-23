import { describe, expect, it } from "vitest";
import {
  AuthError,
  TELEGRAM_CONTEXT_REQUIRED,
  UNAUTHORIZED,
  getCurrentUser,
  renewTelegramContextCore,
  requireIdentity,
  requireTelegramContext,
} from "../../convex/lib/auth";
import {
  TELEGRAM_CONTEXT_TTL_MS,
  TELEGRAM_SESSION_MAX_MS,
} from "../../lib/telegram/verify";
import { fakeQueryCtx } from "../helpers/convexFakeDb";

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

  return fakeQueryCtx({
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
  });
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

/*
 * Renewal exists because `initData` cannot be refreshed.
 *
 * Its `auth_date` is fixed for the life of a Mini App launch, so re-presenting
 * it to keep a session alive works only until it crosses
 * TELEGRAM_INIT_DATA_MAX_AGE_MS — after which every attempt fails for the same
 * reason, forever. Production logged eleven consecutive EXPIRED_AUTH_DATE
 * rejections and then a dead session: reads fine, every write refused, no way
 * back short of relaunching the app.
 *
 * So renewal carries a binding that already happened. What keeps that honest is
 * the ceiling, which is what these assert.
 */
describe("renewing a bound Telegram session", () => {
  const identity = {
    tokenIdentifier: "privy.io|did:privy:test",
    subject: "did:privy:test",
    issuer: "privy.io",
  };

  function ctxWithContext(context: Record<string, unknown> | null, now: number) {
    const patched: Array<Record<string, unknown>> = [];
    const base = createMockCtx({ identity, telegramContext: context, now });
    return {
      ctx: {
        ...base,
        db: {
          ...(base.db as object),
          patch: async (_id: string, changes: Record<string, unknown>) => {
            patched.push(changes);
          },
        },
      } as never,
      patched,
    };
  }

  it("extends a live session by a fresh TTL without any initData", async () => {
    const now = 1_000_000_000;
    const { ctx, patched } = ctxWithContext(
      {
        _id: "ctx1",
        _creationTime: now - 60_000,
        privyDid: identity.subject,
        boundAt: now - 60_000,
        expiresAt: now - 1,
      },
      now,
    );

    // Already lapsed, and still renewable — that is the point. A lapsed context
    // used to be unrecoverable for the rest of the launch.
    await expect(renewTelegramContextCore(ctx, now)).resolves.toEqual({
      expiresAt: now + TELEGRAM_CONTEXT_TTL_MS,
    });
    expect(patched).toEqual([{ expiresAt: now + TELEGRAM_CONTEXT_TTL_MS }]);
  });

  it("refuses once the binding is older than the ceiling", async () => {
    const now = 1_000_000_000;
    const { ctx, patched } = ctxWithContext(
      {
        _id: "ctx1",
        _creationTime: now - TELEGRAM_SESSION_MAX_MS - 1,
        privyDid: identity.subject,
        boundAt: now - TELEGRAM_SESSION_MAX_MS - 1,
        expiresAt: now + 60_000,
      },
      now,
    );

    await expect(renewTelegramContextCore(ctx, now)).rejects.toMatchObject({
      code: TELEGRAM_CONTEXT_REQUIRED,
    });
    expect(patched).toEqual([]);
  });

  /*
   * The ceiling is measured from the bind, not from `expiresAt`. Measuring it
   * from the expiry would let every renewal push its own limit forward, so a
   * session renewed every few minutes would never end.
   */
  it("measures the ceiling from the bind, so renewing cannot raise it", async () => {
    const now = 1_000_000_000;
    const { ctx } = ctxWithContext(
      {
        _id: "ctx1",
        _creationTime: now - TELEGRAM_SESSION_MAX_MS - 1,
        privyDid: identity.subject,
        boundAt: now - TELEGRAM_SESSION_MAX_MS - 1,
        // Renewed moments ago — recent expiry must not buy more time.
        expiresAt: now + TELEGRAM_CONTEXT_TTL_MS,
      },
      now,
    );

    await expect(renewTelegramContextCore(ctx, now)).rejects.toMatchObject({
      code: TELEGRAM_CONTEXT_REQUIRED,
    });
  });

  it("falls back to _creationTime for rows bound before boundAt existed", async () => {
    const now = 1_000_000_000;
    const { ctx, patched } = ctxWithContext(
      {
        _id: "ctx1",
        _creationTime: now - 60_000,
        privyDid: identity.subject,
        expiresAt: now - 1,
      },
      now,
    );

    await expect(renewTelegramContextCore(ctx, now)).resolves.toBeTruthy();
    expect(patched).toHaveLength(1);
  });

  it("refuses when nothing is bound — bootstrap has to run first", async () => {
    const now = 1_000_000_000;
    const { ctx } = ctxWithContext(null, now);
    await expect(renewTelegramContextCore(ctx, now)).rejects.toMatchObject({
      code: TELEGRAM_CONTEXT_REQUIRED,
    });
  });
});
