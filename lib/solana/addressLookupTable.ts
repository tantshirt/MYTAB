/**
 * Address lookup table resolution for the DFlow-routed path (AD-10).
 *
 * WHY THIS EXISTS AT ALL.
 *
 * `validateTransactionMessage` rejects any message carrying address table
 * lookups, because an unresolved account index can name anything — including a
 * writable account the sponsor is paying to modify. The plan was to constrain
 * routing so no lookup table is needed. That plan is not available:
 *
 *   VERIFIED against DFlow's live API — every single `/order` response carries
 *   TWO lookup tables, including `onlyDirectRoutes=true` on a one-venue route,
 *   and at every `maxAccounts` / `maxTransactionSize` that routes at all. One of
 *   the two is DFlow's own common table (mints, token programs, sysvars), which
 *   the aggregator uses structurally. Tightening `maxAccounts` to 24 produced
 *   `route_not_found`, never a lookup-free transaction.
 *
 * So the tables must be RESOLVED rather than avoided, and the resolved account
 * set must face the identical deny-by-default rules. That is what this module
 * provides. It weakens nothing: a message whose tables cannot be fully and
 * unambiguously resolved is still rejected, and the direct exact-USDC path still
 * rejects lookups outright.
 *
 * WHY RESOLVING IS SOUND. Lookup table entries are append-only: the on-chain
 * program can extend a table but can never rewrite or remove an existing index.
 * An index that resolved to address X at the router's `contextSlot` therefore
 * still resolves to X at any later slot, so reading the table at or after
 * `contextSlot` yields exactly what the chain will use at execution. What we
 * must guard is the other direction — an index past the end of the table as we
 * observed it — which is rejected, not clamped.
 */

import { base58ToBytes, bytesToBase58, base64ToBytes } from "./decodeTransaction";
import type { DecodedMessage } from "./decodeTransaction";

export const ADDRESS_LOOKUP_TABLE_PROGRAM_ID =
  "AddressLookupTab1e1111111111111111111111111";

/** `u32 discriminator | u64 deactivationSlot | u64 lastExtendedSlot | u8 startIndex | Option<Pubkey> authority | u16 padding`. */
export const LOOKUP_TABLE_META_SIZE = 56;
const LOOKUP_TABLE_ACCOUNT_TYPE = 1;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

export const ALT_FAILURE = {
  /** A table the message references was not supplied to the validator. */
  UNRESOLVED: "ADDRESS_TABLE_UNRESOLVED",
  OWNER_INVALID: "ADDRESS_TABLE_OWNER_INVALID",
  DATA_MALFORMED: "ADDRESS_TABLE_DATA_MALFORMED",
  /** The table is deactivating or closed; the runtime may drop it mid-flight. */
  DEACTIVATED: "ADDRESS_TABLE_DEACTIVATED",
  INDEX_OUT_OF_RANGE: "ADDRESS_TABLE_INDEX_OUT_OF_RANGE",
  DUPLICATE_TABLE: "ADDRESS_TABLE_DUPLICATE_TABLE",
  /** The same account reachable by two indexes — role confusion. */
  DUPLICATE_ACCOUNT: "ADDRESS_TABLE_DUPLICATE_ACCOUNT",
  /** The router's declared entry disagrees with what the chain holds. */
  DECLARATION_MISMATCH: "ADDRESS_TABLE_DECLARATION_MISMATCH",
  /** Table read at a slot older than the one the router quoted against. */
  SLOT_TOO_OLD: "ADDRESS_TABLE_SLOT_TOO_OLD",
} as const;

export type AltFailureCode = (typeof ALT_FAILURE)[keyof typeof ALT_FAILURE];

export type AddressLookupTableAccount = {
  address: string;
  /** Addresses in table order. Index i of a lookup names `addresses[i]`. */
  addresses: readonly string[];
  authority?: string;
  deactivationSlot: bigint;
  lastExtendedSlot: bigint;
  /** Slot the RPC served this account at, when the caller captured one. */
  observedSlot?: number;
};

export type AltDecodeResult =
  | { ok: true; table: AddressLookupTableAccount }
  | { ok: false; code: AltFailureCode; detail?: string };

function readU64LE(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) {
    value = (value << 8n) | BigInt(data[offset + i]!);
  }
  return value;
}

function readU32LE(data: Uint8Array, offset: number): number {
  return (
    (data[offset]! |
      (data[offset + 1]! << 8) |
      (data[offset + 2]! << 16) |
      (data[offset + 3]! << 24)) >>>
    0
  );
}

/**
 * Decodes a raw lookup table account. Deny by default: wrong owner, wrong
 * discriminator, a length that is not a whole number of 32-byte addresses, or a
 * table that is deactivating all reject.
 */
export function decodeAddressLookupTable(input: {
  address: string;
  owner: string;
  dataBase64: string;
  observedSlot?: number;
}): AltDecodeResult {
  if (input.owner !== ADDRESS_LOOKUP_TABLE_PROGRAM_ID) {
    return { ok: false, code: ALT_FAILURE.OWNER_INVALID, detail: input.owner };
  }

  let data: Uint8Array;
  try {
    data = base64ToBytes(input.dataBase64);
  } catch {
    return { ok: false, code: ALT_FAILURE.DATA_MALFORMED, detail: "base64" };
  }

  if (data.length < LOOKUP_TABLE_META_SIZE) {
    return { ok: false, code: ALT_FAILURE.DATA_MALFORMED, detail: `len=${data.length}` };
  }
  if (readU32LE(data, 0) !== LOOKUP_TABLE_ACCOUNT_TYPE) {
    return { ok: false, code: ALT_FAILURE.DATA_MALFORMED, detail: "account type" };
  }

  const addressBytes = data.length - LOOKUP_TABLE_META_SIZE;
  if (addressBytes % 32 !== 0) {
    return { ok: false, code: ALT_FAILURE.DATA_MALFORMED, detail: "ragged address list" };
  }

  const deactivationSlot = readU64LE(data, 4);
  // The runtime keeps a deactivating table usable for a cooldown, then drops it.
  // We refuse the whole class rather than reason about where in the cooldown we
  // are: the sponsor must never sign a message whose account set can evaporate.
  if (deactivationSlot !== U64_MAX) {
    return {
      ok: false,
      code: ALT_FAILURE.DEACTIVATED,
      detail: deactivationSlot.toString(),
    };
  }

  const lastExtendedSlot = readU64LE(data, 12);
  const authorityPresent = data[21] === 1;
  const authority = authorityPresent
    ? bytesToBase58(data.slice(22, 54))
    : undefined;

  const addresses: string[] = [];
  for (let offset = LOOKUP_TABLE_META_SIZE; offset < data.length; offset += 32) {
    addresses.push(bytesToBase58(data.slice(offset, offset + 32)));
  }

  return {
    ok: true,
    table: {
      address: input.address,
      addresses,
      authority,
      deactivationSlot,
      lastExtendedSlot,
      observedSlot: input.observedSlot,
    },
  };
}

export type ResolvedAccountSet = {
  /** Full account key list in runtime order: static, ALT writable, ALT readonly. */
  keys: readonly string[];
  /** Parallel to `keys`. */
  writable: readonly boolean[];
  signer: readonly boolean[];
  /** Count of keys carried in the message itself. */
  staticCount: number;
};

export type ResolveLookupsResult =
  | { ok: true; resolved: ResolvedAccountSet }
  | { ok: false; code: AltFailureCode; detail?: string };

function staticIsWritable(message: DecodedMessage, index: number): boolean {
  if (index < message.numRequiredSignatures) {
    return index < message.numRequiredSignatures - message.numReadonlySignedAccounts;
  }
  return (
    index < message.staticAccountKeys.length - message.numReadonlyUnsignedAccounts
  );
}

/**
 * Expands a v0 message's address table lookups into the full account set the
 * runtime will see.
 *
 * Ordering is fixed by the Solana runtime and reproduced exactly: all static
 * keys, then every writable lookup entry in lookup order, then every readonly
 * lookup entry in lookup order. Getting this wrong would mis-attribute writable
 * status, which is precisely the thing the gate exists to check.
 */
export function resolveAddressTableLookups(input: {
  message: DecodedMessage;
  tables: readonly AddressLookupTableAccount[];
  /** The router's `contextSlot`; tables must have been read at or after it. */
  minSlot?: number;
}): ResolveLookupsResult {
  const byAddress = new Map<string, AddressLookupTableAccount>();
  for (const table of input.tables) {
    if (byAddress.has(table.address)) {
      return { ok: false, code: ALT_FAILURE.DUPLICATE_TABLE, detail: table.address };
    }
    byAddress.set(table.address, table);
  }

  const staticKeys = input.message.staticAccountKeys;
  const keys: string[] = [...staticKeys];
  const writable: boolean[] = staticKeys.map((_, index) =>
    staticIsWritable(input.message, index),
  );
  const signer: boolean[] = staticKeys.map(
    (_, index) => index < input.message.numRequiredSignatures,
  );

  const seenLookupTables = new Set<string>();
  const writableResolved: string[] = [];
  const readonlyResolved: string[] = [];

  for (const lookup of input.message.addressTableLookups) {
    if (seenLookupTables.has(lookup.accountKey)) {
      return {
        ok: false,
        code: ALT_FAILURE.DUPLICATE_TABLE,
        detail: lookup.accountKey,
      };
    }
    seenLookupTables.add(lookup.accountKey);

    const table = byAddress.get(lookup.accountKey);
    if (!table) {
      return { ok: false, code: ALT_FAILURE.UNRESOLVED, detail: lookup.accountKey };
    }
    if (
      input.minSlot !== undefined &&
      table.observedSlot !== undefined &&
      table.observedSlot < input.minSlot
    ) {
      return {
        ok: false,
        code: ALT_FAILURE.SLOT_TOO_OLD,
        detail: `${table.address}@${table.observedSlot} < ${input.minSlot}`,
      };
    }

    for (const index of lookup.writableIndexes) {
      const address = table.addresses[index];
      if (address === undefined) {
        return {
          ok: false,
          code: ALT_FAILURE.INDEX_OUT_OF_RANGE,
          detail: `${table.address}[${index}] of ${table.addresses.length}`,
        };
      }
      writableResolved.push(address);
    }
    for (const index of lookup.readonlyIndexes) {
      const address = table.addresses[index];
      if (address === undefined) {
        return {
          ok: false,
          code: ALT_FAILURE.INDEX_OUT_OF_RANGE,
          detail: `${table.address}[${index}] of ${table.addresses.length}`,
        };
      }
      readonlyResolved.push(address);
    }
  }

  for (const address of writableResolved) {
    keys.push(address);
    writable.push(true);
    signer.push(false);
  }
  for (const address of readonlyResolved) {
    keys.push(address);
    writable.push(false);
    signer.push(false);
  }

  // A key reachable at two indexes with two different roles lets an instruction
  // present the same account as readonly in one slot and writable in another.
  // The runtime tolerates it; our reasoning about "which accounts are writable"
  // does not, so it is rejected.
  const seenKeys = new Set<string>();
  for (const key of keys) {
    if (seenKeys.has(key)) {
      return { ok: false, code: ALT_FAILURE.DUPLICATE_ACCOUNT, detail: key };
    }
    seenKeys.add(key);
  }

  return {
    ok: true,
    resolved: {
      keys,
      writable,
      signer,
      staticCount: staticKeys.length,
    },
  };
}

/**
 * Cross-checks the router's declared lookup-table entries against what we read
 * from the chain.
 *
 * DFlow returns `addressLookupTables: [{ address, addresses: { index: pubkey } }]`
 * when `includeAddressLookupTables=true`. The chain is authoritative; the
 * declaration is only ever used to reject. If DFlow says index 186 is USDC and
 * the chain says otherwise, something is wrong that we do not understand, and
 * the sponsor does not sign things we do not understand.
 */
export function assertDeclaredTablesMatch(input: {
  declared: readonly { address: string; addresses: Readonly<Record<string, string>> }[];
  tables: readonly AddressLookupTableAccount[];
}): { ok: true } | { ok: false; code: AltFailureCode; detail?: string } {
  const byAddress = new Map(input.tables.map((table) => [table.address, table]));
  for (const declaration of input.declared) {
    const table = byAddress.get(declaration.address);
    if (!table) {
      return {
        ok: false,
        code: ALT_FAILURE.UNRESOLVED,
        detail: declaration.address,
      };
    }
    for (const [rawIndex, claimed] of Object.entries(declaration.addresses)) {
      const index = Number(rawIndex);
      if (!Number.isInteger(index) || index < 0) {
        return {
          ok: false,
          code: ALT_FAILURE.DECLARATION_MISMATCH,
          detail: `${declaration.address}[${rawIndex}]`,
        };
      }
      const actual = table.addresses[index];
      if (actual === undefined) {
        return {
          ok: false,
          code: ALT_FAILURE.INDEX_OUT_OF_RANGE,
          detail: `${declaration.address}[${index}]`,
        };
      }
      if (actual !== claimed) {
        return {
          ok: false,
          code: ALT_FAILURE.DECLARATION_MISMATCH,
          detail: `${declaration.address}[${index}] chain=${actual} declared=${claimed}`,
        };
      }
    }
  }
  return { ok: true };
}

/** Validates a base58 table address before it is sent to an RPC. */
export function isValidTableAddress(address: string): boolean {
  try {
    return base58ToBytes(address).length === 32;
  } catch {
    return false;
  }
}
