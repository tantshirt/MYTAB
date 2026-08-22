import { bytesToBase64 } from "./convexCrypto";

type EcJwk = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
};

/** Parses a PEM EC P-256 SPKI public key into a JWK (Convex-safe, no Node APIs). */
export function pemEcP256PublicKeyToJwk(pem: string): EcJwk {
  const der = pemToSpkiDer(pem);
  const point = parseSpkiEcP256Point(der);
  const x = point.slice(1, 33);
  const y = point.slice(33, 65);
  return {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
  };
}

/** Builds a base64 data URI JWKS from a PEM EC P-256 public key. */
export function pemEcP256PublicKeyToJwksDataUri(
  verificationKeyPem: string,
  kid = "privy-app-key",
): string {
  const jwk = pemEcP256PublicKeyToJwk(verificationKeyPem);
  const jwks = {
    keys: [
      {
        ...jwk,
        kid,
        use: "sig",
        alg: "ES256",
      },
    ],
  };
  const base64 = bytesToBase64(new TextEncoder().encode(JSON.stringify(jwks)));
  return `data:application/json;base64,${base64}`;
}

function pemToSpkiDer(pem: string): Uint8Array {
  const body = pem
    .trim()
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function parseSpkiEcP256Point(der: Uint8Array): Uint8Array {
  let offset = 0;
  if (der[offset] !== 0x30) {
    throw new Error("Invalid SPKI: expected SEQUENCE");
  }
  offset += 1;
  offset += readLength(der, offset).bytesRead;

  if (der[offset] !== 0x30) {
    throw new Error("Invalid SPKI: expected algorithm SEQUENCE");
  }
  const algSeq = readLength(der, offset + 1);
  offset += 1 + algSeq.bytesRead + algSeq.length;

  if (der[offset] !== 0x03) {
    throw new Error("Invalid SPKI: expected BIT STRING");
  }
  offset += 1;
  const bitString = readLength(der, offset);
  offset += bitString.bytesRead;

  const unusedBits = der[offset];
  if (unusedBits !== 0x00) {
    throw new Error("Invalid SPKI: unsupported unused bits");
  }

  const point = der.slice(offset + 1, offset + bitString.length);
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error("Invalid SPKI: expected uncompressed P-256 point");
  }
  return point;
}

function readLength(
  der: Uint8Array,
  offset: number,
): { length: number; bytesRead: number } {
  const first = der[offset];
  if (first === undefined) {
    throw new Error("Invalid DER length");
  }
  if ((first & 0x80) === 0) {
    return { length: first, bytesRead: 1 };
  }
  const byteCount = first & 0x7f;
  let length = 0;
  for (let i = 0; i < byteCount; i += 1) {
    length = (length << 8) | der[offset + 1 + i]!;
  }
  return { length, bytesRead: 1 + byteCount };
}

function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
