import { describe, expect, it } from "vitest";
import fixture from "../fixtures/dflow-order-mainnet.json";
import {
  buildSignatureBase,
  parseSignatureInput,
  verifyDflowResponseSignature,
} from "../../lib/dflow/responseSignature";
import { DFLOW_SIGNING_PUBLIC_KEY_BASE58 } from "../../lib/dflow/config";

const body = Uint8Array.from(Buffer.from(fixture.response.bodyBase64, "base64"));
const headers = fixture.response.headers as Record<string, string>;
const requestId = fixture.request.requestId;

function verify(overrides: Partial<Parameters<typeof verifyDflowResponseSignature>[0]> = {}) {
  return verifyDflowResponseSignature({
    status: fixture.response.status,
    headers,
    body,
    expectedRequestId: requestId,
    ...overrides,
  });
}

describe("DFlow response signing — RFC 9421 over a real captured response", () => {
  it("verifies a genuine signed /order response against the pinned key", () => {
    const result = verify();
    expect(result).toMatchObject({ ok: true, keyId: DFLOW_SIGNING_PUBLIC_KEY_BASE58 });
  });

  it("covers exactly @status, content-type, content-digest and the REQUEST id", () => {
    const parsed = parseSignatureInput(headers["signature-input"]!);
    expect(parsed?.components).toEqual([
      '"@status"',
      '"content-type"',
      '"content-digest"',
      // `;req` means the value comes from OUR request, which is what makes it a
      // replay guard rather than an echo the server chooses.
      '"x-request-id";req',
    ]);
    expect(parsed?.algorithm).toBe("ed25519");
    expect(parsed?.keyId).toBe(DFLOW_SIGNING_PUBLIC_KEY_BASE58);
  });

  it("rejects a body altered by a single byte (content-digest binding)", () => {
    const tampered = Uint8Array.from(body);
    tampered[tampered.length - 2] ^= 0x01;
    expect(verify({ body: tampered })).toMatchObject({
      ok: false,
      failureCode: "DFLOW_CONTENT_DIGEST_MISMATCH",
    });
  });

  it("rejects a response replayed against a different request id", () => {
    expect(verify({ expectedRequestId: "some-other-request" })).toMatchObject({
      ok: false,
      failureCode: "DFLOW_REQUEST_ID_MISMATCH",
    });
  });

  it("rejects a signature that verifies under an attacker's key, not DFlow's", () => {
    // Same bytes, same everything — only the pinned key differs. A signature is
    // worth nothing if the key it is checked against is negotiable.
    expect(
      verify({ publicKeyBase58: "11111111111111111111111111111111" }),
    ).toMatchObject({ ok: false, failureCode: "DFLOW_SIGNATURE_KEY_UNPINNED" });
  });

  it("rejects a downgraded component set even when the maths would check out", () => {
    const downgraded = {
      ...headers,
      "signature-input": headers["signature-input"]!.replace(
        '("@status" "content-type" "content-digest" "x-request-id";req)',
        '("@status")',
      ),
    };
    expect(verify({ headers: downgraded })).toMatchObject({
      ok: false,
      failureCode: "DFLOW_SIGNATURE_COVERAGE_INSUFFICIENT",
    });
  });

  it("rejects a forged signature over an otherwise valid envelope", () => {
    const forged = {
      ...headers,
      signature: `sig1=:${Buffer.alloc(64, 7).toString("base64")}:`,
    };
    expect(verify({ headers: forged })).toMatchObject({
      ok: false,
      failureCode: "DFLOW_RESPONSE_SIGNATURE_INVALID",
    });
  });

  it("rejects a response with no signature at all rather than passing it through", () => {
    const { signature: _signature, ...unsigned } = headers;
    expect(verify({ headers: unsigned })).toMatchObject({
      ok: false,
      failureCode: "DFLOW_SIGNATURE_HEADER_MISSING",
    });
  });

  it("rejects a stale signature outside the freshness window", () => {
    const created = Number(/created=(\d+)/.exec(headers["signature-input"]!)![1]);
    expect(verify({ nowSeconds: created + 3_600 })).toMatchObject({
      ok: false,
      failureCode: "DFLOW_SIGNATURE_CREATED_OUT_OF_RANGE",
    });
    expect(verify({ nowSeconds: created + 5 })).toMatchObject({ ok: true });
  });

  it("reproduces the signature base byte-for-byte from the header metadata", () => {
    const parsed = parseSignatureInput(headers["signature-input"]!)!;
    const base = buildSignatureBase({
      status: fixture.response.status,
      contentType: headers["content-type"]!,
      contentDigest: headers["content-digest"]!,
      requestId,
      signatureParams: `(${parsed.components.join(" ")})${parsed.parameters}`,
    });
    expect(base.split("\n")[0]).toBe('"@status": 200');
    expect(base).toContain(`"x-request-id";req: ${requestId}`);
    expect(base.endsWith(headers["signature-input"]!.replace("sig1=", ""))).toBe(true);
  });
});
