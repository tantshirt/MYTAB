/**
 * RFC 9421 HTTP Message Signature verification for DFlow REST responses.
 *
 * Send `x-sign-request: true` plus our own `x-request-id`; DFlow returns
 * `signature-input`, `signature`, `content-digest` and echoes `x-request-id`.
 * VERIFIED live against the developer host (no API key), signature base:
 *
 *   "@status": 200
 *   "content-type": application/json
 *   "content-digest": sha-256=:<b64>:
 *   "x-request-id";req: <the id WE sent>
 *   "@signature-params": ("@status" "content-type" "content-digest" "x-request-id";req);created=…;keyid="…";alg="ed25519"
 *
 * The `;req` marker means the value is taken from the REQUEST, not the response,
 * which is what makes the id a real replay guard rather than an echo.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT.
 *
 * It proves: this JSON is byte-for-byte what DFlow's edge sent in reply to THIS
 * request id. It removes the network — a mis-issued TLS certificate, a BGP
 * hijack, a compromised intermediary — as an attack surface.
 *
 * It does NOT prove the transaction inside is safe or economically sound.
 * DFlow's own backend produces the signature, so a signature can never attest to
 * anything about DFlow's correctness. Every independent check on the decoded
 * transaction stays exactly where it is. A verified signature is never a reason
 * to skip one.
 *
 * Every failure below is a hard rejection. There is no warn-and-continue path.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256Bytes } from "../crypto/convexCrypto";
import { base58ToBytes, base64ToBytes } from "../solana/decodeTransaction";
import { DFLOW_SIGNING_PUBLIC_KEY_BASE58 } from "./config";

export const RESPONSE_SIGNATURE_FAILURE = {
  MISSING_HEADER: "DFLOW_SIGNATURE_HEADER_MISSING",
  SIGNATURE_INPUT_MALFORMED: "DFLOW_SIGNATURE_INPUT_MALFORMED",
  SIGNATURE_MALFORMED: "DFLOW_SIGNATURE_MALFORMED",
  /** The signed component set does not cover what we require — downgrade guard. */
  COVERAGE_INSUFFICIENT: "DFLOW_SIGNATURE_COVERAGE_INSUFFICIENT",
  ALGORITHM_UNSUPPORTED: "DFLOW_SIGNATURE_ALGORITHM_UNSUPPORTED",
  /** `keyid` is not the pinned DFlow key. */
  KEY_UNPINNED: "DFLOW_SIGNATURE_KEY_UNPINNED",
  CONTENT_DIGEST_MALFORMED: "DFLOW_CONTENT_DIGEST_MALFORMED",
  CONTENT_DIGEST_MISMATCH: "DFLOW_CONTENT_DIGEST_MISMATCH",
  /** The echoed id is not the one we generated — replay / response confusion. */
  REQUEST_ID_MISMATCH: "DFLOW_REQUEST_ID_MISMATCH",
  SIGNATURE_INVALID: "DFLOW_RESPONSE_SIGNATURE_INVALID",
  CREATED_OUT_OF_RANGE: "DFLOW_SIGNATURE_CREATED_OUT_OF_RANGE",
} as const;

export type ResponseSignatureFailureCode =
  (typeof RESPONSE_SIGNATURE_FAILURE)[keyof typeof RESPONSE_SIGNATURE_FAILURE];

/**
 * Components we REQUIRE to be covered, in the order DFlow signs them.
 * A response that covers fewer is refused rather than accepted at lower
 * assurance: without `content-digest` the body is unbound, and without
 * `x-request-id` an old signed response replays.
 */
export const REQUIRED_SIGNED_COMPONENTS = [
  '"@status"',
  '"content-type"',
  '"content-digest"',
  '"x-request-id";req',
] as const;

/** How far the `created` timestamp may drift from our clock, in seconds. */
export const SIGNATURE_MAX_AGE_SECONDS = 300;
export const SIGNATURE_MAX_SKEW_SECONDS = 60;

export type VerifyDflowResponseInput = {
  status: number;
  /** Response headers, case-insensitive lookup handled internally. */
  headers: Headers | Record<string, string | undefined>;
  /** The exact response body bytes, before any JSON parsing. */
  body: Uint8Array;
  /** The `x-request-id` WE sent. */
  expectedRequestId: string;
  /** Override for tests. */
  publicKeyBase58?: string;
  nowSeconds?: number;
};

export type VerifyDflowResponseResult =
  | { ok: true; keyId: string; createdSeconds: number }
  | { ok: false; failureCode: ResponseSignatureFailureCode; detail?: string };

function header(
  headers: Headers | Record<string, string | undefined>,
  name: string,
): string | undefined {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const record = headers as Record<string, string | undefined>;
  const direct = record[name];
  if (direct !== undefined) {
    return direct;
  }
  const lower = name.toLowerCase();
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lower) {
      return record[key];
    }
  }
  return undefined;
}

function fail(
  failureCode: ResponseSignatureFailureCode,
  detail?: string,
): VerifyDflowResponseResult {
  return detail ? { ok: false, failureCode, detail } : { ok: false, failureCode };
}

type ParsedSignatureInput = {
  label: string;
  components: string[];
  /** Everything after the component list, verbatim — reused in the base. */
  parameters: string;
  keyId?: string;
  algorithm?: string;
  created?: number;
};

/**
 * Parses `sig1=("a" "b";req);created=…;keyid="…";alg="…"`.
 *
 * Deliberately strict and deliberately NOT a general RFC 8941 parser: we accept
 * exactly the shape DFlow emits and refuse anything else, rather than being
 * liberal about a string whose exact bytes we then have to reproduce to verify.
 */
export function parseSignatureInput(value: string): ParsedSignatureInput | null {
  const match = /^([A-Za-z0-9_-]+)=\(([^()]*)\)((?:;[^;,\s]+)*)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, label, componentList, parameters] = match;
  const components = (componentList ?? "")
    .trim()
    .split(/\s+/)
    .filter((entry) => entry.length > 0);

  const parsed: ParsedSignatureInput = {
    label: label!,
    components,
    parameters: parameters ?? "",
  };

  for (const parameter of (parameters ?? "").split(";")) {
    if (!parameter) {
      continue;
    }
    const eq = parameter.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const key = parameter.slice(0, eq);
    const raw = parameter.slice(eq + 1);
    const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    if (key === "keyid") {
      parsed.keyId = unquoted;
    } else if (key === "alg") {
      parsed.algorithm = unquoted;
    } else if (key === "created") {
      const created = Number(unquoted);
      if (Number.isInteger(created)) {
        parsed.created = created;
      }
    }
  }

  return parsed;
}

/** Extracts the raw base64 from `sig1=:<b64>:`, for the matching label. */
export function parseSignatureHeader(value: string, label: string): string | null {
  const match = new RegExp(`(?:^|,)\\s*${label}=:([A-Za-z0-9+/=]+):`).exec(value);
  return match?.[1] ?? null;
}

/**
 * Rebuilds the RFC 9421 signature base.
 *
 * `signatureParams` is reproduced VERBATIM from the header rather than
 * re-serialised: RFC 9421 signs the exact bytes the signer emitted, and a
 * re-serialisation that differs by one space verifies against nothing.
 */
export function buildSignatureBase(input: {
  status: number;
  contentType: string;
  contentDigest: string;
  requestId: string;
  signatureParams: string;
}): string {
  return [
    `"@status": ${input.status}`,
    `"content-type": ${input.contentType}`,
    `"content-digest": ${input.contentDigest}`,
    `"x-request-id";req: ${input.requestId}`,
    `"@signature-params": ${input.signatureParams}`,
  ].join("\n");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}

/**
 * Verifies a signed DFlow REST response. Returns a failure code; never throws
 * for a verification outcome, and never returns ok on a partial check.
 */
export function verifyDflowResponseSignature(
  input: VerifyDflowResponseInput,
): VerifyDflowResponseResult {
  const signatureInputHeader = header(input.headers, "signature-input");
  const signatureHeader = header(input.headers, "signature");
  const contentDigestHeader = header(input.headers, "content-digest");
  const contentTypeHeader = header(input.headers, "content-type");
  const echoedRequestId = header(input.headers, "x-request-id");

  if (!signatureInputHeader) {
    return fail(RESPONSE_SIGNATURE_FAILURE.MISSING_HEADER, "signature-input");
  }
  if (!signatureHeader) {
    return fail(RESPONSE_SIGNATURE_FAILURE.MISSING_HEADER, "signature");
  }
  if (!contentDigestHeader) {
    return fail(RESPONSE_SIGNATURE_FAILURE.MISSING_HEADER, "content-digest");
  }
  if (!contentTypeHeader) {
    return fail(RESPONSE_SIGNATURE_FAILURE.MISSING_HEADER, "content-type");
  }

  // Replay guard. Checked before anything expensive, and checked even though the
  // id is also inside the signature base — a mismatch here is a different and
  // more legible failure than "signature did not verify".
  if (echoedRequestId !== input.expectedRequestId) {
    return fail(
      RESPONSE_SIGNATURE_FAILURE.REQUEST_ID_MISMATCH,
      `echoed=${echoedRequestId ?? "<absent>"}`,
    );
  }

  const parsed = parseSignatureInput(signatureInputHeader);
  if (!parsed) {
    return fail(RESPONSE_SIGNATURE_FAILURE.SIGNATURE_INPUT_MALFORMED);
  }

  // Downgrade guard: the signed set must cover exactly what we require, in
  // order. A response that signs only "@status" is worthless and must not be
  // accepted just because the ed25519 maths happens to check out.
  if (
    parsed.components.length !== REQUIRED_SIGNED_COMPONENTS.length ||
    parsed.components.some(
      (component, index) => component !== REQUIRED_SIGNED_COMPONENTS[index],
    )
  ) {
    return fail(
      RESPONSE_SIGNATURE_FAILURE.COVERAGE_INSUFFICIENT,
      parsed.components.join(" "),
    );
  }

  if (parsed.algorithm !== "ed25519") {
    return fail(
      RESPONSE_SIGNATURE_FAILURE.ALGORITHM_UNSUPPORTED,
      parsed.algorithm ?? "<absent>",
    );
  }

  const pinnedKey = input.publicKeyBase58 ?? DFLOW_SIGNING_PUBLIC_KEY_BASE58;
  if (parsed.keyId !== pinnedKey) {
    return fail(
      RESPONSE_SIGNATURE_FAILURE.KEY_UNPINNED,
      parsed.keyId ?? "<absent>",
    );
  }

  if (parsed.created === undefined) {
    return fail(RESPONSE_SIGNATURE_FAILURE.SIGNATURE_INPUT_MALFORMED, "created");
  }
  if (input.nowSeconds !== undefined) {
    const age = input.nowSeconds - parsed.created;
    if (age > SIGNATURE_MAX_AGE_SECONDS || age < -SIGNATURE_MAX_SKEW_SECONDS) {
      return fail(
        RESPONSE_SIGNATURE_FAILURE.CREATED_OUT_OF_RANGE,
        `age=${age}s`,
      );
    }
  }

  // Integrity: the digest must be over the bytes we actually received, not over
  // a re-serialised parse of them.
  const digestMatch = /^sha-256=:([A-Za-z0-9+/=]+):$/.exec(contentDigestHeader.trim());
  if (!digestMatch) {
    return fail(
      RESPONSE_SIGNATURE_FAILURE.CONTENT_DIGEST_MALFORMED,
      contentDigestHeader,
    );
  }
  let declaredDigest: Uint8Array;
  try {
    declaredDigest = base64ToBytes(digestMatch[1]!);
  } catch {
    return fail(RESPONSE_SIGNATURE_FAILURE.CONTENT_DIGEST_MALFORMED, "base64");
  }
  if (!bytesEqual(sha256Bytes(input.body), declaredDigest)) {
    return fail(RESPONSE_SIGNATURE_FAILURE.CONTENT_DIGEST_MISMATCH);
  }

  const signatureBase64 = parseSignatureHeader(signatureHeader, parsed.label);
  if (!signatureBase64) {
    return fail(RESPONSE_SIGNATURE_FAILURE.SIGNATURE_MALFORMED, parsed.label);
  }

  let signature: Uint8Array;
  let publicKey: Uint8Array;
  try {
    signature = base64ToBytes(signatureBase64);
    publicKey = base58ToBytes(pinnedKey);
  } catch {
    return fail(RESPONSE_SIGNATURE_FAILURE.SIGNATURE_MALFORMED, "decode");
  }
  if (signature.length !== 64 || publicKey.length !== 32) {
    return fail(
      RESPONSE_SIGNATURE_FAILURE.SIGNATURE_MALFORMED,
      `sig=${signature.length} key=${publicKey.length}`,
    );
  }

  const base = buildSignatureBase({
    status: input.status,
    contentType: contentTypeHeader,
    contentDigest: contentDigestHeader,
    requestId: input.expectedRequestId,
    signatureParams: `(${parsed.components.join(" ")})${parsed.parameters}`,
  });

  let valid = false;
  try {
    // zip215:false — RFC 8032 strict, matching the verifier used elsewhere in
    // this codebase for user signatures.
    valid = ed25519.verify(signature, new TextEncoder().encode(base), publicKey, {
      zip215: false,
    });
  } catch {
    valid = false;
  }

  if (!valid) {
    return fail(RESPONSE_SIGNATURE_FAILURE.SIGNATURE_INVALID);
  }

  return { ok: true, keyId: pinnedKey, createdSeconds: parsed.created };
}
