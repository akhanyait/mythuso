/* A QR code, drawn from the standard rather than from a package.
 *
 * WHY THIS IS HERE AND NOT A DEPENDENCY. packages/catalog/open-source.json and the Master document's §15D
 * procurement rules forbid adopting a component before its licence, security, maintenance and data-flow reviews
 * exist, and none exists for a QR library. iOS draws the emergency card's code with CoreImage's
 * CIQRCodeGenerator, which ships with the operating system; the web and Android have nothing built in. A QR
 * encoder is a short, fully specified piece of arithmetic (ISO/IEC 18004), so it is written here, and ported
 * line for line to apps/android/app/src/main/java/za/co/mythuso/model/QrCode.kt.
 *
 * HOW IT IS KNOWN TO WORK. tests/fixtures/qr-vectors.txt holds the modules this encoder draws for a handful of
 * texts, and those codes were read back by the macOS Vision framework's barcode detector — an independent
 * decoder — on the day they were written. scripts/check-boundaries.mjs holds this file to those vectors on
 * every build, and the Android JVM test holds QrCode.kt to the same ones, so the three agree.
 *
 * WHAT IT DOES NOT DO. Byte mode only, error correction level M only, versions 1 to 10 only: up to 213 bytes,
 * which is four times what the card's sentence needs. It refuses a longer text rather than choosing a denser
 * code nobody has read back. It is not a scanner, and the card it draws opens nothing.
 */

export type QrCode = { readonly version: number; readonly mask: number; readonly size: number; readonly modules: readonly (readonly boolean[])[] };

export const QR_MAX_VERSION = 10;
/* Error correction level M: codewords per block and number of blocks, by version, from the standard's table. */
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/* Level M's two format bits. */
const LEVEL_M = 0;

const rawModules = (version: number): number => {
 let result = (16 * version + 128) * version + 64;
 if (version >= 2) {
  const align = Math.floor(version / 7) + 2;
  result -= (25 * align - 10) * align - 55;
  if (version >= 7) result -= 36;
 }
 return result;
};
const dataCodewords = (version: number): number => Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[version]! * BLOCKS[version]!;
export const qrCapacityBytes = (version: number): number => Math.floor((dataCodewords(version) * 8 - 4 - (version < 10 ? 8 : 16)) / 8);

/* Multiplication in GF(2^8) modulo x^8 + x^4 + x^3 + x^2 + 1. */
const multiply = (x: number, y: number): number => {
 let z = 0;
 for (let i = 7; i >= 0; i--) {
  z = (z << 1) ^ ((z >>> 7) * 0x11d);
  z ^= ((y >>> i) & 1) * x;
 }
 return z;
};
const divisor = (degree: number): number[] => {
 const result = new Array<number>(degree).fill(0);
 result[degree - 1] = 1;
 let root = 1;
 for (let i = 0; i < degree; i++) {
  for (let j = 0; j < degree; j++) {
   result[j] = multiply(result[j]!, root);
   if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!;
  }
  root = multiply(root, 0x02);
 }
 return result;
};
const remainder = (data: readonly number[], by: readonly number[]): number[] => {
 const result = new Array<number>(by.length).fill(0);
 for (const byte of data) {
  const factor = byte ^ result.shift()!;
  result.push(0);
  for (let i = 0; i < by.length; i++) result[i] = result[i]! ^ multiply(by[i]!, factor);
 }
 return result;
};

const alignmentPositions = (version: number, size: number): number[] => {
 if (version === 1) return [];
 const count = Math.floor(version / 7) + 2;
 const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
 const result = [6];
 for (let position = size - 7; result.length < count; position -= step) result.splice(1, 0, position);
 return result;
};

const masked = (mask: number, x: number, y: number): boolean => {
 switch (mask) {
  case 0: return (x + y) % 2 === 0;
  case 1: return y % 2 === 0;
  case 2: return x % 3 === 0;
  case 3: return (x + y) % 3 === 0;
  case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
  case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
  case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
  default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
 }
};

export function qrCode(text: string): QrCode {
 const bytes = [...new TextEncoder().encode(text)];
 let version = 1;
 while (version <= QR_MAX_VERSION && bytes.length > qrCapacityBytes(version)) version++;
 if (version > QR_MAX_VERSION) throw new Error(`A QR code this encoder draws holds ${qrCapacityBytes(QR_MAX_VERSION)} bytes at most, and this text is ${bytes.length}.`);

 /* The data: byte mode, the count, the bytes, a terminator, padding to a byte, then the two pad bytes in turn. */
 const capacity = dataCodewords(version) * 8;
 const bits: number[] = [];
 const push = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
 push(0b0100, 4);
 push(bytes.length, version < 10 ? 8 : 16);
 for (const byte of bytes) push(byte, 8);
 push(0, Math.min(4, capacity - bits.length));
 push(0, (8 - (bits.length % 8)) % 8);
 for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
 const data: number[] = [];
 for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));

 /* Error correction per block, then the blocks interleaved. A short block carries a pad where a long one has
    its extra data byte, and the pad is skipped when interleaving. */
 const blockCount = BLOCKS[version]!;
 const eccLength = ECC_PER_BLOCK[version]!;
 const raw = Math.floor(rawModules(version) / 8);
 const shortBlocks = blockCount - (raw % blockCount);
 const shortLength = Math.floor(raw / blockCount);
 const by = divisor(eccLength);
 const blocks: number[][] = [];
 for (let i = 0, k = 0; i < blockCount; i++) {
  const block = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
  k += block.length;
  const ecc = remainder(block, by);
  if (i < shortBlocks) block.push(0);
  blocks.push([...block, ...ecc]);
 }
 const codewords: number[] = [];
 for (let i = 0; i < blocks[0]!.length; i++) {
  for (let j = 0; j < blocks.length; j++) if (i !== shortLength - eccLength || j >= shortBlocks) codewords.push(blocks[j]![i]!);
 }

 /* The function patterns: timing, three finders, alignment, format and version. */
 const size = version * 4 + 17;
 const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
 const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
 const set = (x: number, y: number, dark: boolean) => { modules[y]![x] = dark; fixed[y]![x] = true; };
 for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
 const finder = (cx: number, cy: number) => {
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
   const x = cx + dx, y = cy + dy;
   if (x < 0 || x >= size || y < 0 || y >= size) continue;
   const distance = Math.max(Math.abs(dx), Math.abs(dy));
   set(x, y, distance !== 2 && distance !== 4);
  }
 };
 finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
 const positions = alignmentPositions(version, size);
 for (let i = 0; i < positions.length; i++) for (let j = 0; j < positions.length; j++) {
  const last = positions.length - 1;
  if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(positions[i]! + dx, positions[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
 }
 const drawFormat = (mask: number) => {
  const value = (LEVEL_M << 3) | mask;
  let rem = value;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const format = ((value << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((format >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);
 };
 drawFormat(0);
 if (version >= 7) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bitsOfVersion = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
   const dark = ((bitsOfVersion >>> i) & 1) !== 0;
   const a = size - 11 + (i % 3), b = Math.floor(i / 3);
   set(a, b, dark); set(b, a, dark);
  }
 }

 /* The codewords, in two-module columns zigzagging up and down from the bottom right, round the timing column. */
 let bit = 0;
 for (let right = size - 1; right >= 1; right -= 2) {
  if (right === 6) right = 5;
  for (let vertical = 0; vertical < size; vertical++) {
   for (let j = 0; j < 2; j++) {
    const x = right - j;
    const upward = ((right + 1) & 2) === 0;
    const y = upward ? size - 1 - vertical : vertical;
    if (!fixed[y]![x] && bit < codewords.length * 8) {
     modules[y]![x] = ((codewords[bit >>> 3]! >>> (7 - (bit & 7))) & 1) !== 0;
     bit++;
    }
   }
  }
 }

 /* Each of the eight masks is tried and the one the standard's penalty rules score lowest is kept. */
 const applyMask = (mask: number) => {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y]![x] && masked(mask, x, y)) modules[y]![x] = !modules[y]![x];
 };
 const penalty = (): number => {
  let score = 0;
  const addHistory = (run: number, history: number[]) => {
   if (history[0] === 0) run += size;
   history.pop();
   history.unshift(run);
  };
  const countPatterns = (history: readonly number[]): number => {
   const n = history[1]!;
   const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
   return (core && history[0]! >= n * 4 && history[6]! >= n ? 1 : 0) + (core && history[6]! >= n * 4 && history[0]! >= n ? 1 : 0);
  };
  const terminate = (colour: boolean, run: number, history: number[]): number => {
   if (colour) { addHistory(run, history); run = 0; }
   addHistory(run + size, history);
   return countPatterns(history);
  };
  const line = (at: (i: number) => boolean) => {
   let colour = false, run = 0;
   const history = [0, 0, 0, 0, 0, 0, 0];
   for (let i = 0; i < size; i++) {
    if (at(i) === colour) {
     run++;
     if (run === 5) score += 3;
     else if (run > 5) score++;
    } else {
     addHistory(run, history);
     if (!colour) score += countPatterns(history) * 40;
     colour = at(i);
     run = 1;
    }
   }
   score += terminate(colour, run, history) * 40;
  };
  for (let y = 0; y < size; y++) line(x => modules[y]![x]!);
  for (let x = 0; x < size; x++) line(y => modules[y]![x]!);
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
   const colour = modules[y]![x];
   if (colour === modules[y]![x + 1] && colour === modules[y + 1]![x] && colour === modules[y + 1]![x + 1]) score += 3;
  }
  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
 };
 let best = 0, bestScore = Number.POSITIVE_INFINITY;
 for (let mask = 0; mask < 8; mask++) {
  applyMask(mask);
  drawFormat(mask);
  const score = penalty();
  if (score < bestScore) { best = mask; bestScore = score; }
  applyMask(mask);
 }
 applyMask(best);
 drawFormat(best);
 return { version, mask: best, size, modules };
}

/* The dark modules as one SVG path, each a unit square, offset by the four-module quiet zone the standard asks
   for around a code. A path rather than a rect per module, so a card is one element a screen reader names once. */
export const QR_QUIET_ZONE = 4;
export function qrPath(code: QrCode): string {
 const parts: string[] = [];
 code.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) parts.push(`M${x + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h1v1h-1z`); }));
 return parts.join('');
}

/* One line per row, "1" for a dark module, as tests/fixtures/qr-vectors.txt keeps them. */
export const qrRows = (code: QrCode): string[] => code.modules.map(row => row.map(dark => (dark ? '1' : '0')).join(''));
