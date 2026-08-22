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
