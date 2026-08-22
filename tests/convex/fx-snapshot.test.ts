import { afterEach, describe, expect, it } from "vitest";
import {
  FX_DIRECTION,
  FX_PROVIDER_FRANKFURTER_BOT,
  FX_PROVIDER_MANUAL,
  FxErrorCode,
  FxUnavailableError,
  createManualFxSnapshot,
  findLatestFxSnapshot,
  fxFieldsFromSnapshot,
  loadFxSnapshotForTabViewer,
  recordBotFxSnapshot,
  requireLockableFxSnapshot,
  resolveFxSnapshotIdForTab,
  usdcAtomicFromSnapshot,
} from "@/convex/lib/fxSnapshotSync";
import {
  FRANKFURTER_BOT_USD_THB_URL,
  FxProviderErrorCode,
  fetchBotUsdThbQuote,
  parseFrankfurterBotBody,
} from "@/convex/internal/fx";
import { FX_FRESHNESS_WEEKDAY_MS, providerDateToAsOfMs } from "@/lib/domain/fx";
import { FIXTURE_MODE_NOT_PERMITTED } from "@/lib/solana/runtimeGuard";

// ---------------------------------------------------------------------------
// A tiny in-memory stand-in for the Convex db surface these helpers touch.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { _id: string };

function createFakeDb() {
  const tables = new Map<string, Row[]>();
  let sequence = 0;

  function rowsFor(table: string): Row[] {
    let rows = tables.get(table);
    if (!rows) {
      rows = [];
      tables.set(table, rows);
    }
    return rows;
  }

  const db = {
    patchCalls: 0,
    async insert(table: string, doc: Record<string, unknown>) {
      sequence += 1;
      const _id = `${table}:${sequence}`;
      rowsFor(table).push({ ...doc, _id });
      return _id;
    },
    async get(id: string) {
      const table = id.split(":")[0];
      return rowsFor(table).find((row) => row._id === id) ?? null;
    },
    async patch() {
      db.patchCalls += 1;
    },
    query(table: string) {
      let filtered = [...rowsFor(table)];
      let descending = false;
      const api = {
        withIndex(_name: string, builder: (q: IndexQuery) => IndexQuery) {
          const constraints: Array<[string, unknown]> = [];
          builder({
            eq(field: string, value: unknown) {
              constraints.push([field, value]);
              return this;
            },
          } as IndexQuery);
          filtered = filtered.filter((row) =>
            constraints.every(([field, value]) => row[field] === value),
          );
          return api;
        },
        order(direction: "asc" | "desc") {
          descending = direction === "desc";
          return api;
        },
        async first() {
          const sorted = [...filtered].sort((a, b) => {
            const asOfA = Number(a.providerAsOf ?? 0);
            const asOfB = Number(b.providerAsOf ?? 0);
            return descending ? asOfB - asOfA : asOfA - asOfB;
          });
          return sorted[0] ?? null;
        },
        async collect() {
          return filtered;
        },
      };
      return api;
    },
    _rows: rowsFor,
  };

  return db;
}

type IndexQuery = { eq(field: string, value: unknown): IndexQuery };

function ctxOf(db: ReturnType<typeof createFakeDb>) {
  return { db } as never;
}

// ---------------------------------------------------------------------------
// Environment helpers — the fail-closed tests need a "real deployment".
// ---------------------------------------------------------------------------

const savedEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, savedEnv);
});

function simulateProductionDeployment(): void {
  process.env.CONVEX_DEPLOYMENT = "prod:mytab-prod";
  process.env.ENVIRONMENT = "production";
}

function simulateDeployedDevnet(): void {
  // A named cloud dev deployment: not production, but still a real deployment.
  delete process.env.ENVIRONMENT;
  delete process.env.VERCEL_ENV;
  process.env.CONVEX_DEPLOYMENT = "dev:mytab-devnet";
  process.env.CONVEX_CLOUD_URL = "https://mytab-devnet.convex.cloud";
}

// ---------------------------------------------------------------------------

describe("Frankfurter Bank of Thailand parsing", () => {
  it("pins the request to the BOT provider and the USD/THB pair", () => {
    expect(FRANKFURTER_BOT_USD_THB_URL).toBe(
      "https://api.frankfurter.dev/v2/rates?base=USD&quotes=THB&providers=BOT",
    );
  });

  it("extracts the rate as text, never as a number", () => {
    const body = '[{"date":"2026-08-21","base":"USD","quote":"THB","rate":32.8152}]';
    expect(parseFrankfurterBotBody(body)).toEqual({
      providerDate: "2026-08-21",
      rateText: "32.8152",
    });
  });

  it("preserves digits a double would round away", () => {
    const body = '[{"date":"2026-08-21","base":"USD","quote":"THB","rate":32.123456789012}]';
    const quote = parseFrankfurterBotBody(body);
    expect(quote.rateText).toBe("32.123456789012");
    // Proof the string form is not a JSON.parse round-trip:
    expect(String(JSON.parse(body)[0].rate)).not.toBe("32.1234567890123");
  });

  it("fails closed when the provider filter yields nothing", () => {
    expect(() => parseFrankfurterBotBody("[]")).toThrowError(
      expect.objectContaining({ code: FxProviderErrorCode.EMPTY_SERIES }),
    );
  });

  it("refuses an ambiguous multi-row series rather than picking one", () => {
    const body =
      '[{"date":"2026-08-21","base":"USD","quote":"THB","rate":32.8152},' +
      '{"date":"2026-08-20","base":"USD","quote":"THB","rate":32.7450}]';
    expect(() => parseFrankfurterBotBody(body)).toThrowError(
      expect.objectContaining({ code: FxProviderErrorCode.AMBIGUOUS_SERIES }),
    );
  });

  it("refuses a pair other than USD/THB", () => {
    const body = '[{"date":"2026-08-21","base":"USD","quote":"JPY","rate":147.2}]';
    expect(() => parseFrankfurterBotBody(body)).toThrowError(
      expect.objectContaining({ code: FxProviderErrorCode.UNEXPECTED_PAIR }),
    );
  });

  it("refuses a body with no date or no rate", () => {
    expect(() => parseFrankfurterBotBody('{"error":"boom"}')).toThrowError(
      expect.objectContaining({ code: FxProviderErrorCode.UNPARSEABLE }),
    );
    expect(() =>
      parseFrankfurterBotBody('[{"base":"USD","quote":"THB","rate":32.5}]'),
    ).toThrowError(expect.objectContaining({ code: FxProviderErrorCode.UNPARSEABLE }));
  });

  it("surfaces a non-200 and an unreachable provider as named errors", async () => {
    await expect(
      fetchBotUsdThbQuote(async () => new Response("nope", { status: 502 })),
    ).rejects.toMatchObject({ code: FxProviderErrorCode.BAD_STATUS });

    await expect(
      fetchBotUsdThbQuote(async () => {
        throw new Error("ECONNRESET");
      }),
    ).rejects.toMatchObject({ code: FxProviderErrorCode.UNREACHABLE });
  });

  it("round-trips a live-shaped body into a fetched quote", async () => {
    const quote = await fetchBotUsdThbQuote(
      async () =>
        new Response('[{"date":"2026-08-21","base":"USD","quote":"THB","rate":32.8152}]', {
          status: 200,
        }),
    );
    expect(quote).toEqual({ providerDate: "2026-08-21", rateText: "32.8152" });
  });
});

describe("snapshot persistence", () => {
  it("stores the BOT rational in the USDC_ATOMIC_PER_THB_MINOR direction", async () => {
    const db = createFakeDb();
    const now = Date.UTC(2026, 7, 24, 6);

    const { fxSnapshotId, created } = await recordBotFxSnapshot(
      ctxOf(db),
      { providerDate: "2026-08-24", rateText: "32.8152" },
      now,
    );

    expect(created).toBe(true);
    const row = await db.get(fxSnapshotId as unknown as string);
    expect(row).toMatchObject({
      baseCurrency: "THB",
      quoteMint: "USDC",
      direction: FX_DIRECTION,
      provider: FX_PROVIDER_FRANKFURTER_BOT,
      numeratorAtomic: 12_500_000n,
      denominatorMinor: 41_019n,
      isFixture: false,
      providerAsOf: providerDateToAsOfMs("2026-08-24"),
      expiresAt: providerDateToAsOfMs("2026-08-24") + FX_FRESHNESS_WEEKDAY_MS,
    });
  });

  it("is append-only: re-recording the same provider date never patches", async () => {
    const db = createFakeDb();
    const now = Date.UTC(2026, 7, 24, 6);
    const quote = { providerDate: "2026-08-24", rateText: "32.8152" };

    const first = await recordBotFxSnapshot(ctxOf(db), quote, now);
    const second = await recordBotFxSnapshot(
      ctxOf(db),
      { ...quote, rateText: "33.5000" },
      now + 1000,
    );

    expect(second.created).toBe(false);
    expect(second.fxSnapshotId).toBe(first.fxSnapshotId);
    expect(db.patchCalls).toBe(0);
    // A bill locked against the original rational still sees the original.
    expect(await db.get(first.fxSnapshotId as unknown as string)).toMatchObject({
      numeratorAtomic: 12_500_000n,
      denominatorMinor: 41_019n,
    });
  });

  it("returns the newest provider date from findLatestFxSnapshot", async () => {
    const db = createFakeDb();
    await recordBotFxSnapshot(ctxOf(db), { providerDate: "2026-08-20", rateText: "32.10" }, 0);
    const newest = await recordBotFxSnapshot(
      ctxOf(db),
      { providerDate: "2026-08-24", rateText: "32.80" },
      0,
    );

    const latest = await findLatestFxSnapshot(ctxOf(db));
    expect(latest?._id).toBe(newest.fxSnapshotId);
  });
});

describe("tab snapshot resolution", () => {
  const providerDate = "2026-08-24"; // Monday
  const asOf = providerDateToAsOfMs(providerDate);

  async function seedBotSnapshot(db: ReturnType<typeof createFakeDb>) {
    return recordBotFxSnapshot(ctxOf(db), { providerDate, rateText: "32.8152" }, asOf);
  }

  it("uses the BOT snapshot while it is inside the 36h window", async () => {
    const db = createFakeDb();
    const seeded = await seedBotSnapshot(db);

    const resolved = await resolveFxSnapshotIdForTab(
      ctxOf(db),
      asOf + FX_FRESHNESS_WEEKDAY_MS - 1,
    );
    expect(resolved).toBe(seeded.fxSnapshotId);
  });

  it("falls back to the badged manual snapshot once stale, outside production", async () => {
    const db = createFakeDb();
    const seeded = await seedBotSnapshot(db);

    const resolved = await resolveFxSnapshotIdForTab(ctxOf(db), asOf + FX_FRESHNESS_WEEKDAY_MS);
    expect(resolved).not.toBe(seeded.fxSnapshotId);

    const row = await db.get(resolved as unknown as string);
    expect(row).toMatchObject({ provider: FX_PROVIDER_MANUAL, isFixture: true });
  });

  it("fails closed in production when the only snapshot is stale", async () => {
    const db = createFakeDb();
    await seedBotSnapshot(db);
    simulateProductionDeployment();

    const error = await resolveFxSnapshotIdForTab(
      ctxOf(db),
      asOf + FX_FRESHNESS_WEEKDAY_MS,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FxUnavailableError);
    expect(error).toMatchObject({ code: FxErrorCode.STALE_SNAPSHOT });
    // No manual snapshot was written on the way out.
    expect(db._rows("fxSnapshots").filter((row) => row.isFixture)).toHaveLength(0);
  });

  it("fails closed in production when no snapshot exists at all", async () => {
    const db = createFakeDb();
    simulateProductionDeployment();

    const error = await resolveFxSnapshotIdForTab(ctxOf(db), asOf).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(FxUnavailableError);
    expect(error).toMatchObject({ code: "FX_SNAPSHOT_UNAVAILABLE" });
    expect(db._rows("fxSnapshots")).toHaveLength(0);
  });

  it("fails closed on a deployed devnet too, not just production", async () => {
    const db = createFakeDb();
    simulateDeployedDevnet();

    await expect(resolveFxSnapshotIdForTab(ctxOf(db), asOf)).rejects.toBeInstanceOf(
      FxUnavailableError,
    );
    expect(db._rows("fxSnapshots")).toHaveLength(0);
  });

  it("refuses to create a manual snapshot on any real deployment", async () => {
    const db = createFakeDb();
    simulateProductionDeployment();

    await expect(createManualFxSnapshot(ctxOf(db), Date.now())).rejects.toMatchObject({
      code: FIXTURE_MODE_NOT_PERMITTED,
    });
  });
});

describe("lock-time FX", () => {
  const providerDate = "2026-08-24";
  const asOf = providerDateToAsOfMs(providerDate);

  it("freezes the tab's rational onto the lock snapshot", async () => {
    const db = createFakeDb();
    const { fxSnapshotId } = await recordBotFxSnapshot(
      ctxOf(db),
      { providerDate, rateText: "32.8152" },
      asOf,
    );

    const snapshot = await requireLockableFxSnapshot(ctxOf(db), fxSnapshotId, asOf + 1000);
    expect(fxFieldsFromSnapshot(snapshot)).toEqual({
      fxNumeratorAtomic: 12_500_000n,
      fxDenominatorMinor: 41_019n,
      fxProvider: FX_PROVIDER_FRANKFURTER_BOT,
      fxPolicyVersion: "frankfurter-bot-v1",
    });
  });

  it("refuses to lock a bill with no FX snapshot", async () => {
    const db = createFakeDb();
    await expect(
      requireLockableFxSnapshot(ctxOf(db), undefined, Date.now()),
    ).rejects.toMatchObject({ code: "FX_SNAPSHOT_UNAVAILABLE" });
  });

  it("refuses to lock against a snapshot that has gone stale", async () => {
    const db = createFakeDb();
    const { fxSnapshotId } = await recordBotFxSnapshot(
      ctxOf(db),
      { providerDate, rateText: "32.8152" },
      asOf,
    );

    await expect(
      requireLockableFxSnapshot(ctxOf(db), fxSnapshotId, asOf + FX_FRESHNESS_WEEKDAY_MS),
    ).rejects.toMatchObject({ code: FxErrorCode.STALE_SNAPSHOT });
  });

  it("prices the recipient upward from the snapshot's own rational", async () => {
    const db = createFakeDb();
    const { fxSnapshotId } = await recordBotFxSnapshot(
      ctxOf(db),
      { providerDate, rateText: "32.8152" },
      asOf,
    );
    const snapshot = await requireLockableFxSnapshot(ctxOf(db), fxSnapshotId, asOf);

    // 291.74 THB -> 29174 minor.
    // 29174 * 12_500_000 / 41_019 = 8_890_392.75... so the target rounds to 8_890_393
    // (291.74 / 32.8152 = 8.890393 USD).
    const atomic = usdcAtomicFromSnapshot(snapshot, 29_174);
    expect(atomic).toBe(8_890_393n);
    // At or above par, and by less than one atomic unit.
    expect(atomic * 41_019n >= 29_174n * 12_500_000n).toBe(true);
    expect((atomic - 1n) * 41_019n < 29_174n * 12_500_000n).toBe(true);

    // and it is *not* the old hardcoded fixture answer of 32 THB/USD
    expect(atomic).not.toBe((29_174n * 625n + 1n) / 2n);
  });
});

// ---------------------------------------------------------------------------
// Authorization: getFxSnapshot previously had no check at all.
// ---------------------------------------------------------------------------

type AuthRow = Record<string, unknown> & { _id: string };

function createAuthWorld() {
  const tables: Record<string, AuthRow[]> = {
    users: [],
    groups: [],
    groupMembers: [],
    tabs: [],
    fxSnapshots: [],
  };
  let sequence = 0;

  function insert(table: string, doc: Record<string, unknown>): string {
    sequence += 1;
    const _id = `${table}:${sequence}`;
    tables[table].push({ ...doc, _id });
    return _id;
  }

  function makeCtx(privyDid: string | null) {
    return {
      auth: {
        getUserIdentity: async () => (privyDid ? { subject: privyDid } : null),
      },
      db: {
        async get(id: string) {
          const table = id.split(":")[0];
          return tables[table]?.find((row) => row._id === id) ?? null;
        },
        query(table: string) {
          let rows = [...(tables[table] ?? [])];
          const api = {
            withIndex(_name: string, builder?: (q: unknown) => unknown) {
              const constraints: Array<[string, unknown]> = [];
              if (builder) {
                const q = {
                  eq(field: string, value: unknown) {
                    constraints.push([field, value]);
                    return q;
                  },
                };
                builder(q);
              }
              rows = rows.filter((row) =>
                constraints.every(([field, value]) => row[field] === value),
              );
              return api;
            },
            async unique() {
              return rows[0] ?? null;
            },
            async collect() {
              return rows;
            },
            async first() {
              return rows[0] ?? null;
            },
          };
          return api;
        },
      },
    } as never;
  }

  return { tables, insert, makeCtx };
}

describe("getFxSnapshot authorization", () => {
  function seed() {
    const world = createAuthWorld();

    const groupId = world.insert("groups", { displayName: "Trip" });
    const otherGroupId = world.insert("groups", { displayName: "Other" });

    world.insert("users", { privyDid: "did:privy:member", telegramUserId: "tg-member" });
    world.insert("users", { privyDid: "did:privy:outsider", telegramUserId: "tg-outsider" });
    world.insert("groupMembers", {
      groupId,
      telegramUserId: "tg-member",
      membershipStatus: "active",
    });
    world.insert("groupMembers", {
      groupId: otherGroupId,
      telegramUserId: "tg-outsider",
      membershipStatus: "active",
    });

    const fxSnapshotId = world.insert("fxSnapshots", {
      provider: FX_PROVIDER_FRANKFURTER_BOT,
      numeratorAtomic: 12_500_000n,
      denominatorMinor: 41_019n,
      direction: FX_DIRECTION,
      expiresAt: Number.MAX_SAFE_INTEGER,
    });
    const unrelatedSnapshotId = world.insert("fxSnapshots", {
      provider: FX_PROVIDER_FRANKFURTER_BOT,
      numeratorAtomic: 1n,
      denominatorMinor: 1n,
      direction: FX_DIRECTION,
      expiresAt: Number.MAX_SAFE_INTEGER,
    });

    const tabId = world.insert("tabs", { groupId, fxSnapshotId });
    const otherTabId = world.insert("tabs", { groupId: otherGroupId });

    return { world, tabId, otherTabId, fxSnapshotId, unrelatedSnapshotId };
  }

  it("returns the snapshot to a member of the tab's group", async () => {
    const { world, tabId, fxSnapshotId } = seed();
    const snapshot = await loadFxSnapshotForTabViewer(
      world.makeCtx("did:privy:member"),
      tabId as never,
      fxSnapshotId as never,
    );
    expect(snapshot).toMatchObject({ numeratorAtomic: 12_500_000n });
  });

  it("refuses an authenticated caller who is not in the tab's group", async () => {
    const { world, tabId, fxSnapshotId } = seed();
    await expect(
      loadFxSnapshotForTabViewer(
        world.makeCtx("did:privy:outsider"),
        tabId as never,
        fxSnapshotId as never,
      ),
    ).rejects.toMatchObject({ code: "NOT_GROUP_MEMBER" });
  });

  it("refuses an unauthenticated caller", async () => {
    const { world, tabId, fxSnapshotId } = seed();
    await expect(
      loadFxSnapshotForTabViewer(world.makeCtx(null), tabId as never, fxSnapshotId as never),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("a snapshot id alone grants nothing — it must belong to the named tab", async () => {
    const { world, tabId, unrelatedSnapshotId } = seed();
    await expect(
      loadFxSnapshotForTabViewer(
        world.makeCtx("did:privy:member"),
        tabId as never,
        unrelatedSnapshotId as never,
      ),
    ).rejects.toMatchObject({ code: "FX_SNAPSHOT_NOT_FOR_TAB" });
  });

  it("cannot be used to read a snapshot through a tab the caller does not belong to", async () => {
    const { world, otherTabId, fxSnapshotId } = seed();
    await expect(
      loadFxSnapshotForTabViewer(
        world.makeCtx("did:privy:member"),
        otherTabId as never,
        fxSnapshotId as never,
      ),
    ).rejects.toMatchObject({ code: "NOT_GROUP_MEMBER" });
  });

  it("rejects an unknown tab", async () => {
    const { world, fxSnapshotId } = seed();
    await expect(
      loadFxSnapshotForTabViewer(
        world.makeCtx("did:privy:member"),
        "tabs:999" as never,
        fxSnapshotId as never,
      ),
    ).rejects.toMatchObject({ code: "TAB_NOT_FOUND" });
  });
});
