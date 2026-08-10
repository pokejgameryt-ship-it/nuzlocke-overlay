const Logger = require('./logger');
const SwishCrypto = require('./swish-crypto');

class SaveParser {
  static parse(buffer, gameInfo) {
    if (!buffer || !gameInfo || typeof gameInfo.generation !== 'number') {
      Logger.error('Parser', 'parse() called with invalid args', {
        hasBuffer: !!buffer,
        bufferSize: buffer ? buffer.length : 0,
        gameInfo
      });
      return [];
    }

    Logger.info('Parser', `Parsing save: ${buffer.length} bytes, gen=${gameInfo.generation}, game=${gameInfo.version || gameInfo.game || '?'}`);

    let data = buffer;

    const firstBytes = Array.from(buffer.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    Logger.debug('Parser', `First 32 bytes: ${firstBytes}`);

    // Detect and handle .dsv (DeSmuME) format
    const trimmed = SaveParser.trimDsvFormat(data);
    if (trimmed.length < data.length) {
      Logger.info('Parser', `Trimmed .dsv footer: ${data.length} -> ${trimmed.length} bytes (removed ${data.length - trimmed.length} bytes)`);
      data = trimmed;
    }

    // Also detect standard DeSmuME DSTK header
    if (data.length > 0x200) {
      const header = data.slice(0, 16).toString('ascii');
      if (header.includes('DSTK') || header.includes('DESMUME')) {
        data = data.slice(0x200);
        Logger.info('Parser', `Detected DSTK header, skipping 512 bytes. Remaining: ${data.length}`);
      } else if (data.readUInt32LE(0) === 0x4445534D) {
        data = data.slice(0x200);
        Logger.info('Parser', `Detected DESM header, skipping 512 bytes. Remaining: ${data.length}`);
      }
    }

    Logger.info('Parser', `Final data size: ${data.length} bytes, dispatching to gen${gameInfo.generation} parser`);

    let result;
    switch (gameInfo.generation) {
      case 1: result = SaveParser.parseGen1(data); break;
      case 2: result = SaveParser.parseGen2(data); break;
      case 3: result = SaveParser.parseGen3(data); break;
      case 4: result = SaveParser.parseGen4(data); break;
      case 5: result = SaveParser.parseGen5(data); break;
      case 6: result = SaveParser.parseGen6(data); break;
      case 7: result = SaveParser.parseGen7(data); break;
      case 8: result = SaveParser.parseGen8(data, gameInfo); break;
      case 9: result = SaveParser.parseGen9(data); break;
      default:
        Logger.error('Parser', `Unsupported generation: ${gameInfo.generation}`);
        result = [];
    }

    Logger.info('Parser', `Parse result: ${result.length} Pokemon found`);
    result.forEach((p, i) => {
      Logger.info('Parser', `  P${i + 1}: species=${p.speciesId} nickname="${p.nickname}" level=${p.level} shiny=${p.isShiny} form=${p.form}`);
    });

    return result;
  }

  static trimDsvFormat(buffer) {
    if (buffer.length < 128) return buffer;

    // Check for DeSmuME footer at the end: "|-DESMUME SAVE-|" or similar
    const tail = buffer.slice(Math.max(0, buffer.length - 256)).toString('ascii');
    if (tail.includes('-DESMUME SAVE-') || tail.includes('DESMUME SAVE')) {
      const footerIdx = buffer.length - 256 + tail.indexOf('-DESMUME SAVE');
      // Footer starts a few bytes before the marker
      const trimTo = Math.max(0, footerIdx - 20);
      console.log(`[SaveParser] Found DeSmuME footer at offset 0x${footerIdx.toString(16)}, trimming to 0x${trimTo.toString(16)}`);
      return buffer.slice(0, trimTo);
    }

    return buffer;
  }

  // ==================== GEN 1 ====================
  static parseGen1(buffer) {
    if (buffer.length < 0x100) return [];

    // Try common Gen1 offsets (RBY,的不同版本)
    const offsets = [
      { partyCount: 0xA0, speciesList: 0xA1, partyData: 0xA2D, nickOffset: 0xB0, nickLen: 11, dataStride: 44 },
      { partyCount: 0x190, speciesList: 0x191, partyData: 0x1F3, nickOffset: 0x200, nickLen: 11, dataStride: 44 },
    ];

    for (const off of offsets) {
      const result = SaveParser.tryGen1(buffer, off);
      if (result.length > 0) return result;
    }
    return [];
  }

  static tryGen1(buffer, off) {
    const partyCount = buffer[off.partyCount] & 0xFF;
    if (partyCount < 1 || partyCount > 6) return [];

    const speciesIds = [];
    for (let i = 0; i < partyCount; i++) {
      const sid = buffer[off.speciesList + i] & 0xFF;
      if (sid === 0 || sid > 151) return [];
      speciesIds.push(sid);
    }

    const pokemon = [];
    for (let i = 0; i < partyCount; i++) {
      const speciesId = speciesIds[i];
      const nickname = SaveParser.readGen1String(buffer, off.nickOffset + (i * off.nickLen), off.nickLen);
      const level = buffer[off.partyData + (i * off.dataStride) + 0x1D] || 1;
      pokemon.push({
        speciesId, nickname,
        isShiny: false,
        isNicknamed: nickname !== '',
        level: Math.max(1, Math.min(100, level)),
        form: 0
      });
    }
    return pokemon;
  }

  // ==================== GEN 2 ====================
  static parseGen2(buffer) {
    if (buffer.length < 0x100) return [];
    const offsets = [
      { partyCount: 0xA0, speciesList: 0xA1, partyData: 0xA2D, nickOffset: 0xB0, nickLen: 11 },
      { partyCount: 0x190, speciesList: 0x191, partyData: 0x1F3, nickOffset: 0x200, nickLen: 11 },
    ];
    for (const off of offsets) {
      const result = SaveParser.tryGen2(buffer, off);
      if (result.length > 0) return result;
    }
    return [];
  }

  static tryGen2(buffer, off) {
    const partyCount = buffer[off.partyCount] & 0xFF;
    if (partyCount < 1 || partyCount > 6) return [];
    const speciesIds = [];
    for (let i = 0; i < partyCount; i++) {
      const sid = buffer[off.speciesList + i] & 0xFF;
      if (sid === 0 || sid > 251) return [];
      speciesIds.push(sid);
    }
    const pokemon = [];
    for (let i = 0; i < partyCount; i++) {
      const speciesId = speciesIds[i];
      const nickname = SaveParser.readGen1String(buffer, off.nickOffset + (i * off.nickLen), off.nickLen);
      const level = buffer[off.partyData + (i * 44) + 0x1D] || 1;
      pokemon.push({
        speciesId, nickname,
        isShiny: false,
        isNicknamed: nickname !== '',
        level: Math.max(1, Math.min(100, level)),
        form: 0
      });
    }
    return pokemon;
  }

  // ==================== GEN 3 (GBA) ====================
  // GBA saves: VBA/mGBA = 128KB, some emulators = 256KB with duplicate blocks
  static parseGen3(buffer) {
    if (buffer.length < 0x800) return [];

    // Try multiple party offsets (different emulators/games)
    const candidates = [
      { partyCount: 0x0890, speciesList: 0x0898, partyDataStart: 0x0894, pokemonSize: 100 },
      { partyCount: 0x0890, speciesList: 0x0898, partyDataStart: 0x0890 + 4, pokemonSize: 100 },
      { partyCount: 0x1F80, speciesList: 0x1F88, partyDataStart: 0x1F84, pokemonSize: 100 },
    ];

    for (const c of candidates) {
      const result = SaveParser.tryGen3Party(buffer, c);
      if (result.length > 0) return result;
    }

    // If no party found via standard offsets, try scanning for known species IDs
    return SaveParser.scanForGen3Team(buffer);
  }

  static tryGen3Party(buffer, c) {
    if (buffer.length < c.partyCount + 0x10) return [];
    const partyCount = buffer[c.partyCount] & 0xFF;
    if (partyCount < 1 || partyCount > 6) return [];

    const speciesIds = [];
    for (let i = 0; i < partyCount; i++) {
      const sid = buffer[c.speciesList + i] & 0xFF;
      if (sid === 0 || sid > 413) return [];
      speciesIds.push(sid);
    }

    const pokemon = [];
    for (let i = 0; i < partyCount; i++) {
      const speciesId = speciesIds[i];
      const pokemonOffset = c.partyDataStart + (i * c.pokemonSize);

      if (pokemonOffset + c.pokemonSize > buffer.length) continue;

      const pokemonData = Buffer.alloc(c.pokemonSize);
      buffer.copy(pokemonData, 0, pokemonOffset, pokemonOffset + c.pokemonSize);

      // Try to decrypt (Gen3 XOR encryption)
      const decrypted = SaveParser.decryptGen3Like(pokemonData);

      const level = decrypted[0x22] | (decrypted[0x23] << 8);
      const nickname = SaveParser.readGen3String(decrypted, 0x48, 10);
      const otName = SaveParser.readGen3String(decrypted, 0x38, 7);

      const personality = decrypted[0x00] | (decrypted[0x01] << 8) |
                         (decrypted[0x02] << 16) | (decrypted[0x03] << 24);

      pokemon.push({
        speciesId,
        nickname: nickname || '',
        isShiny: SaveParser.isShinyGen3(personality, decrypted),
        isNicknamed: nickname !== otName && nickname !== '',
        level: Math.max(1, Math.min(100, level || 1)),
        form: 0
      });
    }
    return pokemon;
  }

  static decryptGen3Like(data) {
    if (data.length < 8) return data;
    const checksum = data[0x00] | (data[0x01] << 8);
    const key = data[0x02] | (data[0x03] << 8);
    if (key === 0) return data; // Not encrypted or already decrypted

    const result = Buffer.from(data);
    let seed = checksum;
    const prng = (s) => (0x41C64E6D * s + 0x6073) & 0xFFFFFFFF;

    for (let i = 0x08; i < 0x88 && i < result.length - 1; i += 2) {
      seed = prng(seed);
      const xorKey = (seed >> 16) & 0xFFFF;
      result[i] = (result[i] ^ (xorKey & 0xFF)) & 0xFF;
      result[i + 1] = (result[i + 1] ^ ((xorKey >> 8) & 0xFF)) & 0xFF;
    }

    // Unshuffle sub-blocks
    const seed2 = ((key >> 0xD) & 0x1F) % 24;
    const order = SaveParser.getSubblockOrder(seed2, 4);
    const temp = Buffer.alloc(48);
    for (let i = 0; i < 4; i++) {
      data.copy(temp, i * 12, order[i] * 12, (order[i] + 1) * 12);
    }
    temp.copy(result, 0);

    return result;
  }

  static scanForGen3Team(buffer) {
    // Scan for valid species ID sequences (common patterns)
    for (let offset = 0; offset < Math.min(buffer.length - 0x10, 0x20000); offset += 4) {
      const count = buffer[offset] & 0xFF;
      if (count < 1 || count > 6) continue;

      let valid = true;
      const ids = [];
      for (let i = 0; i < count; i++) {
        const sid = buffer[offset + 1 + i] & 0xFF;
        if (sid === 0 || sid > 413) { valid = false; break; }
        ids.push(sid);
      }
      if (!valid || ids.length === 0) continue;

      // Check if remaining species bytes are 0
      if (buffer[offset + 1 + count] !== 0) continue;

      return ids.map(sid => ({
        speciesId: sid, nickname: '', isShiny: false,
        isNicknamed: false, level: 1, form: 0
      }));
    }
    return [];
  }

  // ==================== GEN 4 (NDS: D/P/Pt/HG/SS) ====================
  // NDS saves: DeSmuME = 512KB, melonDS = 512KB, some = 256KB
  static parseGen4(buffer) {
    if (buffer.length < 0x10000) return [];

    // Find active block via BEEF footer or try common offsets
    const candidates = [];

    // Standard 512KB dual-block format
    if (buffer.length >= 0x80000) {
      const blockA = SaveParser.readGen4BlockFooter(buffer, 0x00000);
      const blockB = SaveParser.readGen4BlockFooter(buffer, 0x40000);
      if (blockA) candidates.push(blockA);
      if (blockB) candidates.push(blockB);
    }

    // Single-block 256KB format
    if (buffer.length >= 0x40000) {
      candidates.push({ offset: 0x00000, size: 0x40000 });
      candidates.push({ offset: 0x10000, size: 0x40000 });
    }

    // 512KB single block
    candidates.push({ offset: 0x00000, size: 0x80000 });
    candidates.push({ offset: 0x00000, size: buffer.length });

    for (const c of candidates) {
      const result = SaveParser.tryGen4Party(buffer, c.offset);
      if (result.length > 0) return result;
    }

    return [];
  }

  static readGen4BlockFooter(buffer, offset) {
    if (offset + 0x20000 > buffer.length) return null;
    const footer = buffer.readUInt32LE(offset + 0x1FFFC) || 0;
    if (footer === 0x42454546) { // BEEF
      return { offset, size: 0x20000 };
    }
    return null;
  }

  static tryGen4Party(buffer, blockOffset) {
    // Try multiple party offsets within the block
    const partyOffsets = [
      blockOffset + 0x00,
      blockOffset + 0x0100,
      blockOffset + 0x0200,
      blockOffset + 0x0400,
    ];

    for (const pOff of partyOffsets) {
      const result = SaveParser.readGen4PartyAt(buffer, pOff);
      if (result.length > 0) return result;
    }
    return [];
  }

  static readGen4PartyAt(buffer, offset) {
    if (offset + 0x100 > buffer.length) return [];
    const partyCount = buffer[offset] & 0xFF;
    if (partyCount < 1 || partyCount > 6) return [];

    // Validate species IDs in the party species list
    const speciesListOffset = offset + 0x68;
    const speciesIds = [];
    for (let i = 0; i < partyCount; i++) {
      const sid = buffer.readUInt16LE(speciesListOffset + (i * 2));
      if (sid === 0 || sid > 649) return [];
      speciesIds.push(sid);
    }

    // Read party pokemon structures
    const pokemon = [];
    for (let i = 0; i < partyCount; i++) {
      const speciesId = speciesIds[i];
      const pokemonOffset = offset + 0x68 + (partyCount * 2) + (i * 236);
      if (pokemonOffset + 236 > buffer.length) continue;

      const data = Buffer.alloc(236);
      buffer.copy(data, 0, pokemonOffset, pokemonOffset + 236);

      // Try decryption
      const decrypted = SaveParser.decryptNdsLike(data, 236);

      const pid = decrypted.readUInt32LE(0x00);
      const speciesFromData = decrypted.readUInt16LE(0x08);
      const level = decrypted.readUInt16LE(0x36);
      const nickname = SaveParser.readNdsString(decrypted, 0x3E, 11);

      // Use species from list if data species looks wrong
      const finalSpecies = (speciesFromData > 0 && speciesFromData <= 649) ? speciesFromData : speciesId;

      pokemon.push({
        speciesId: finalSpecies,
        nickname: nickname || '',
        isShiny: SaveParser.isShinyStd(pid, decrypted),
        isNicknamed: nickname !== '',
        level: Math.max(1, Math.min(100, level || 1)),
        form: (pid >> 0xD) & 0x1F
      });
    }
    return pokemon;
  }

  // ==================== GEN 5 (NDS: B/W/B2/W2) ====================
  // Gen5 BW/B2W2 save structure:
  // - Block A (primary):   0x00000 - 0x23FFF (0x24000 bytes, 70 sub-blocks)
  // - Block B (backup):    0x24000 - 0x47FFF (0x24000 bytes)
  // - External data:       0x48000 - 0x7FFFF (battle videos, etc.)
  // - Party block (block 26): offset 0x18E00, size 0x0534
  //   +0x00: update counter (uint32 LE)
  //   +0x04: party count (uint32 LE, 1-6)
  //   +0x08: PK5 structures (220 bytes each, 0xDC)
  //
  // PK5 structure (220 bytes):
  //   0x00-0x07: Unencrypted header (PID, unused, checksum)
  //   0x08-0x87: Encrypted data (128 bytes, 4×32-byte sub-blocks)
  //   0x88-0xDB: Battle stats (encrypted with PID)
  //
  // PK5 decryption:
  //   1. Seed PRNG with checksum (bytes 0x06-0x07)
  //   2. XOR each 16-bit word from 0x08 to 0x87 with (PRNG >>> 16)
  //   3. Unshuffle 4×32-byte blocks: sv = ((PID & 0x3E000) >>> 0xD) % 24
  //      dst[i] = src[order[sv][i]]
  //   4. Decrypt battle stats (0x88-0xDB): seed with PID, XOR each 32-bit word
  //
  // After decryption:
  //   Species:    offset 0x00 (uint16 LE)
  //   Nickname:   offset 0x40 (UTF-16LE, 10 chars + terminator)
  //   OT Name:    offset 0x50 (UTF-16LE, 7 chars + terminator)
  //   Level:      offset 0x8C (uint8, after PID decrypt)
  //   Current HP: offset 0x8E (uint16 LE, after PID decrypt)
  //   Max HP:     offset 0x90 (uint16 LE, after PID decrypt)

  static PK5_SHUFFLE_ORDERS = [
    [0,1,2,3],[0,1,3,2],[0,2,1,3],[0,3,1,2],[0,2,3,1],[0,3,2,1],
    [1,0,2,3],[1,0,3,2],[2,0,1,3],[3,0,1,2],[2,0,3,1],[3,0,2,1],
    [1,2,0,3],[1,3,0,2],[2,1,0,3],[3,1,0,2],[2,3,0,1],[3,2,0,1],
    [1,2,3,0],[1,3,2,0],[2,1,3,0],[3,1,2,0],[2,3,1,0],[3,2,1,0]
  ];

  static pk5Prng(seed) {
    return (Math.imul(seed, 0x41C64E6D) + 0x6073) >>> 0;
  }

  static decryptPK5(pokemon) {
    const data = Buffer.from(pokemon);
    const pid = data.readUInt32LE(0);
    const checksum = data.readUInt16LE(6);

    let seed = checksum;
    for (let addr = 0x08; addr < 0x88; addr += 2) {
      seed = SaveParser.pk5Prng(seed);
      const val = data.readUInt16LE(addr) ^ (seed >>> 16);
      data.writeUInt16LE(val, addr);
    }

    const sv = ((pid & 0x3E000) >>> 0xD) % 24;
    const blockOrder = SaveParser.PK5_SHUFFLE_ORDERS[sv];
    const src = [
      data.slice(0x08, 0x28),
      data.slice(0x28, 0x48),
      data.slice(0x48, 0x68),
      data.slice(0x68, 0x88)
    ];
    const dst = [Buffer.alloc(32), Buffer.alloc(32), Buffer.alloc(32), Buffer.alloc(32)];
    for (let i = 0; i < 4; i++) {
      src[blockOrder[i]].copy(dst[i]);
    }
    const decrypted = Buffer.concat(dst);

    let pidSeed = pid;
    for (let addr = 0x88; addr < 0xDC; addr += 4) {
      pidSeed = SaveParser.pk5Prng(pidSeed);
      const val = (data.readUInt32LE(addr) ^ pidSeed) >>> 0;
      data.writeUInt32LE(val, addr);
    }

    return { pid, checksum, decrypted, data, sv };
  }

  static readPK5String(buffer, offset, maxChars) {
    let str = '';
    for (let j = 0; j < maxChars; j++) {
      const ch = buffer.readUInt16LE(offset + j * 2);
      if (ch === 0 || ch === 0xFFFF) break;
      if (ch >= 0x0020 && ch <= 0x007E) {
        str += String.fromCharCode(ch);
      } else if (ch >= 0xFF01 && ch <= 0xFF5E) {
        str += String.fromCharCode(ch - 0xFEE0);
      } else {
        str += String.fromCharCode(ch);
      }
    }
    return str.trim();
  }

  static parseGen5(buffer) {
    Logger.info('Gen5', `parseGen5: buffer=${buffer.length} bytes`);

    if (buffer.length < 0x10000) {
      Logger.error('Gen5', `Buffer too small: ${buffer.length} bytes (need >=0x10000)`);
      return [];
    }

    const blockA = 0x18E00;
    const blockB = 0x24000 + 0x18E00;
    const candidates = [
      { offset: blockA, label: 'Block A party (0x18E00)' },
      { offset: blockB, label: 'Block B party (0x3CE00)' },
    ];

    for (const c of candidates) {
      if (c.offset + 0x534 > buffer.length) continue;

      const partyCount = buffer.readUInt32LE(c.offset + 4);
      Logger.info('Gen5', `${c.label}: party_count_u32=${partyCount}`);

      if (partyCount < 1 || partyCount > 6) continue;

      const result = SaveParser.readGen5PartyPK5(buffer, c.offset + 8, partyCount);
      if (result.length > 0) {
        Logger.info('Gen5', `FOUND party at ${c.label}: ${result.map(p => `${p.speciesId}(${p.nickname})`).join(', ')}`);
        return result;
      }
    }

    Logger.info('Gen5', 'Primary offsets failed, trying alternative scan...');
    return SaveParser.scanForGen5Team(buffer);
  }

  static readGen5PartyPK5(buffer, dataOffset, count) {
    if (dataOffset + count * 0xDC > buffer.length) return [];

    const pokemon = [];
    for (let i = 0; i < count; i++) {
      const pokemonOff = dataOffset + (i * 0xDC);
      const pokemonData = buffer.slice(pokemonOff, pokemonOff + 0xDC);

      if (pokemonData.length < 0xDC) continue;

      try {
        const { pid, decrypted, data, sv } = SaveParser.decryptPK5(pokemonData);

        const speciesId = decrypted.readUInt16LE(0);
        const nickname = SaveParser.readPK5String(decrypted, 0x40, 11);

        const level = data.length > 0x8C ? data.readUInt8(0x8C) : 1;
        const curHp = data.length > 0x8F ? data.readUInt16LE(0x8E) : 0;
        const maxHp = data.length > 0x91 ? data.readUInt16LE(0x90) : 0;

        if (speciesId === 0 || speciesId > 721) {
          Logger.debug('Gen5', `  PK5 #${i + 1}: invalid species ${speciesId}, skipping`);
          continue;
        }

        const validLevel = (level >= 1 && level <= 100);
        const validHp = (curHp > 0 && maxHp > 0 && curHp <= maxHp && maxHp <= 999);

        Logger.info('Gen5', `  PK5 #${i + 1}: species=${speciesId} level=${level}${validLevel ? '' : '(?)'} HP=${curHp}/${maxHp}${validHp ? '' : '(?)'} nickname="${nickname}" sv=${sv}`);

        pokemon.push({
          speciesId,
          nickname: nickname || '',
          isShiny: false,
          isNicknamed: nickname !== '',
          level: validLevel ? level : 1,
          form: 0
        });
      } catch (e) {
        Logger.error('Gen5', `  PK5 #${i + 1} decryption error: ${e.message}`);
      }
    }
    return pokemon;
  }

  static scanForGen5Team(buffer) {
    Logger.info('Gen5', 'Starting full scan for party data...');

    for (let offset = 0; offset < Math.min(buffer.length - 0x20, 0x80000); offset += 1) {
      const count = buffer[offset] & 0xFF;
      if (count < 1 || count > 6) continue;

      const speciesListOff = offset + 1;
      if (speciesListOff + count * 2 > buffer.length) continue;

      let valid = true;
      const ids = [];
      for (let i = 0; i < count; i++) {
        const sid = buffer.readUInt16LE(speciesListOff + (i * 2));
        if (sid === 0 || sid > 721) { valid = false; break; }
        ids.push(sid);
      }
      if (!valid || ids.length === 0) continue;

      if (count < 6) {
        const after = buffer.readUInt16LE(speciesListOff + (count * 2));
        if (after !== 0) continue;
      }

      if (count >= 4) {
        Logger.info('Gen5', `Scan found party at 0x${offset.toString(16)}: count=${count} species=${JSON.stringify(ids)}`);
        return ids.map(sid => ({
          speciesId: sid, nickname: '', isShiny: false,
          isNicknamed: false, level: 1, form: 0
        }));
      }
    }

    Logger.error('Gen5', 'No party found anywhere in save file');
    return [];
  }

  // ==================== GEN 6 (3DS: X/Y/OR/AS) ====================
  static parseGen6(buffer) {
    if (buffer.length < 0x10000) return [];

    // 3DS saves from Citra can be various sizes
    // Try to find party block by scanning for BEEF markers or known patterns
    const candidates = SaveParser.find3dsPartyCandidates(buffer, 6);
    for (const c of candidates) {
      const result = SaveParser.read3dsPartyAt(buffer, c, 260, 649);
      if (result.length > 0) return result;
    }
    return [];
  }

  // ==================== GEN 7 (3DS: S/M/US/UM) ====================
  static parseGen7(buffer) {
    if (buffer.length < 0x10000) return [];

    const candidates = SaveParser.find3dsPartyCandidates(buffer, 7);
    for (const c of candidates) {
      const result = SaveParser.read3dsPartyAt(buffer, c, 260, 809);
      if (result.length > 0) return result;
    }
    return [];
  }

  static find3dsPartyCandidates(buffer, gen) {
    const candidates = [];

    // Scan for BEEF block markers
    for (let offset = 0; offset < buffer.length - 8; offset += 4) {
      if (buffer.readUInt32LE(offset) === 0x42454546) {
        candidates.push(offset + 0x08);
      }
    }

    // Common 3DS offsets
    const commonOffsets = [0x0800, 0x1000, 0x2000, 0x4000, 0x8000, 0x0000];
    for (const o of commonOffsets) {
      if (!candidates.includes(o)) candidates.push(o);
    }

    return candidates;
  }

  static read3dsPartyAt(buffer, offset, pokemonSize, maxSpecies) {
    if (offset + 0x100 > buffer.length) return [];
    const partyCount = buffer[offset] & 0xFF;
    if (partyCount < 1 || partyCount > 6) return [];

    const speciesIds = [];
    for (let i = 0; i < partyCount; i++) {
      const sid = buffer.readUInt16LE(offset + 8 + (i * 2));
      if (sid === 0 || sid > maxSpecies) return [];
      speciesIds.push(sid);
    }

    const pokemon = [];
    for (let i = 0; i < partyCount; i++) {
      const speciesId = speciesIds[i];
      const pokemonOffset = offset + 8 + (partyCount * 2) + (i * pokemonSize);
      if (pokemonOffset + pokemonSize > buffer.length) continue;

      const data = Buffer.alloc(pokemonSize);
      buffer.copy(data, 0, pokemonOffset, pokemonOffset + pokemonSize);

      const pid = data.readUInt32LE(0x00);
      const level = data.readUInt16LE(0x36);
      const nickname = SaveParser.readNdsString(data, 0x3E, 12);

      pokemon.push({
        speciesId,
        nickname: nickname || '',
        isShiny: SaveParser.isShinyStd(pid, data),
        isNicknamed: nickname !== '',
        level: Math.max(1, Math.min(100, level || 1)),
        form: (pid >> 0xD) & 0x1F
      });
    }
    return pokemon;
  }

  // ==================== GEN 8 (Switch: Sw/Sh + BDSP) ====================
  static parseGen8(buffer, gameInfo) {
    if (buffer.length < 0x10000) return [];

    // BDSP uses PB8 format with different offsets and encryption
    if (gameInfo && gameInfo.saveType === 'gen8bdsp') {
      return SaveParser.parseGen8BDSP(buffer);
    }

    // Sw/Sh uses SwishCrypto (SCBlock format)
    if (gameInfo && gameInfo.saveType === 'gen8swsh') {
      return SaveParser.parseGen8SwSh(buffer);
    }

    // Auto-detect: try SwishCrypto first if hash is valid
    if (SwishCrypto.isValid(buffer)) {
      Logger.info('Parser', 'SwishCrypto hash valid, parsing as Sw/Sh save');
      return SaveParser.parseGen8SwSh(buffer);
    }

    // Switch saves can be .sav (full save) or individual .pk8 files
    // Check if this is a single Pokemon file
    if (buffer.length === 260 || buffer.length === 232) {
      return SaveParser.parseSinglePk8(buffer);
    }

    // Try to find party in full save
    const candidates = SaveParser.findSwitchPartyCandidates(buffer, 8);
    for (const c of candidates) {
      const result = SaveParser.readSwitchPartyAt(buffer, c, 260, 898);
      if (result.length > 0) return result;
    }
    return [];
  }

  // ==================== GEN 8 Sw/Sh (Sword / Shield) ====================
  // Sw/Sh save uses SwishCrypto encryption with SCBlock format
  static parseGen8SwSh(buffer) {
    Logger.info('SwSh', `parseGen8SwSh: buffer=${buffer.length} bytes`);

    try {
      // Decrypt SwishCrypto
      if (!SwishCrypto.isValid(buffer)) {
        Logger.error('SwSh', 'Invalid SwishCrypto hash');
        return [];
      }

      const blocks = SwishCrypto.decrypt(buffer);
      Logger.info('SwSh', `Parsed ${blocks.length} SCBlocks`);

      // Get party data
      const party = SwishCrypto.getParty(blocks);
      if (!party || party.pokemon.length === 0) {
        Logger.error('SwSh', 'No party data found');
        return [];
      }

      Logger.info('SwSh', `Party count: ${party.partyCount}`);

      const result = [];
      for (let i = 0; i < party.pokemon.length; i++) {
        const pkData = party.pokemon[i];
        const decrypted = SwishCrypto.decryptPK8(pkData);

        const speciesId = decrypted.readUInt16LE(0x08);
        if (speciesId === 0 || speciesId > 1010) {
          Logger.debug('SwSh', `P${i + 1}: Invalid species ${speciesId}, skipping`);
          continue;
        }

        const heldItem = decrypted.readUInt16LE(0x0A);
        const exp = decrypted.readUInt32LE(0x10);
        const altForm = decrypted.readUInt16LE(0x16);
        const pid = decrypted.readUInt32LE(0x1C);

        // PK8 offsets: Nickname at 0x58, OT at 0xF8
        let nickname = '';
        for (let j = 0x58; j < 0x58 + 24; j += 2) {
          const ch = decrypted.readUInt16LE(j);
          if (ch === 0) break;
          nickname += String.fromCharCode(ch);
        }

        let otName = '';
        for (let j = 0xF8; j < 0xF8 + 24; j += 2) {
          const ch = decrypted.readUInt16LE(j);
          if (ch === 0) break;
          otName += String.fromCharCode(ch);
        }

        // Level from party stats (0x148)
        let level = 1;
        if (decrypted.length > 0x148) {
          level = decrypted[0x148] || 1;
        }

        if (level <= 1 && exp > 0) {
          level = SaveParser.calcLevelGen8(exp, speciesId);
        }

        const form = SaveParser.getRegionalForm(speciesId, altForm);

        // Shiny check (unsigned shift to avoid sign issues with PID > 0x7FFFFFFF)
        const tid = decrypted.readUInt16LE(0x0C);
        const sid = decrypted.readUInt16LE(0x0E);
        const xorShiny = (((pid >>> 16) ^ (pid & 0xFFFF)) ^ (tid ^ sid)) & 0xFFFF;
        const isShiny = pid !== 0 ? xorShiny < 16 : false;

        const pokemon = {
          speciesId,
          nickname: nickname || '',
          level,
          isShiny,
          form,
          pid,
          tid,
          sid,
          heldItem,
          otName,
        };

        Logger.info('SwSh', `P${i + 1}: species=${speciesId} nickname="${pokemon.nickname}" level=${level} shiny=${isShiny} form=${form}`);
        result.push(pokemon);
      }

      return result;
    } catch (e) {
      Logger.error('SwSh', `Parse error: ${e.message}`);
      return [];
    }
  }

  // Calculate level from experience for Gen8
  static calcLevelGen8(exp, speciesId) {
    // Simple level calculation using medium-fast growth rate
    // exp = level^3, so level = cbrt(exp)
    if (exp <= 0) return 1;
    const level = Math.round(Math.cbrt(exp));
    return Math.max(1, Math.min(100, level));
  }

  // ==================== GEN 8 BDSP (Brilliant Diamond / Shining Pearl) ====================
  // BDSP SaveData.bin structure (Ryujinx/Yuzu):
  //   Party data:    offset 0x14098, 6 × 0x158-byte PB8 structs
  //   Party count:   offset 0x148A8 (uint8)
  //   MyStatus OT:   offset 0x79BB4
  //
  // PB8 structure (SIZE_8PARTY = 0x158, SIZE_8STORED = 0x148):
  //   0x00-0x03: Encryption constant (PID)
  //   0x04-0x05: Sanity marker
  //   0x06-0x07: Checksum
  //   0x08-0x147: Encrypted data (10 × 80-byte ulong blocks, shuffled)
  //   0x148-0x157: Battle stats (encrypted separately)
  //
  // PB8 decryption:
  //   1. PV = uint32_LE[0], sv = (PV >> 13) & 31
  //   2. XOR decrypt: LCG seed starts at PV, for each 2 bytes in [8..0x148):
  //      seed = (0x41C64E6D * seed + 0x6073) >>> 0
  //      byte[i] ^= (seed >> 16) & 0xFF, byte[i+1] ^= (seed >> 24) & 0xFF
  //   3. Battle stats [0x148..0x158]: same LCG but seed resets to PV
  //   4. Block shuffle: Shuffle<ulong> does IN-PLACE block swaps of 80-byte blocks
  //      using BlockPosition table indexed by sv × 4
  //
  // After decryption, G8PKM offsets:
  //   Species:    0x08 (uint16 LE)
  //   EXP:        0x10 (uint32 LE)
  //   PID:        0x1C (uint32 LE)
  //   Nickname:   0x58 (UTF-16LE, 13 chars)
  //   OT Name:    0xF8 (UTF-16LE, 13 chars)
  //   Level:      SIZE_8STORED + 0x00 (uint8)

  static BDSP_SIZE_8STORED = 0x148;
  static BDSP_SIZE_8PARTY = 0x158;
  static BDSP_SIZE_8BLOCK = 80;
  static BDSP_ULONG_SIZE = 8;
  static BDSP_COUNT_PER_BLOCK = 80 / 8; // 10 ulongs per block

  static BDSP_BlockPosition = [
    0,1,2,3, 0,1,3,2, 0,2,1,3, 0,3,1,2,
    0,2,3,1, 0,3,2,1, 1,0,2,3, 1,0,3,2,
    2,0,1,3, 3,0,1,2, 2,0,3,1, 3,0,2,1,
    1,2,0,3, 1,3,0,2, 2,1,0,3, 3,1,0,2,
    2,3,0,1, 3,2,0,1, 1,2,3,0, 1,3,2,0,
    2,1,3,0, 3,1,2,0, 2,3,1,0, 3,2,1,0,
    0,1,2,3, 0,1,3,2, 0,2,1,3, 0,3,1,2,
    0,2,3,1, 0,3,2,1, 1,0,2,3, 1,0,3,2,
  ];

  static bdspShuffleBlocks(data, sv) {
    if (sv === 0) return;
    const blockSize = SaveParser.BDSP_COUNT_PER_BLOCK * SaveParser.BDSP_ULONG_SIZE;
    const src = [
      SaveParser.BDSP_BlockPosition[sv * 4],
      SaveParser.BDSP_BlockPosition[sv * 4 + 1],
      SaveParser.BDSP_BlockPosition[sv * 4 + 2],
      SaveParser.BDSP_BlockPosition[sv * 4 + 3],
    ];
    // Skip identity permutation
    if (src[0] === 0 && src[1] === 1 && src[2] === 2 && src[3] === 3) return;
    // PKHeX Shuffle<T>: dest[i] = source[src[i]]
    const dest = Buffer.alloc(4 * blockSize);
    for (let i = 0; i < 4; i++) {
      data.copy(dest, i * blockSize, src[i] * blockSize, (src[i] + 1) * blockSize);
    }
    dest.copy(data, 0);
  }

  static decryptPB8(rawData) {
    const data = Buffer.from(rawData);
    const pv = data.readUInt32LE(0);
    const sv = (pv >> 13) & 31;

    // Decrypt stored data block [8..SIZE_8STORED)
    let seed = pv;
    for (let i = 8; i < SaveParser.BDSP_SIZE_8STORED; i += 2) {
      seed = (Math.imul(0x41C64E6D, seed) + 0x6073) >>> 0;
      data[i] ^= (seed >> 16) & 0xFF;
      data[i + 1] ^= (seed >> 24) & 0xFF;
    }

    // Decrypt battle stats block [SIZE_8STORED..SIZE_8PARTY)
    seed = pv;
    for (let i = SaveParser.BDSP_SIZE_8STORED; i < SaveParser.BDSP_SIZE_8PARTY; i += 2) {
      seed = (Math.imul(0x41C64E6D, seed) + 0x6073) >>> 0;
      data[i] ^= (seed >> 16) & 0xFF;
      data[i + 1] ^= (seed >> 24) & 0xFF;
    }

    // Unshuffle blocks (in-place)
    const blockData = data.slice(8, SaveParser.BDSP_SIZE_8STORED);
    SaveParser.bdspShuffleBlocks(blockData, sv);

    return data;
  }

  static readPB8String(buffer, offset, maxChars) {
    let str = '';
    for (let j = 0; j < maxChars; j += 2) {
      const ch = buffer.readUInt16LE(offset + j);
      if (ch === 0 || ch === 0xFFFF) break;
      if (ch >= 0x0020 && ch <= 0x007E) {
        str += String.fromCharCode(ch);
      } else if (ch >= 0xFF01 && ch <= 0xFF5E) {
        str += String.fromCharCode(ch - 0xFEE0);
      } else {
        str += String.fromCharCode(ch);
      }
    }
    return str.trim();
  }

  // Regional form byte mapping for Gen8+ (PB8/PK8)
  // formByte: 0=Normal, 1=Alola, 2=Galar, 3=Hisui, 4=Paldea
  // Only Pokemon with official regional forms are listed
  static REGIONAL_FORMS = {
    // Alolan forms (formByte=1)
    19: { 1: 'alola' },    // Rattata
    20: { 1: 'alola' },    // Raticate
    26: { 1: 'alola' },    // Raichu
    27: { 1: 'alola' },    // Sandshrew
    28: { 1: 'alola' },    // Sandslash
    37: { 1: 'alola' },    // Vulpix
    38: { 1: 'alola' },    // Ninetales
    50: { 1: 'alola' },    // Diglett
    51: { 1: 'alola' },    // Dugtrio
    52: { 1: 'alola', 2: 'galar' }, // Meowth (Alola + Galar)
    53: { 1: 'alola' },    // Persian
    74: { 1: 'alola' },    // Geodude
    75: { 1: 'alola' },    // Graveler
    76: { 1: 'alola' },    // Golem
    88: { 1: 'alola' },    // Grimer
    89: { 1: 'alola' },    // Muk
    103: { 1: 'alola' },   // Exeggutor
    105: { 1: 'alola' },   // Marowak
    // Galarian forms (formByte=2)
    77: { 2: 'galar' },    // Ponyta
    78: { 2: 'galar' },    // Rapidash
    79: { 2: 'galar' },    // Slowpoke
    80: { 2: 'galar' },    // Slowbro
    110: { 2: 'galar' },   // Weezing
    122: { 2: 'galar' },   // Mr. Mime
    222: { 2: 'galar' },   // Corsola
    263: { 2: 'galar' },   // Zigzagoon
    264: { 2: 'galar' },   // Linoone
    554: { 2: 'galar' },   // Darumaka
    555: { 2: 'galar' },   // Darmanitan
    562: { 2: 'galar' },   // Yamask
    563: { 2: 'galar' },   // Cofagrigus
    618: { 2: 'galar' },   // Stunfisk
  };

  static getRegionalForm(speciesId, formByte) {
    if (formByte === 0) return '';
    const forms = SaveParser.REGIONAL_FORMS[speciesId];
    if (forms && forms[formByte]) return forms[formByte];
    // Only return form for species with known regional forms
    return '';
  }

  static parseGen8BDSP(buffer) {
    Logger.info('BDSP', `parseGen8BDSP: buffer=${buffer.length} bytes`);

    // BDSP SaveData.bin: party at 0x14098, count at 0x148A8
    const PARTY_OFFSET = 0x14098;
    const COUNT_OFFSET = 0x148A8;

    if (buffer.length < COUNT_OFFSET + 1) {
      Logger.error('BDSP', `Buffer too small for BDSP save: ${buffer.length} bytes`);
      return [];
    }

    const partyCount = buffer.readUInt8(COUNT_OFFSET);
    Logger.info('BDSP', `Party count at 0x${COUNT_OFFSET.toString(16)}: ${partyCount}`);

    if (partyCount < 1 || partyCount > 6) {
      Logger.error('BDSP', `Invalid party count: ${partyCount}`);
      return [];
    }

    const pokemon = [];
    for (let i = 0; i < partyCount; i++) {
      const off = PARTY_OFFSET + i * SaveParser.BDSP_SIZE_8PARTY;
      if (off + SaveParser.BDSP_SIZE_8PARTY > buffer.length) {
        Logger.error('BDSP', `P${i + 1}: offset 0x${off.toString(16)} exceeds buffer size`);
        continue;
      }

      try {
        const raw = buffer.slice(off, off + SaveParser.BDSP_SIZE_8PARTY);
        const dec = SaveParser.decryptPB8(raw);

        const pv = dec.readUInt32LE(0x00);
        const sv = (pv >> 13) & 31;
        const speciesId = dec.readUInt16LE(0x08);
        const pid = dec.readUInt32LE(0x1C);
        const formByte = dec.readUInt8(0x24);
        const nickname = SaveParser.readPB8String(dec, 0x58, 26);
        const ot = SaveParser.readPB8String(dec, 0xF8, 26);
        const level = dec.readUInt8(SaveParser.BDSP_SIZE_8STORED + 0x00) || 1;

        if (speciesId === 0 || speciesId > 1025) {
          Logger.warn('BDSP', `P${i + 1}: invalid species ${speciesId}, skipping`);
          continue;
        }

        const formSuffix = SaveParser.getRegionalForm(speciesId, formByte);
        Logger.info('BDSP', `P${i + 1}: species=${speciesId} pid=0x${pid.toString(16).padStart(8, '0')} sv=${sv} formByte=${formByte} form="${formSuffix}" level=${level} nick="${nickname}" ot="${ot}"`);

        pokemon.push({
          speciesId,
          nickname: nickname || '',
          isShiny: false,
          isNicknamed: nickname !== '',
          level: Math.max(1, Math.min(100, level)),
          form: formSuffix
        });
      } catch (e) {
        Logger.error('BDSP', `P${i + 1} decryption error: ${e.message}`);
      }
    }

    return pokemon;
  }

  // ==================== GEN 9 (Switch: S/V) ====================
  static parseGen9(buffer) {
    if (buffer.length < 0x10000) return [];

    if (buffer.length === 260 || buffer.length === 232) {
      return SaveParser.parseSinglePk9(buffer);
    }

    const candidates = SaveParser.findSwitchPartyCandidates(buffer, 9);
    for (const c of candidates) {
      const result = SaveParser.readSwitchPartyAt(buffer, c, 260, 1025);
      if (result.length > 0) return result;
    }
    return [];
  }

  static findSwitchPartyCandidates(buffer, gen) {
    const candidates = [];

    // Scan for SCBlock headers or party patterns
    for (let offset = 0; offset < Math.min(buffer.length - 8, 0x100000); offset += 4) {
      // Check for common Switch save markers
      const val = buffer.readUInt32LE(offset);
      if (val === 0x0102 || val === 0x0103) {
        candidates.push(offset + 0x08);
      }
    }

    // Common Switch offsets
    const commonOffsets = [0x0000, 0x1000, 0x2000, 0x4000, 0x8000, 0x10000, 0x18E00];
    for (const o of commonOffsets) {
      if (!candidates.includes(o)) candidates.push(o);
    }

    return candidates;
  }

  static readSwitchPartyAt(buffer, offset, pokemonSize, maxSpecies) {
    if (offset + 0x100 > buffer.length) return [];
    const partyCount = buffer[offset] & 0xFF;
    if (partyCount < 1 || partyCount > 6) return [];

    const speciesIds = [];
    for (let i = 0; i < partyCount; i++) {
      const sid = buffer.readUInt16LE(offset + 8 + (i * 2));
      if (sid === 0 || sid > maxSpecies) return [];
      speciesIds.push(sid);
    }

    const pokemon = [];
    for (let i = 0; i < partyCount; i++) {
      const speciesId = speciesIds[i];
      const pokemonOffset = offset + 8 + (partyCount * 2) + (i * pokemonSize);
      if (pokemonOffset + pokemonSize > buffer.length) continue;

      const data = Buffer.alloc(pokemonSize);
      buffer.copy(data, 0, pokemonOffset, pokemonOffset + pokemonSize);

      const pid = data.readUInt32LE(0x00);
      const level = data.readUInt16LE(0x36);
      const nickname = SaveParser.readNdsString(data, 0x3E, 12);

      pokemon.push({
        speciesId,
        nickname: nickname || '',
        isShiny: SaveParser.isShinyStd(pid, data),
        isNicknamed: nickname !== '',
        level: Math.max(1, Math.min(100, level || 1)),
        form: (pid >> 0xD) & 0x1F
      });
    }
    return pokemon;
  }

  static parseSinglePk8(buffer) {
    if (buffer.length < 0x80) return [];
    const data = buffer.length === 260 ? buffer.slice(0, 232) : buffer;

    const speciesId = data.readUInt16LE(0x08);
    const pid = data.readUInt32LE(0x00);
    const level = data.readUInt16LE(0x36);
    const nickname = SaveParser.readNdsString(data, 0x3E, 12);

    if (speciesId === 0 || speciesId > 898) return [];

    return [{
      speciesId,
      nickname: nickname || '',
      isShiny: SaveParser.isShinyStd(pid, data),
      isNicknamed: nickname !== '',
      level: Math.max(1, Math.min(100, level || 1)),
      form: (pid >> 0xD) & 0x1F
    }];
  }

  static parseSinglePk9(buffer) {
    if (buffer.length < 0x80) return [];
    const data = buffer.length === 260 ? buffer.slice(0, 232) : buffer;

    const speciesId = data.readUInt16LE(0x08);
    const pid = data.readUInt32LE(0x00);
    const level = data.readUInt16LE(0x36);
    const nickname = SaveParser.readNdsString(data, 0x3E, 12);

    if (speciesId === 0 || speciesId > 1025) return [];

    return [{
      speciesId,
      nickname: nickname || '',
      isShiny: SaveParser.isShinyStd(pid, data),
      isNicknamed: nickname !== '',
      level: Math.max(1, Math.min(100, level || 1)),
      form: (pid >> 0xD) & 0x1F
    }];
  }

  // ==================== COMMON HELPERS ====================

  static decryptNdsLike(data, size) {
    if (data.length < 8) return data;
    const key = data.readUInt32LE(0x00);
    if (key === 0) return data;

    // Check if data looks already decrypted (valid species ID at 0x08)
    const species = data.readUInt16LE(0x08);
    if (species > 0 && species <= 1025) return data;

    // Try XOR decryption
    const result = Buffer.from(data);
    let seed = key;
    const prng = (s) => (0x41C64E6D * s + 0x6073) & 0xFFFFFFFF;

    for (let i = 0x08; i < size && i < result.length - 1; i += 2) {
      seed = prng(seed);
      const xorKey = (seed >> 16) & 0xFFFF;
      result[i] = (result[i] ^ (xorKey & 0xFF)) & 0xFF;
      result[i + 1] = (result[i + 1] ^ ((xorKey >> 8) & 0xFF)) & 0xFF;
    }

    return result;
  }

  static isShinyStd(pid, data) {
    const trainerId = data.readUInt16LE(0x04);
    const secretId = data.readUInt16LE(0x06);
    const highPid = (pid >> 16) & 0xFFFF;
    const lowPid = pid & 0xFFFF;
    return (highPid ^ lowPid ^ trainerId ^ secretId) < 16;
  }

  static isShinyGen3(personality, data) {
    const otId = data.readUInt16LE(0x04);
    const otSecretId = data.readUInt16LE(0x06);
    const highPid = (personality >> 16) & 0xFFFF;
    const lowPid = personality & 0xFFFF;
    return (highPid ^ lowPid ^ otId ^ otSecretId) < 16;
  }

  // ==================== STRING READING ====================

  static readGen1String(buffer, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
      const c = buffer[offset + i];
      if (c === 0x50 || c === 0xFF) break;
      if (c >= 0x80 && c <= 0x99) str += String.fromCharCode(0x41 + (c - 0x80));
      else if (c === 0x7D) str += ' ';
      else if (c >= 0xA1 && c <= 0xFA) str += String.fromCharCode(0x21 + (c - 0xA1));
      else if (c >= 0x61 && c <= 0x7A) str += String.fromCharCode(c);
      else if (c >= 0x30 && c <= 0x39) str += String.fromCharCode(c);
      else if (c >= 0x01 && c <= 0x1A) str += String.fromCharCode(0x41 + (c - 1));
      else str += '?';
    }
    return str.trim();
  }

  static readGen3String(buffer, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
      const c = buffer[offset + i];
      if (c === 0xFF || c === 0x00) break;
      if (c >= 0x01 && c <= 0x1A) str += String.fromCharCode(0x41 + (c - 1));
      else if (c >= 0xA1 && c <= 0xFA) str += String.fromCharCode(0x21 + (c - 0xA1));
      else if (c >= 0x20 && c <= 0x7E) str += String.fromCharCode(c);
      else str += '?';
    }
    return str.trim();
  }

  static readNdsString(buffer, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
      const c = buffer[offset + i] | (buffer[offset + i + 1] << 8);
      if (c === 0xFFFF || c === 0x0000) break;
      if (c >= 0x0001 && c <= 0x001A) str += String.fromCharCode(0x41 + (c - 1));
      else if (c >= 0x0030 && c <= 0x0039) str += String.fromCharCode(c);
      else if (c >= 0x0020 && c <= 0x007E) str += String.fromCharCode(c);
      else if (c >= 0xFF01 && c <= 0xFF5E) str += String.fromCharCode(c - 0xFEE0);
      else str += '?';
      i++;
    }
    return str.trim();
  }

  static getSubblockOrder(seed, blockCount) {
    const table = [
      [0,1,2,3], [0,1,3,2], [0,2,1,3], [0,2,3,1], [0,3,1,2], [0,3,2,1],
      [1,0,2,3], [1,0,3,2], [1,2,0,3], [1,2,3,0], [1,3,0,2], [1,3,2,0],
      [2,0,1,3], [2,0,3,1], [2,1,0,3], [2,1,3,0], [2,3,0,1], [2,3,1,0],
      [3,0,1,2], [3,0,2,1], [3,1,0,2], [3,1,2,0], [3,2,0,1], [3,2,1,0]
    ];
    return (seed >= 0 && seed < table.length) ? table[seed] : [0,1,2,3];
  }
}

module.exports = SaveParser;
