/**
 * A minimal in-memory stand-in for Convex's `ctx.db`.
 *
 * The repo has no `convex-test` harness, so query and mutation handlers are
 * exercised against this the same way `tests/convex/obligation-settlement.test.ts`
 * exercises the settlement core — with the fake shaped after the real API rather
 * than after each call site.
 *
 * It deliberately requires `withIndex` for every read: a handler that reaches
 * for a full table scan has no `withIndex` call and fails loudly here, which is
 * the point.
 */

import type { Id, TableNames } from "../../convex/_generated/dataModel";
import type { QueryCtx } from "../../convex/_generated/server";

export type Row = Record<string, unknown> & { _id: string };

type Store = Record<string, Row[]>;

export type FakeIdentity = { subject: string; tokenIdentifier: string } | null;

/** One recorded `ctx.scheduler.runAfter` call. */
export type ScheduledCall = {
  delayMs: number;
  reference: unknown;
  args: unknown;
};

export function createFakeCtx(store: Store, identity: FakeIdentity = null) {
  let nextId = 1000;
  const scheduled: ScheduledCall[] = [];

  const tableOf = (id: string): string => id.split(":")[0] ?? "";

  const get = async (id: string): Promise<Row | null> => {
    const rows = store[tableOf(id)] ?? [];
    return rows.find((row) => row._id === id) ?? null;
  };

  const query = (table: string) => ({
    withIndex: (
      _indexName: string,
      builder?: (q: {
        eq: (field: string, value: unknown) => unknown;
      }) => unknown,
    ) => {
      const filters: Array<[string, unknown]> = [];
      if (builder) {
        const chain = {
          eq: (field: string, value: unknown) => {
            filters.push([field, value]);
            return chain;
          },
        };
        builder(chain);
      }

      let rows = (store[table] ?? []).filter((row) =>
        filters.every(([field, value]) => row[field] === value),
      );

      const result = {
        order: (direction: "asc" | "desc") => {
          rows = direction === "desc" ? [...rows].reverse() : rows;
          return result;
        },
        take: async (limit: number) => rows.slice(0, limit),
        collect: async () => rows,
        first: async () => rows[0] ?? null,
        unique: async () => {
          if (rows.length > 1) {
            throw new Error(`NOT_UNIQUE: ${table}`);
          }
          return rows[0] ?? null;
        },
      };

      return result;
    },
  });

  const insert = async (table: string, doc: Record<string, unknown>) => {
    const id = `${table}:${nextId++}`;
    const row = { _id: id, _creationTime: nextId, ...doc } as Row;
    store[table] = [...(store[table] ?? []), row];
    return id;
  };

  const patch = async (id: string, changes: Record<string, unknown>) => {
    const table = tableOf(id);
    const rows = store[table] ?? [];
    const index = rows.findIndex((row) => row._id === id);
    if (index >= 0) {
      rows[index] = { ...rows[index]!, ...changes };
    }
  };

  // Recorded, never executed: a scheduled function is a promise about the
  // future, and a test that runs it inline is testing a different program.
  const scheduler = {
    runAfter: async (delayMs: number, reference: unknown, args: unknown) => {
      scheduled.push({ delayMs, reference, args });
      return `scheduled:${scheduled.length}`;
    },
    runAt: async (timestamp: number, reference: unknown, args: unknown) => {
      scheduled.push({ delayMs: timestamp, reference, args });
      return `scheduled:${scheduled.length}`;
    },
    cancel: async () => undefined,
  };

  return {
    store,
    scheduled,
    ctx: {
      auth: { getUserIdentity: async () => identity },
      db: { get, query, insert, patch },
      scheduler,
    } as never,
  };
}

/**
 * The ctx members no handler under test touches, supplied for real so a mock
 * can *satisfy* Convex's ctx type rather than be cast past it.
 *
 * Every one throws. If a code path ever starts scheduling work, reading
 * storage, or calling another Convex function, the test fails loudly here
 * instead of passing against a silent stub that returned `undefined`.
 */
function unimplementedCtxMembers(): Omit<QueryCtx, "auth" | "db"> {
  const notImplemented =
    (member: string) =>
    (): never => {
      throw new Error(`${member} is not implemented in this mock`);
    };

  return {
    storage: {
      getUrl: notImplemented("ctx.storage.getUrl"),
      getMetadata: notImplemented("ctx.storage.getMetadata"),
    },
    runQuery: notImplemented("ctx.runQuery"),
    meta: {
      getFunctionMetadata: notImplemented("ctx.meta.getFunctionMetadata"),
      getTransactionMetrics: notImplemented("ctx.meta.getTransactionMetrics"),
      getDeploymentMetadata: notImplemented("ctx.meta.getDeploymentMetadata"),
    },
  };
}

/**
 * Completes a hand-written fake into something typed as a Convex `QueryCtx`,
 * so read-side handlers can be called without a cast at each call site.
 *
 * `db` is the one member a fake cannot satisfy structurally: Convex's
 * `GenericDatabaseReader` is generic over the table name at every level of the
 * `QueryInitializer` chain, so the return type of `query(table)` depends on a
 * type parameter no concrete object can supply. The single unavoidable cast for
 * that lives here, once, rather than at every call site — and the intersection
 * with `T` keeps the fake's own shape visible to the test.
 */
export function fakeQueryCtx<T extends { auth: unknown; db: unknown }>(
  fake: T,
): QueryCtx & T {
  return { ...unimplementedCtxMembers(), ...fake } as unknown as QueryCtx & T;
}

/**
 * Brands a readable string as a Convex document id.
 *
 * `Id<T>` has no runtime constructor — real ids are minted server-side — so a
 * fixture that wants a stable, legible id has to brand one itself. Doing it
 * through this helper keeps the table name in the type, unlike `as never`,
 * which erases it and lets a `wallets` id be passed where a `users` id belongs.
 */
export function fakeId<Table extends TableNames>(id: string): Id<Table> {
  return id as Id<Table>;
}
