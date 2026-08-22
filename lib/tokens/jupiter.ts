/**
 * Jupiter Token API V2 — the metadata source.
 *
 * Why this one, over the alternatives:
 *
 *  - **`solana-labs/token-list`** is a dead registry. Jupiter's own icon URLs
 *    still point at its GitHub assets, which is the clearest possible sign it
 *    survives as a CDN for images and not as a source of truth. It carries no
 *    verification signal usable today.
 *  - **Metaplex on-chain metadata** is authoritative about what an issuer
 *    *claims* and says nothing about whether the claim is legitimate. Anyone
 *    can mint a token whose on-chain metadata reads `symbol: "USDC"`. For a
 *    payment sheet, "who vouches for this" is the entire question, and chain
 *    metadata cannot answer it. It is also one RPC round trip per mint.
 *  - **Jupiter** publishes a curated registry with an explicit `isVerified`
 *    flag and a `tags` array carrying `verified` / `strict`, and — decisively —
 *    a **batch-by-mint** endpoint. We can ask about exactly the mints a payer
 *    holds instead of downloading a list.
 *
 * That last property is what makes the ban on client-fetching cheap to keep.
 *
 * Two things this module refuses to do, both learned from the live API:
 *
 *  1. **It never trusts the response's membership.** `/search` is a *search*:
 *     `?query=USDC` returns twenty tokens, several of them lookalikes carrying
 *     the symbol "USDC" on a different mint. Only entries whose `id` is in the
 *     requested set survive.
 *  2. **It treats a missing `isVerified` as false.** Verified tokens carry
 *     `isVerified: true`; unverified ones **omit the field entirely** rather
 *     than sending `false`. `=== true` is the only safe test — a `!== false`
 *     check would have marked every lookalike in that response verified.
 *
 * Jupiter indexes mainnet only. Devnet has no registry and falls back to the
 * cluster pins plus chain reads, which is correct: devnet's USDC is a test mint
 * that no registry could legitimately list.
 */

import { resolveCluster, type SolanaCluster } from "../solana/cluster";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../solana/constants";
import {
  TOKEN_METADATA_FAILURE,
  TokenMetadataError,
  isPlausibleMint,
  isValidDecimals,
  type RawTokenListEntry,
} from "./types";

/** Free tier. No API key, no account. We still only ever call it server-side. */
export const JUPITER_LITE_BASE_URL = "https://lite-api.jup.ag/tokens/v2";
/** Keyed tier, used automatically when `JUPITER_API_KEY` is set in Convex. */
export const JUPITER_PRO_BASE_URL = "https://api.jup.ag/tokens/v2";

/**
 * 100 mints per `/search` call, enforced here because the API does not enforce
 * it in any way you can detect.
 *
 * Measured against the live endpoint: sending 101 and 150 distinct mints both
 * return HTTP 200 with a byte-identical response containing exactly 100
 * results. No error, no warning, no header. The overflow mints simply vanish,
 * and would surface much later as "unknown token" on a payment sheet. This cap
 * is the only thing standing between a long wallet and that bug.
 */
export const JUPITER_MAX_MINTS_PER_REQUEST = 100;

/**
 * Required by Jupiter's SDK & API License Agreement wherever this data is
 * surfaced. The licence also forbids re-serving Jupiter content as our own API,
 * which is why `api.tokens.getTokenMetadata` is authenticated and scoped to
 * specific mints rather than being a public token-list endpoint.
 */
export const JUPITER_ATTRIBUTION = "Powered by Jupiter";

/**
 * Tags that disqualify a token from being treated as verified, even when
 * `isVerified` is true — and it is true for all of these.
 *
 * `duplicate` marks a second mint for a token that already exists (WOJAK,
 * TRUMP and BOOP all carry it): verified as a real asset, and exactly the
 * ambiguity a payer cannot be asked to resolve at a dinner table.
 * `deprecated` marks a token its own issuer has retired. Neither belongs in a
 * default payment list, so both are demoted to unverified rather than hidden.
 */
export const DISQUALIFYING_TAGS: ReadonlySet<string> = new Set([
  "duplicate",
  "deprecated",
]);

const REQUEST_TIMEOUT_MS = 10_000;

/** Jupiter indexes mainnet only. */
export function jupiterSupportsCluster(cluster: SolanaCluster): boolean {
  return cluster === "mainnet-beta";
}

export function jupiterBaseUrl(env: Record<string, string | undefined>): string {
  return env.JUPITER_API_KEY?.trim() ? JUPITER_PRO_BASE_URL : JUPITER_LITE_BASE_URL;
}

/** Splits a mint set into request-sized chunks, deduplicated, order preserved. */
export function chunkMints(
  mints: readonly string[],
  size: number = JUPITER_MAX_MINTS_PER_REQUEST,
): string[][] {
  const unique = [...new Set(mints)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
  }
  return chunks;
}

export function buildJupiterSearchUrl(
  mints: readonly string[],
  baseUrl: string,
): string {
  if (mints.length === 0) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.SOURCE_MALFORMED,
      "refusing to build a search URL with no mints",
    );
  }
  if (mints.length > JUPITER_MAX_MINTS_PER_REQUEST) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.SOURCE_MALFORMED,
      `${mints.length} mints exceeds the ${JUPITER_MAX_MINTS_PER_REQUEST} per-request cap`,
    );
  }
  // Comma-delimited, encoded as one parameter value rather than interpolated:
  // base58 needs no escaping today, but an unvalidated mint would, and this is
  // the boundary where that would matter.
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/search`);
  url.searchParams.set("query", mints.join(","));
  return url.toString();
}

const ALLOWED_TOKEN_PROGRAMS = new Set([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]);

/**
 * Characters that let one label impersonate another.
 *
 * Zero-width joiners and bidi overrides can make a symbol render as "USDC"
 * while comparing unequal to it, which would walk straight past the
 * reserved-symbol check in `canonical.ts`. C0/C1 controls are included because
 * a newline in a symbol breaks every surface that renders it.
 */
const UNSAFE_LABEL_CHARS =
  // eslint-disable-next-line no-control-regex -- controls are exactly the point
  /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** Strips characters that let one label impersonate another. */
export function sanitizeLabel(value: string, maxLength: number): string {
  return value.replace(UNSAFE_LABEL_CHARS, "").trim().slice(0, maxLength);
}

/** Only https logos. An http or data URL in a token list is not worth carrying. */
export function isSafeLogoUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Reads one raw entry, or returns null when it is unusable.
 *
 * A single malformed entry is dropped rather than failing the batch: a registry
 * carrying one bad row should cost us that row, not every token in the payer's
 * wallet. A malformed *envelope* is a different matter and does throw, in
 * {@link parseJupiterSearchBody}.
 */
export function parseJupiterEntry(value: unknown): RawTokenListEntry | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const row = value as Record<string, unknown>;

  if (!isPlausibleMint(row.id)) {
    return null;
  }
  if (typeof row.symbol !== "string") {
    return null;
  }
  if (typeof row.name !== "string") {
    return null;
  }
  if (!isValidDecimals(row.decimals)) {
    return null;
  }
  // A mint under a program we cannot build a transfer for is not a token we can
  // offer, whatever its metadata says.
  if (
    typeof row.tokenProgram === "string" &&
    !ALLOWED_TOKEN_PROGRAMS.has(row.tokenProgram)
  ) {
    return null;
  }

  const symbol = sanitizeLabel(row.symbol, 32);
  const name = sanitizeLabel(row.name, 96);
  // A label that was *entirely* invisible characters is a deliberate spoof, and
  // an empty symbol is unrenderable either way.
  if (symbol.length === 0 || name.length === 0) {
    return null;
  }

  const tags = Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  // `isVerified` is the primary signal, the `verified` tag corroborates it.
  // Note the strict `=== true`: unverified entries omit the field.
  const vouchedFor = row.isVerified === true || tags.includes("verified");
  const disqualified = tags.some((tag) => DISQUALIFYING_TAGS.has(tag));
  const verified = vouchedFor && !disqualified;

  const icon = typeof row.icon === "string" ? row.icon : null;

  return {
    mint: row.id,
    symbol,
    name,
    decimals: row.decimals,
    logoURI: icon && isSafeLogoUrl(icon) ? icon : null,
    verified,
  };
}

/**
 * Parses a `/search` body down to exactly the mints that were asked for.
 *
 * The `requested` filter is load-bearing, not defensive tidiness: `/search`
 * matches fuzzily, so an entry appearing in the response is not evidence that
 * we asked about it.
 */
export function parseJupiterSearchBody(
  body: string,
  requested: readonly string[],
): RawTokenListEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.SOURCE_MALFORMED,
      `Jupiter returned a non-JSON body: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.SOURCE_MALFORMED,
      "Jupiter /search did not return an array",
    );
  }

  const wanted = new Set(requested);
  const seen = new Set<string>();
  const entries: RawTokenListEntry[] = [];

  for (const raw of parsed) {
    const entry = parseJupiterEntry(raw);
    if (!entry || !wanted.has(entry.mint) || seen.has(entry.mint)) {
      continue;
    }
    seen.add(entry.mint);
    entries.push(entry);
  }

  return entries;
}

export type JupiterFetchOptions = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
};

/**
 * Fetches metadata for up to {@link JUPITER_MAX_MINTS_PER_REQUEST} mints.
 *
 * Mints absent from the result are absent from the registry — Jupiter answers
 * an unknown mint with `[]` and HTTP 200, not a 404. The caller distinguishes
 * "unlisted" from "unreachable" by whether this throws.
 */
export async function fetchJupiterTokens(
  mints: readonly string[],
  options: JupiterFetchOptions = {},
): Promise<RawTokenListEntry[]> {
  if (mints.length === 0) {
    return [];
  }

  const baseUrl =
    options.baseUrl ??
    (options.apiKey?.trim() ? JUPITER_PRO_BASE_URL : JUPITER_LITE_BASE_URL);
  const url = buildJupiterSearchUrl(mints, baseUrl);

  const headers: Record<string, string> = { accept: "application/json" };
  if (options.apiKey?.trim()) {
    headers["x-api-key"] = options.apiKey.trim();
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.SOURCE_UNAVAILABLE,
      `Jupiter is unreachable: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }

  if (!response.ok) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.SOURCE_UNAVAILABLE,
      `Jupiter responded ${response.status}`,
    );
  }

  return parseJupiterSearchBody(await response.text(), mints);
}

/** Fetches an arbitrary number of mints by chunking into capped requests. */
export async function fetchJupiterTokensChunked(
  mints: readonly string[],
  options: JupiterFetchOptions & { cluster?: SolanaCluster } = {},
): Promise<RawTokenListEntry[]> {
  const cluster = options.cluster ?? resolveCluster();
  if (!jupiterSupportsCluster(cluster)) {
    // Not an error. Devnet legitimately has no registry and the caller falls
    // back to the pins; returning [] keeps that path free of a special case.
    return [];
  }

  const results: RawTokenListEntry[] = [];
  for (const chunk of chunkMints(mints)) {
    results.push(...(await fetchJupiterTokens(chunk, options)));
  }
  return results;
}
