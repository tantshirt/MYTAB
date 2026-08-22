/**
 * Byte-mode QR, ECC M, versions 1–10.
 *
 * Encodes the invite deep link so the person across the table can scan the
 * same token the share sheet sends (D-24). No dependency: CLAUDE.md forbids
 * adding one without an owner and a removal plan.
 */

const ECC_M_CODEWORDS = [0, 10, 16, 26, 36, 46, 60, 66, 86, 100, 122] as const;
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346] as const;
const ECC_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5] as const;

const ALIGNMENT: Record<number, number[]> = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    EXP[i] = EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  return EXP[LOG[a]! + LOG[b]!];
}

function rsGenerator(degree: number): Uint8Array {
  const poly = new Uint8Array(degree + 1);
  poly[0] = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = i; j >= 0; j -= 1) {
      poly[j + 1] ^= gfMul(poly[j]!, EXP[i]!);
    }
  }
  return poly;
}

function rsEncode(data: Uint8Array, degree: number): Uint8Array {
  const gen = rsGenerator(degree);
  const ecc = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ ecc[0]!;
    ecc.copyWithin(0, 1);
    ecc[degree - 1] = 0;
    if (factor === 0) {
      continue;
    }
    for (let j = 0; j < degree; j += 1) {
      ecc[j] ^= gfMul(gen[j + 1]!, factor);
    }
  }
  return ecc;
}

function sizeForVersion(version: number): number {
  return 17 + 4 * version;
}

function pickVersion(byteLength: number): number {
  for (let version = 1; version <= 10; version += 1) {
    const dataCapacity = TOTAL_CODEWORDS[version]! - ECC_M_CODEWORDS[version]!;
    // mode (4) + length (8) + data + terminator, in bytes after bit packing
    const needed = byteLength + 2;
    if (needed <= dataCapacity) {
      return version;
    }
  }
  throw new Error("QR_TOO_LONG");
}

function buildBitStream(bytes: Uint8Array, version: number): number[] {
  const dataCapacity = TOTAL_CODEWORDS[version]! - ECC_M_CODEWORDS[version]!;
  const bits: number[] = [];
  const push = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i -= 1) {
      bits.push((value >> i) & 1);
    }
  };

  push(0b0100, 4);
  push(bytes.length, 8);
  for (const byte of bytes) {
    push(byte, 8);
  }
  const capacityBits = dataCapacity * 8;
  const term = Math.min(4, capacityBits - bits.length);
  push(0, term);
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  const pad = [0b11101100, 0b00010001];
  let padIndex = 0;
  while (bits.length < capacityBits) {
    push(pad[padIndex % 2]!, 8);
    padIndex += 1;
  }
  return bits.slice(0, capacityBits);
}

function bitsToBytes(bits: number[]): Uint8Array {
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i += 1) {
    let value = 0;
    for (let b = 0; b < 8; b += 1) {
      value = (value << 1) | bits[i * 8 + b]!;
    }
    out[i] = value;
  }
  return out;
}

function interleave(data: Uint8Array, version: number): Uint8Array {
  const eccCount = ECC_M_CODEWORDS[version]!;
  const blockCount = ECC_BLOCKS[version]!;
  const total = TOTAL_CODEWORDS[version]!;
  const dataTotal = total - eccCount;
  const shortBlocks = blockCount - (dataTotal % blockCount);
  const shortLen = Math.floor(dataTotal / blockCount);
  const longLen = shortLen + 1;
  const eccLen = eccCount / blockCount;

  const blocks: Array<{ data: Uint8Array; ecc: Uint8Array }> = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i += 1) {
    const len = i < shortBlocks ? shortLen : longLen;
    const chunk = data.subarray(offset, offset + len);
    offset += len;
    blocks.push({ data: chunk, ecc: rsEncode(chunk, eccLen) });
  }

  const out = new Uint8Array(total);
  let pos = 0;
  const maxData = longLen;
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) {
        out[pos] = block.data[i]!;
        pos += 1;
      }
    }
  }
  for (let i = 0; i < eccLen; i += 1) {
    for (const block of blocks) {
      out[pos] = block.ecc[i]!;
      pos += 1;
    }
  }
  return out;
}

type Module = 0 | 1 | 2; // 0 light, 1 dark, 2 reserved/function

function placeFinders(grid: Module[][], size: number): void {
  const draw = (row: number, col: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) {
          continue;
        }
        const dark =
          r === -1 ||
          c === -1 ||
          r === 7 ||
          c === 7 ||
          (r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        grid[rr]![cc] = (dark ? 1 : 0) as Module;
      }
    }
  };
  draw(0, 0);
  draw(0, size - 7);
  draw(size - 7, 0);
}

function placeTiming(grid: Module[][], size: number): void {
  for (let i = 8; i < size - 8; i += 1) {
    const bit = (i % 2 === 0 ? 1 : 0) as Module;
    grid[6]![i] = bit;
    grid[i]![6] = bit;
  }
}

function placeAlignment(grid: Module[][], version: number): void {
  const positions = ALIGNMENT[version];
  if (!positions) {
    return;
  }
  for (const row of positions) {
    for (const col of positions) {
      if ((row === 6 && col === 6) || (row === 6 && col === positions[positions.length - 1]) || (col === 6 && row === positions[positions.length - 1] && positions[positions.length - 1] !== 6)) {
        continue;
      }
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const dark = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
          grid[row + r]![col + c] = (dark ? 1 : 0) as Module;
        }
      }
    }
  }
}

function reserveFormat(grid: Module[][], size: number): void {
  for (let i = 0; i < 9; i += 1) {
    if (grid[8]![i] === undefined || i === 6) {
      /* keep timing */
    }
    if (i !== 6) {
      grid[8]![i] = 2;
      grid[i]![8] = 2;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    grid[8]![size - 1 - i] = 2;
    grid[size - 1 - i]![8] = 2;
  }
  grid[size - 8]![8] = 1;
}

function maskBit(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function placeData(grid: Module[][], size: number, bytes: Uint8Array, mask: number): void {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i -= 1) {
      bits.push((byte >> i) & 1);
    }
  }
  let bit = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) {
      col -= 1;
    }
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (grid[row]![c] !== undefined) {
          continue;
        }
        let dark = bits[bit] === 1;
        bit += 1;
        if (maskBit(mask, row, c)) {
          dark = !dark;
        }
        grid[row]![c] = (dark ? 1 : 0) as Module;
      }
    }
    upward = !upward;
  }
}

const FORMAT_MASK = 0b101010000010010;

function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // ECC M = 00
  let bits = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i -= 1) {
    if ((bits >> i) & 1) {
      bits ^= gen << (i - 10);
    }
  }
  return ((data << 10) | bits) ^ FORMAT_MASK;
}

function placeFormat(grid: Module[][], size: number, mask: number): void {
  const bits = formatBits(mask);
  const positions: Array<[number, number]> = [];
  for (let i = 0; i < 6; i += 1) {
    positions.push([8, i]);
  }
  positions.push([8, 7], [8, 8], [7, 8]);
  for (let i = 5; i >= 0; i -= 1) {
    positions.push([i, 8]);
  }
  for (let i = 0; i < 8; i += 1) {
    grid[positions[i]![0]]![positions[i]![1]] = (((bits >> (14 - i)) & 1) as Module);
  }
  for (let i = 0; i < 7; i += 1) {
    grid[positions[8 + i]![0]]![positions[8 + i]![1]] = (((bits >> (6 - i)) & 1) as Module);
  }

  for (let i = 0; i < 8; i += 1) {
    grid[8]![size - 1 - i] = (((bits >> (14 - i)) & 1) as Module);
  }
  for (let i = 0; i < 7; i += 1) {
    grid[size - 7 + i]![8] = (((bits >> (6 - i)) & 1) as Module);
  }
}

function penalty(modules: boolean[][]): number {
  const n = modules.length;
  let score = 0;
  const run = (line: boolean[]) => {
    let count = 1;
    for (let i = 1; i <= line.length; i += 1) {
      if (i < line.length && line[i] === line[i - 1]) {
        count += 1;
        continue;
      }
      if (count >= 5) {
        score += 3 + (count - 5);
      }
      count = 1;
    }
  };
  for (let r = 0; r < n; r += 1) {
    run(modules[r]!);
    const col = modules.map((row) => row[r]!);
    run(col);
  }
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const v = modules[r]![c];
      if (v === modules[r]![c + 1] && v === modules[r + 1]![c] && v === modules[r + 1]![c + 1]) {
        score += 3;
      }
    }
  }
  let dark = 0;
  for (const row of modules) {
    for (const cell of row) {
      if (cell) {
        dark += 1;
      }
    }
  }
  const percent = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

function toBool(grid: Module[][]): boolean[][] {
  return grid.map((row) => row.map((cell) => cell === 1));
}

/** Module matrix, dark = true. Quiet zone is not included. */
export function encodeQrModules(value: string): boolean[][] {
  const bytes = new TextEncoder().encode(value);
  const version = pickVersion(bytes.length);
  const size = sizeForVersion(version);
  const stream = bitsToBytes(buildBitStream(bytes, version));
  const codewords = interleave(stream, version);

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const grid: Module[][] = Array.from({ length: size }, () => Array<Module>(size).fill(undefined as unknown as Module));
    placeFinders(grid, size);
    placeTiming(grid, size);
    placeAlignment(grid, version);
    reserveFormat(grid, size);
    placeData(grid, size, codewords, mask);
    placeFormat(grid, size, mask);
    const modules = toBool(grid);
    const score = penalty(modules);
    if (score < bestScore) {
      bestScore = score;
      best = modules;
    }
  }
  return best!;
}

export function qrVersionFor(value: string): number {
  return pickVersion(new TextEncoder().encode(value).length);
}
