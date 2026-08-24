export const RECEIPT_IMAGE_MAX_DIMENSION = 10_000;
export const RECEIPT_IMAGE_MAX_PIXELS = 25_000_000;

export type ReceiptImageInfo = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
};

function assertDimensions(info: ReceiptImageInfo): ReceiptImageInfo {
  if (
    !Number.isInteger(info.width) ||
    !Number.isInteger(info.height) ||
    info.width <= 0 ||
    info.height <= 0 ||
    info.width > RECEIPT_IMAGE_MAX_DIMENSION ||
    info.height > RECEIPT_IMAGE_MAX_DIMENSION ||
    info.width * info.height > RECEIPT_IMAGE_MAX_PIXELS
  ) {
    throw new Error("RECEIPT_IMAGE_DIMENSIONS_UNSUPPORTED");
  }
  return info;
}

function u16be(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 256 + bytes[offset + 1]!;
}

function u32be(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 0x1000000 + bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 + bytes[offset + 3]!;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function parseJpeg(bytes: Uint8Array): ReceiptImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++]!;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    const length = u16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (length < 7) break;
      return assertDimensions({
        mimeType: "image/jpeg",
        height: u16be(bytes, offset + 3),
        width: u16be(bytes, offset + 5),
      });
    }
    offset += length;
  }
  throw new Error("RECEIPT_IMAGE_HEADER_INVALID");
}

function parsePng(bytes: Uint8Array): ReceiptImageInfo | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((byte, index) => bytes[index] === byte)) return null;
  if (ascii(bytes, 12, 4) !== "IHDR") throw new Error("RECEIPT_IMAGE_HEADER_INVALID");
  return assertDimensions({
    mimeType: "image/png",
    width: u32be(bytes, 16),
    height: u32be(bytes, 20),
  });
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65536;
}

function parseWebp(bytes: Uint8Array): ReceiptImageInfo | null {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP"
  ) return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    return assertDimensions({
      mimeType: "image/webp",
      width: u24le(bytes, 24) + 1,
      height: u24le(bytes, 27) + 1,
    });
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return assertDimensions({
      mimeType: "image/webp",
      width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
      height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff,
    });
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return assertDimensions({
      mimeType: "image/webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    });
  }
  throw new Error("RECEIPT_IMAGE_HEADER_INVALID");
}

/** Proves declared type, magic bytes, dimensions and pixel budget together. */
export function inspectReceiptImage(bytes: ArrayBuffer, declaredMimeType: string): ReceiptImageInfo {
  const view = new Uint8Array(bytes);
  const info = parsePng(view) ?? parseJpeg(view) ?? parseWebp(view);
  if (!info) throw new Error("RECEIPT_IMAGE_HEADER_INVALID");
  if (info.mimeType !== declaredMimeType) {
    throw new Error("RECEIPT_IMAGE_TYPE_MISMATCH");
  }
  return info;
}
