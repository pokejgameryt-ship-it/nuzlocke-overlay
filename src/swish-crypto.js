/**
 * SwishCrypto - Sw/Sh Save File Decryption
 * Following PKHeX's implementation exactly
 * 
 * Flow:
 * 1. Verify SHA256 hash (IntroHash + payload + OutroHash)
 * 2. Apply static XOR pad to payload (everything except last 32-byte hash)
 * 3. Parse SCBlocks sequentially
 * 4. Each SCBlock: key (4B plain) + type (1B XORed) + data (variable, XORed)
 */

const crypto = require('crypto');

// Static XOR pad (128 bytes, last byte is 0x00)
const STATIC_XORPAD = Buffer.from([
  0xA0, 0x92, 0xD1, 0x06, 0x07, 0xDB, 0x32, 0xA1, 0xAE, 0x01, 0xF5, 0xC5, 0x1E, 0x84, 0x4F, 0xE3,
  0x53, 0xCA, 0x37, 0xF4, 0xA7, 0xB0, 0x4D, 0xA0, 0x18, 0xB7, 0xC2, 0x97, 0xDA, 0x5F, 0x53, 0x2B,
  0x75, 0xFA, 0x48, 0x16, 0xF8, 0xD4, 0x8A, 0x6F, 0x61, 0x05, 0xF4, 0xE2, 0xFD, 0x04, 0xB5, 0xA3,
  0x0F, 0xFC, 0x44, 0x92, 0xCB, 0x32, 0xE6, 0x1B, 0xB9, 0xB1, 0x2E, 0x01, 0xB0, 0x56, 0x53, 0x36,
  0xD2, 0xD1, 0x50, 0x3D, 0xDE, 0x5B, 0x2E, 0x0E, 0x52, 0xFD, 0xDF, 0x2F, 0x7B, 0xCA, 0x63, 0x50,
  0xA4, 0x67, 0x5D, 0x23, 0x17, 0xC0, 0x52, 0xE1, 0xA6, 0x30, 0x7C, 0x2B, 0xB6, 0x70, 0x36, 0x5B,
  0x2A, 0x27, 0x69, 0x33, 0xF5, 0x63, 0x7B, 0x36, 0x3F, 0x26, 0x9B, 0xA3, 0xED, 0x7A, 0x53, 0x00,
  0xA4, 0x48, 0xB3, 0x50, 0x9E, 0x14, 0xA0, 0x52, 0xDE, 0x7E, 0x10, 0x2B, 0x1B, 0x77, 0x6E, 0x00,
]);

const INTRO_HASH_BYTES = Buffer.from([
  0x9E, 0xC9, 0x9C, 0xD7, 0x0E, 0xD3, 0x3C, 0x44, 0xFB, 0x93, 0x03, 0xDC, 0xEB, 0x39, 0xB4, 0x2A,
  0x19, 0x47, 0xE9, 0x63, 0x4B, 0xA2, 0x33, 0x44, 0x16, 0xBF, 0x82, 0xA2, 0xBA, 0x63, 0x55, 0xB6,
  0x3D, 0x9D, 0xF2, 0x4B, 0x5F, 0x7B, 0x6A, 0xB2, 0x62, 0x1D, 0xC2, 0x1B, 0x68, 0xE5, 0xC8, 0xB5,
  0x3A, 0x05, 0x90, 0x00, 0xE8, 0xA8, 0x10, 0x3D, 0xE2, 0xEC, 0xF0, 0x0C, 0xB2, 0xED, 0x4F, 0x6D,
]);

const OUTRO_HASH_BYTES = Buffer.from([
  0xD6, 0xC0, 0x1C, 0x59, 0x8B, 0xC8, 0xB8, 0xCB, 0x46, 0xE1, 0x53, 0xFC, 0x82, 0x8C, 0x75, 0x75,
  0x13, 0xE0, 0x45, 0xDF, 0x32, 0x69, 0x3C, 0x75, 0xF0, 0x59, 0xF8, 0xD9, 0xA2, 0x5F, 0xB2, 0x17,
  0xE0, 0x80, 0x52, 0xDB, 0xEA, 0x89, 0x73, 0x99, 0x75, 0x79, 0xAF, 0xCB, 0x2E, 0x80, 0x07, 0xE6,
  0xF1, 0x26, 0xE0, 0x03, 0x0A, 0xE6, 0x6F, 0xF6, 0x41, 0xBF, 0x7E, 0x59, 0xC2, 0xAE, 0x55, 0xFD,
]);

// SCTypeCode enum
const SCTypeCode = {
  None: 0, Bool1: 1, Bool2: 2, Bool3: 3, Object: 4, Array: 5,
  Byte: 8, UInt16: 9, UInt32: 10, UInt64: 11,
  SByte: 12, Int16: 13, Int32: 14, Int64: 15, Single: 16, Double: 17,
};

function scTypeSize(type) {
  switch (type) {
    case SCTypeCode.Byte: case SCTypeCode.SByte: case SCTypeCode.Bool3: return 1;
    case SCTypeCode.UInt16: case SCTypeCode.Int16: return 2;
    case SCTypeCode.UInt32: case SCTypeCode.Int32: case SCTypeCode.Single: return 4;
    case SCTypeCode.UInt64: case SCTypeCode.Int64: case SCTypeCode.Double: return 8;
    default: return 0;
  }
}

// ============================================================
// SCXorShift32 PRNG (EXACT match to PKHeX)
// ============================================================
class SCXorShift32 {
  constructor(seed) {
    this.counter = 0;
    this.state = this._getInitialState(seed >>> 0);
  }

  static _xorshiftAdvance(state) {
    state = state >>> 0;
    state = (state ^ ((state << 2) >>> 0)) >>> 0;
    state = (state ^ (state >>> 15)) >>> 0;
    state = (state ^ ((state << 13) >>> 0)) >>> 0;
    return state;
  }

  static _popCount32(x) {
    x = x >>> 0;
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
  }

  _getInitialState(state) {
    state = state >>> 0;
    const popCount = SCXorShift32._popCount32(state);
    for (let i = 0; i < popCount; i++) {
      state = SCXorShift32._xorshiftAdvance(state);
    }
    return state;
  }

  next() {
    const c = this.counter;
    const result = (this.state >>> (c * 8)) & 0xFF;
    if (c === 3) {
      this.state = SCXorShift32._xorshiftAdvance(this.state);
      this.counter = 0;
    } else {
      this.counter++;
    }
    return result;
  }

  next32() {
    return this.next() | (this.next() << 8) | (this.next() << 16) | (this.next() << 24);
  }
}

// ============================================================
// Static XOR pad application
// ============================================================
function cryptStaticXorpadBytes(data) {
  const xp = STATIC_XORPAD;
  const size = xp.length - 1; // 127
  let iterations = Math.floor((data.length - 1) / size);
  let offset = 0;
  do {
    const chunkLen = Math.min(xp.length, data.length - offset);
    for (let i = 0; i < chunkLen; i++) data[offset + i] ^= xp[i];
    offset += size;
    iterations--;
  } while (iterations > 0);
  const remaining = data.length - offset;
  for (let i = 0; i < remaining; i++) data[offset + i] ^= xp[i];
}

// ============================================================
// Hash validation
// ============================================================
function computeHash(data) {
  const h = crypto.createHash('sha256');
  h.update(INTRO_HASH_BYTES);
  h.update(data);
  h.update(OUTRO_HASH_BYTES);
  return h.digest();
}

function isHashValid(data) {
  const payload = data.slice(0, data.length - 32);
  const computed = computeHash(payload);
  const stored = data.slice(data.length - 32);
  return computed.equals(stored);
}

// ============================================================
// SCBlock reading
// ============================================================
function readBlocks(data) {
  const result = [];
  let offset = 0;
  while (offset < data.length - 4) {
    const key = data.readUInt32LE(offset);
    offset += 4;
    try {
      const block = readBlockFromOffset(data, key, offset);
      result.push(block);
      offset = block.endOffset;
    } catch (e) {
      break;
    }
  }
  return result;
}

function readBlockFromOffset(data, key, offset) {
  const xk = new SCXorShift32(key);
  const type = data[offset++] ^ xk.next();
  const block = { key, type, data: null, endOffset: offset };

  switch (type) {
    case SCTypeCode.Bool1: case SCTypeCode.Bool2: case SCTypeCode.Bool3:
      block.data = Buffer.alloc(0);
      break;
    case SCTypeCode.Object: {
      const numBytes = (data.readUInt32LE(offset) ^ xk.next32()) >>> 0;
      offset += 4;
      if (numBytes > data.length - offset) throw new Error('Invalid Object size');
      const arr = Buffer.alloc(numBytes);
      for (let i = 0; i < numBytes; i++) arr[i] = data[offset + i] ^ xk.next();
      offset += numBytes;
      block.data = arr;
      break;
    }
    case SCTypeCode.Array: {
      const numEntries = (data.readUInt32LE(offset) ^ xk.next32()) >>> 0;
      offset += 4;
      const subType = data[offset++] ^ xk.next();
      const subSize = scTypeSize(subType);
      const numBytes = numEntries * subSize;
      if (numBytes > data.length - offset) throw new Error('Invalid Array size');
      const arr = Buffer.alloc(numBytes);
      for (let i = 0; i < numBytes; i++) arr[i] = data[offset + i] ^ xk.next();
      offset += numBytes;
      block.data = arr;
      block.subType = subType;
      break;
    }
    default: {
      if (type < SCTypeCode.Byte) throw new Error(`Invalid type: ${type}`);
      const numBytes = scTypeSize(type);
      const arr = Buffer.alloc(numBytes);
      for (let i = 0; i < numBytes; i++) arr[i] = data[offset + i] ^ xk.next();
      offset += numBytes;
      block.data = arr;
      break;
    }
  }
  block.endOffset = offset;
  return block;
}

// ============================================================
// PK8 Constants and Decryption
// ============================================================
const SIZE_8BLOCK = 80;
const BlockCount = 4;
const SIZE_8STORED = 8 + (BlockCount * SIZE_8BLOCK); // 0x148 = 328
const SIZE_8PARTY = SIZE_8STORED + 0x10; // 0x158 = 344

// BlockPosition table from PKHeX PokeCrypto.cs (32 shuffles, duplicates of 0-7 for sv 24-31)
const BlockPosition = [
  0, 1, 2, 3, 0, 1, 3, 2, 0, 2, 1, 3, 0, 3, 1, 2,
  0, 2, 3, 1, 0, 3, 2, 1, 1, 0, 2, 3, 1, 0, 3, 2,
  2, 0, 1, 3, 3, 0, 1, 2, 2, 0, 3, 1, 3, 0, 2, 1,
  1, 2, 0, 3, 1, 3, 0, 2, 2, 1, 0, 3, 3, 1, 0, 2,
  2, 3, 0, 1, 3, 2, 0, 1, 1, 2, 3, 0, 1, 3, 2, 0,
  2, 1, 3, 0, 3, 1, 2, 0, 2, 3, 1, 0, 3, 2, 1, 0,
  // duplicates of 0-7 to eliminate modulus (32 => 24)
  0, 1, 2, 3, 0, 1, 3, 2, 0, 2, 1, 3, 0, 3, 1, 2,
  0, 2, 3, 1, 0, 3, 2, 1, 1, 0, 2, 3, 1, 0, 3, 2,
];

function cryptArray(data, seed) {
  for (let i = 0; i < data.length; i += 2) {
    seed = (Math.imul(0x41C64E6D, seed) + 0x6073) >>> 0;
    const xor16 = (seed >> 16) & 0xFFFF;
    const val = data.readUInt16LE(i);
    data.writeUInt16LE(val ^ xor16, i);
  }
}

function shuffle8(data, sv) {
  if (sv === 0) return;
  const blockSize = SIZE_8BLOCK;
  const perm = [0, 1, 2, 3];
  const slotOf = [0, 1, 2, 3];
  const shuffle = BlockPosition.slice(sv * BlockCount, sv * BlockCount + BlockCount);

  for (let i = 0; i < BlockCount - 1; i++) {
    const desired = shuffle[i];
    const j = slotOf[desired];
    if (j === i) continue;

    const offsetA = i * blockSize;
    const offsetB = j * blockSize;
    for (let k = 0; k < blockSize; k++) {
      const tmp = data[offsetA + k];
      data[offsetA + k] = data[offsetB + k];
      data[offsetB + k] = tmp;
    }

    const blockAtI = perm[i];
    perm[j] = blockAtI;
    slotOf[blockAtI] = j;
  }
}

function decryptPK8(rawData) {
  const data = Buffer.from(rawData);
  const pv = data.readUInt32LE(0);
  const sv = (pv >> 13) & 31;

  const storedRegion = data.subarray(8, SIZE_8STORED);
  cryptArray(storedRegion, pv);

  if (data.length > SIZE_8STORED) {
    const partyRegion = data.subarray(SIZE_8STORED, SIZE_8PARTY);
    cryptArray(partyRegion, pv);
  }

  const shuffleRegion = data.subarray(8, SIZE_8STORED);
  shuffle8(shuffleRegion, sv);

  return data;
}

// ============================================================
// Known Sw/Sh Block Keys (from SaveBlockAccessor8SWSH.cs)
// ============================================================
const KParty = 0x2985FE5D;
const KMyStatus = 0xF25C070E;

// ============================================================
// Public API
// ============================================================
class SwishCrypto {
  /**
   * Check if data is a valid SwishCrypto-encrypted save
   */
  static isValid(data) {
    if (!data || data.length < 64) return false;
    return isHashValid(data);
  }

  /**
   * Decrypt a SwishCrypto save and return SCBlocks
   * @param {Buffer} data - Raw save file data
   * @returns {Array} Array of SCBlock objects
   */
  static decrypt(data) {
    const payload = Buffer.from(data.slice(0, data.length - 32));
    cryptStaticXorpadBytes(payload);
    return readBlocks(payload);
  }

  /**
   * Get party data from SCBlocks
   * @param {Array} blocks - Array of SCBlock objects
   * @returns {{ partyCount: number, pokemon: Array<Buffer> }}
   */
  static getParty(blocks) {
    const partyBlock = blocks.find(b => b.key === KParty);
    if (!partyBlock || partyBlock.type !== SCTypeCode.Object) return null;

    const data = partyBlock.data;
    const countOffset = 6 * SIZE_8PARTY;
    const partyCount = data[countOffset];

    const pokemon = [];
    for (let i = 0; i < Math.min(partyCount, 6); i++) {
      const offset = i * SIZE_8PARTY;
      pokemon.push(data.subarray(offset, offset + SIZE_8PARTY));
    }

    return { partyCount, pokemon };
  }

  /**
   * Get trainer info from SCBlocks
   * @param {Array} blocks - Array of SCBlock objects
   * @returns {{ otName: string }}
   */
  static getTrainerInfo(blocks) {
    const myStatusBlock = blocks.find(b => b.key === KMyStatus);
    if (!myStatusBlock || myStatusBlock.type !== SCTypeCode.Object) return null;

    const data = myStatusBlock.data;
    let otName = '';
    for (let j = 0; j < data.length && j < 0x1A; j += 2) {
      const ch = data.readUInt16LE(j);
      if (ch === 0) break;
      otName += String.fromCharCode(ch);
    }

    return { otName };
  }

  /**
   * Decrypt a single PK8 Pokemon
   * @param {Buffer} rawData - Encrypted PK8 data (SIZE_8PARTY bytes)
   * @returns {Buffer} Decrypted PK8 data
   */
  static decryptPK8(rawData) {
    return decryptPK8(rawData);
  }

  static get SIZE_8PARTY() { return SIZE_8PARTY; }
  static get SIZE_8STORED() { return SIZE_8STORED; }
}

module.exports = SwishCrypto;
