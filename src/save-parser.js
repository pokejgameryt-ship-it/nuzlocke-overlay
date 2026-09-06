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
      case 3: result = SaveParser.parseGen3(data, gameInfo); break;
      case 4: result = SaveParser.parseGen4(data); break;
      case 5: result = SaveParser.parseGen5(data); break;
      case 6: result = SaveParser.parseGen6(data); break;
      case 7: result = SaveParser.parseGen7(data); break;
      case 8: result = SaveParser.parseGen8(data, gameInfo); break;
      case 9: result = SaveParser.parseGen9(data, gameInfo); break;
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

    // Check for DeSmuME DSV footer: starts with "|<--Snip above here..." and ends with "|-DESMUME SAVE-|"
    // The raw save data is everything before the footer
    const tail = buffer.slice(Math.max(0, buffer.length - 256)).toString('ascii');
    if (tail.includes('-DESMUME SAVE-')) {
      // Find the footer start: it begins with "|" before "<--Snip"
      const markerIdx = tail.indexOf('-DESMUME SAVE-');
      // Search backwards from the marker for the footer start "|"
      // The footer text is: "|<--Snip above here to create a raw sav by excluding this DeSmuME savedata footer:..."
      // Find "|<--" which marks the true start of the footer
      const snipIdx = tail.indexOf('|<--');
      if (snipIdx >= 0) {
        const trimTo = buffer.length - 256 + snipIdx;
        console.log(`[SaveParser] Found DeSmuME DSV footer at offset 0x${trimTo.toString(16)}, trimming to ${trimTo} bytes`);
        return buffer.slice(0, trimTo);
      }
      // Fallback: trim to 0x80000 for standard 512KB DSV files
      if (buffer.length > 0x80000 && buffer.length <= 0x81000) {
        console.log(`[SaveParser] DSV file detected, trimming to 0x80000 (512KB raw save)`);
        return buffer.slice(0, 0x80000);
      }
    }

    return buffer;
  }

  // ==================== GEN 1 ====================
  // Gen1 (RBY) uses INTERNAL species IDs (not National Dex).
  // Rhydon=0x01, Kangaskhan=0x02, ..., Pikachu=0x54, Bulbasaur=0x99, etc.
  // Must convert internal ID -> National Dex ID before passing to UI.
  static GEN1_INTERNAL_TO_NATIONAL = (() => {
    const t = new Uint8Array(256);
    t[0x00] = 0;    // MissingNo
    t[0x01] = 112;  // Rhydon
    t[0x02] = 115;  // Kangaskhan
    t[0x03] = 32;   // Nidoran♂
    t[0x04] = 35;   // Clefairy
    t[0x05] = 21;   // Spearow
    t[0x06] = 100;  // Voltorb
    t[0x07] = 34;   // Nidoking
    t[0x08] = 80;   // Slowbro
    t[0x09] = 2;    // Ivysaur
    t[0x0A] = 103;  // Exeggutor
    t[0x0B] = 108;  // Lickitung
    t[0x0C] = 102;  // Exeggcute
    t[0x0D] = 88;   // Grimer
    t[0x0E] = 94;   // Gengar
    t[0x0F] = 29;   // Nidoran♀
    t[0x10] = 31;   // Nidoqueen
    t[0x11] = 104;  // Cubone
    t[0x12] = 111;  // Rhyhorn
    t[0x13] = 131;  // Lapras
    t[0x14] = 59;   // Arcanine
    t[0x15] = 151;  // Mew
    t[0x16] = 130;  // Gyarados
    t[0x17] = 90;   // Shellder
    t[0x18] = 72;   // Tentacool
    t[0x19] = 92;   // Gastly
    t[0x1A] = 123;  // Scyther
    t[0x1B] = 120;  // Staryu
    t[0x1C] = 9;    // Blastoise
    t[0x1D] = 127;  // Pinsir
    t[0x1E] = 114;  // Tangela
    // 0x1F-0x20 MissingNo
    t[0x21] = 58;   // Growlithe
    t[0x22] = 95;   // Onix
    t[0x23] = 22;   // Fearow
    t[0x24] = 16;   // Pidgey
    t[0x25] = 79;   // Slowpoke
    t[0x26] = 64;   // Kadabra
    t[0x27] = 75;   // Graveler
    t[0x28] = 113;  // Chansey
    t[0x29] = 67;   // Machoke
    t[0x2A] = 122;  // Mr. Mime
    t[0x2B] = 106;  // Hitmonlee
    t[0x2C] = 107;  // Hitmonchan
    t[0x2D] = 24;   // Arbok
    t[0x2E] = 47;   // Parasect
    t[0x2F] = 54;   // Psyduck
    t[0x30] = 96;   // Drowzee
    t[0x31] = 76;   // Golem
    // 0x32 MissingNo
    t[0x33] = 126;  // Magmar
    // 0x34 MissingNo
    t[0x35] = 125;  // Electabuzz
    t[0x36] = 82;   // Magneton
    t[0x37] = 109;  // Koffing
    // 0x38 MissingNo
    t[0x39] = 56;   // Mankey
    t[0x3A] = 86;   // Seel
    t[0x3B] = 50;   // Diglett
    t[0x3C] = 128;  // Tauros
    // 0x3D-0x3F MissingNo
    t[0x40] = 83;   // Farfetch'd
    t[0x41] = 48;   // Venonat
    t[0x42] = 149;  // Dragonite
    // 0x43-0x45 MissingNo
    t[0x46] = 84;   // Doduo
    t[0x47] = 60;   // Poliwag
    t[0x48] = 124;  // Jynx
    t[0x49] = 146;  // Moltres
    t[0x4A] = 144;  // Articuno
    t[0x4B] = 145;  // Zapdos
    t[0x4C] = 132;  // Ditto
    t[0x4D] = 52;   // Meowth
    t[0x4E] = 98;   // Krabby
    // 0x4F-0x51 MissingNo
    t[0x52] = 37;   // Vulpix
    t[0x53] = 38;   // Ninetales
    t[0x54] = 25;   // Pikachu
    t[0x55] = 26;   // Raichu
    // 0x56-0x57 MissingNo
    t[0x58] = 147;  // Dratini
    t[0x59] = 148;  // Dragonair
    t[0x5A] = 140;  // Kabuto
    t[0x5B] = 141;  // Kabutops
    t[0x5C] = 116;  // Horsea
    t[0x5D] = 117;  // Seadra
    // 0x5E-0x5F MissingNo
    t[0x60] = 27;   // Sandshrew
    t[0x61] = 28;   // Sandslash
    t[0x62] = 138;  // Omanyte
    t[0x63] = 139;  // Omastar
    t[0x64] = 142;  // Aerodactyl
    // 0x65 MissingNo
    t[0x66] = 133;  // Eevee
    t[0x67] = 134;  // Vaporeon
    t[0x68] = 135;  // Jolteon
    t[0x69] = 136;  // Flareon
    // 0x6A MissingNo
    t[0x6B] = 137;  // Porygon
    t[0x6C] = 143;  // Snorlax
    t[0x6D] = 150;  // Mewtwo
    // 0x6E-0x76 MissingNo
    t[0x77] = 85;   // Dodrio
    // 0x78 MissingNo
    t[0x79] = 20;   // Raticate
    // 0x7A MissingNo
    t[0x7B] = 89;   // Muk
    // 0x7C MissingNo
    t[0x7D] = 78;   // Rapidash
    // 0x7E-0x7F MissingNo
    t[0x80] = 3;    // Venusaur
    t[0x81] = 6;    // Charizard
    t[0x82] = 12;   // Butterfree
    t[0x83] = 19;   // Rattata
    // 0x84 MissingNo
    t[0x85] = 30;   // Nidorina
    t[0x86] = 33;   // Nidorino
    t[0x87] = 41;   // Zubat
    t[0x88] = 42;   // Golbat
    t[0x89] = 23;   // Ekans
    t[0x8A] = 15;   // Oddish
    t[0x8B] = 18;   // Gloom
    t[0x8C] = 45;   // Vileplume
    t[0x8D] = 119;  // Goldeen
    t[0x8E] = 121;  // Starmie
    t[0x8F] = 110;  // Weezing
    t[0x90] = 118;  // Seaking
    t[0x91] = 73;   // Tentacruel
    // 0x92-0x96 MissingNo
    t[0x97] = 87;   // Dewgong
    // 0x98 MissingNo
    t[0x99] = 1;    // Bulbasaur
    t[0x9A] = 3;    // Venusaur (duplicate? skip)
    t[0x9B] = 73;   // Tentacruel (duplicate? skip)
    // Remaining entries are more MissingNo or duplicates
    return t;
  })();

  // Convert Gen1 internal species ID to National Dex ID
  static gen1InternalToNational(internalId) {
    return SaveParser.GEN1_INTERNAL_TO_NATIONAL[internalId] || 0;
  }

  // Gen1 (RBY) save structure (32KB = 4 × 8KB banks):
  // Bank 1 (0x2000-0x3FFF) contains party data at various offsets.
  // Party layout: count(1) + species(6 bytes, padded with 0x00) + mons(6×44) + OT(6×11) + nick(6×11)
  // Mon struct (44 bytes): species(1) + curHP(2) + status(1) + type1(1) + type2(1) + catchRate(1) + moves(4)
  //   + OTID(2) + exp(3) + evs(5) + dvs(4) + pp(4) + level(1 at +0x21)
  //
  // Known party offsets in different save formats:
  //   SGB Enhanced saves (most emulators): 0x2F2C
  //   Some emulators use different RAM layouts
  static parseGen1(buffer) {
    if (buffer.length < 0x100) return [];

    Logger.info('Gen1', `Parsing ${buffer.length} byte save`);

    // Gen1 (RBY) save structure: two copies of party data at different offsets.
    // Different emulators use different formats:
    //   - Original GB/SGB: Bank0 party at 0x0F2C, Bank1 party at 0x2F2C
    //   - Some emulators: party at 0x2F2C only (single bank)
    //   - Counters can be 8-bit or 16-bit depending on emulator
    const partyOffsets = [
      0x2F2C, 0x0F2C, // Standard RBY offsets
      0x2F2D, 0x0F2D, // Shifted +1
      0x2F2B, 0x0F2B, // Shifted -1
      0x302C, 0x102C, // Shifted +0x100
      0x2E2C, 0x0E2C, // Shifted -0x100
    ];

    // Try each party offset directly (most common case: file has valid party data)
    for (const off of partyOffsets) {
      const result = SaveParser.tryGen1At(buffer, off);
      if (result.length > 0) {
        Logger.info('Gen1', `Found party at offset 0x${off.toString(16)}`);
        return result;
      }
    }

    // Fallback: search entire file for party structure
    return SaveParser.searchGen1Party(buffer);
  }

  static tryGen1At(buffer, off) {
    if (off + 404 > buffer.length) return [];

    const partyCount = buffer[off] & 0xFF;
    if (partyCount < 1 || partyCount > 6) return [];

    // Validate species list — Gen1 uses INTERNAL IDs (0x01-0xBE = 1-190)
    const internalIds = [];
    for (let i = 0; i < partyCount; i++) {
      const sid = buffer[off + 1 + i] & 0xFF;
      if (sid === 0 || sid > 255) return [];
      internalIds.push(sid);
    }

    // Gen1 party layout (Bulbapedia):
    // count(1) + species(6) + terminator(0xFF) = 8 bytes
    // then monData(partyCount×44) + OT_names(partyCount×11) + nicknames(partyCount×11)
    const monStart = off + 8;
    let valid = true;
    for (let i = 0; i < partyCount; i++) {
      const monOff = monStart + (i * 44);
      if (monOff + 44 > buffer.length) { valid = false; break; }
      const monSpecies = buffer[monOff] & 0xFF;
      const level = buffer[monOff + 0x21] & 0xFF;
      if (monSpecies !== internalIds[i] || level < 1 || level > 100) { valid = false; break; }
    }
    if (valid) {
      const pokemon = [];
      const { getPokemonName } = require('./pokemon-data');
      for (let i = 0; i < partyCount; i++) {
        const monOff = monStart + (i * 44);
        const internalId = internalIds[i];
        const speciesId = SaveParser.gen1InternalToNational(internalId);
        if (speciesId === 0) continue; // unknown internal ID
        const level = buffer[monOff + 0x21] & 0xFF;
        // Gen1 layout: monData(count*44) + OT_names(count*11) + nicknames(count*11)
        const otNameOff = monStart + (partyCount * 44) + (i * 11);
        const nickOff = monStart + (partyCount * 44) + (partyCount * 11) + (i * 11);
        let nickname = nickOff + 11 <= buffer.length ? SaveParser.readGen1String(buffer, nickOff, 11) : '';
        if (!nickname || !/[a-zA-Z]/.test(nickname)) {
          nickname = otNameOff + 11 <= buffer.length ? SaveParser.readGen1String(buffer, otNameOff, 11) : '';
        }
        if (!nickname || !/[a-zA-Z]/.test(nickname)) {
          nickname = getPokemonName(speciesId);
        }
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
    return [];
  }

  static searchGen1Party(buffer) {
    Logger.info('Gen1', 'Searching entire file for party data...');

    const MON_SIZE = 44;
    const candidates = [];

    // Strategy: find count byte, validate species list (internal IDs 1-190), then check mon data
    for (let i = 0; i < buffer.length - MON_SIZE; i++) {
      const count = buffer[i] & 0xFF;
      if (count < 1 || count > 6) continue;

      // Read species list — Gen1 uses internal IDs (0x01-0xBE = 1-190)
      let valid = true;
      const species = [];
      for (let j = 0; j < count; j++) {
        const s = buffer[i + 1 + j] & 0xFF;
        if (s === 0 || s > 190) { valid = false; break; }
        species.push(s);
      }
      if (!valid || species.length === 0) continue;

      // Try mon data offsets: compact (i+7) and padded (i+8)
      const monOffsets = [
        i + 7,           // count(1) + species(6) compact
        i + 8,           // count(1) + species(6) + pad(1)
      ];

      for (const monStart of monOffsets) {
        if (monStart + count * MON_SIZE > buffer.length) continue;

        let matchScore = 0;
        let hasNonZero = false;

        for (let m = 0; m < count; m++) {
          const mp = monStart + m * MON_SIZE;
          if (mp + 0x22 >= buffer.length) { matchScore = 0; break; }

          const monSp = buffer[mp] & 0xFF;
          // Species must match the list
          if (monSp !== species[m]) { matchScore = 0; break; }

          // Level must be valid — Gen1: +0x21 is level
          const level = buffer[mp + 0x21] & 0xFF;
          if (level < 1 || level > 100) { matchScore = 0; break; }

          // HP validation — Gen1: +0x01 is current HP (uint16 LE), +0x02 is max HP
          const curHp = buffer.readUInt16LE(mp + 0x01);
          const maxHp = buffer.readUInt16LE(mp + 0x02);
          if (curHp <= 0 || maxHp <= 0 || curHp > maxHp || maxHp > 999) { matchScore = 0; break; }

          matchScore += 10;

          // Check mon has some non-zero data
          for (let b = 1; b < 0x22; b++) {
            if (buffer[mp + b] !== 0) { hasNonZero = true; break; }
          }
        }

        if (matchScore > 0 && hasNonZero) {
          // Gen1 layout: monData(count*44) + OT_names(count*11) + nicknames(count*11)
          const nickStart = monStart + count * MON_SIZE + count * 11;
          let nickBonus = 0;
          if (nickStart + 11 <= buffer.length) {
            for (let k = 0; k < 11; k++) {
              const c = buffer[nickStart + k];
              if (c === 0x50 || c === 0xFF) break;
              if ((c >= 0x01 && c <= 0x1A) || (c >= 0x61 && c <= 0x7A) || (c >= 0x80 && c <= 0x99) || c === 0x7D) nickBonus++;
            }
          }

          const totalScore = matchScore + (count * 20) + nickBonus * 5;
          candidates.push({
            offset: i, count, species: species.slice(), score: totalScore,
            partyData: monStart, monStride: MON_SIZE,
            nickOffset: monStart + count * MON_SIZE + count * 11,
            levelOffset: 0x21
          });
          break;
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 0) {
      const best = candidates[0];
      if (best.score >= 20) {
        Logger.info('Gen1', `Found party at 0x${best.offset.toString(16)} score=${best.score} count=${best.count} species=[${best.species}]`);
        const pokemon = [];
        const { getPokemonName } = require('./pokemon-data');
        for (let i = 0; i < best.count; i++) {
          const internalId = best.species[i];
          const speciesId = SaveParser.gen1InternalToNational(internalId);
          if (speciesId === 0) continue;
          const monOff = best.partyData + (i * best.monStride);
          const level = buffer[monOff + best.levelOffset] || 5;
          let nickname = SaveParser.readGen1String(buffer, best.nickOffset + (i * 11), 11);
          if (!nickname || !/[a-zA-Z]/.test(nickname)) {
            const otNameOff = best.partyData + best.count * best.monStride + (i * 11);
            nickname = SaveParser.readGen1String(buffer, otNameOff, 11);
          }
          if (!nickname || !/[a-zA-Z]/.test(nickname)) {
            nickname = getPokemonName(speciesId);
          }
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
    }

    Logger.info('Gen1', 'No valid party found');
    return [];
  }

  // ==================== GEN 2 ====================
  static parseGen2(buffer) {
    if (buffer.length < 0x100) return [];

    // Gen2 (GSC) save structure - verified from Bulbapedia:
    // Party layout: count(1) + species(6) + terminator(0xFF) + mons(6×48) + OT(6×11) + nick(6×11)
    // Gold/Silver primary: partyCount=0x288A
    // Gold/Silver backup: partyCount=0x10E8
    // Crystal primary: partyCount=0x2865
    // Crystal backup: partyCount=0x1A65
    const offsets = [
      { partyCount: 0x288A, speciesList: 0x288B, partyData: 0x2892, nickOffset: 0x29F4, nickLen: 11 },
      { partyCount: 0x10E8, speciesList: 0x10E9, partyData: 0x10F0, nickOffset: 0x1252, nickLen: 11 },
      { partyCount: 0x2865, speciesList: 0x2866, partyData: 0x286D, nickOffset: 0x29CF, nickLen: 11 },
      { partyCount: 0x1A65, speciesList: 0x1A66, partyData: 0x1A6D, nickOffset: 0x1BCF, nickLen: 11 },
    ];

    // Try all blocks
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
      if (sid === 0 || sid > 255) return [];
      speciesIds.push(sid);
    }
    // Gen2 mon struct is 48 bytes: species(1) + item(1) + moves(4) + OTID(2) + Exp(3) + ... + level at +0x1F
    const MON_SIZE = 48;
    const pokemon = [];
    for (let i = 0; i < partyCount; i++) {
      const speciesId = speciesIds[i];
      let nickname = SaveParser.readGen1String(buffer, off.nickOffset + (i * off.nickLen), off.nickLen);
      if (!nickname || !/[a-zA-Z]/.test(nickname)) {
        const { getPokemonName } = require('./pokemon-data');
        nickname = getPokemonName(speciesId);
      }
      const monBase = off.partyData + (i * MON_SIZE);
      const level = buffer[monBase + 0x1F] || 1;

      // Gen2 shiny detection based on DVs
      // DVs are at offset 0x01 in the party struct (4 bytes: Atk/Def/Spd/Spc)
      // Shiny requires: Attack DV = 10, Defense DV = 10, Speed DV = 10, Spc DV = 10
      let isShiny = false;
      const dvOffset = monBase + 0x01;
      if (dvOffset + 4 <= buffer.length) {
        const atkDef = buffer[dvOffset];
        const spc = buffer[dvOffset + 3];
        isShiny = (atkDef & 0x0F) === 10 && ((atkDef >> 4) & 0x0F) === 10 && (spc & 0x0F) === 10 && ((spc >> 4) & 0x0F) === 10;
      }

      pokemon.push({
        speciesId, nickname,
        isShiny,
        isNicknamed: nickname !== '',
        level: Math.max(1, Math.min(100, level)),
        form: 0
      });
    }
    return pokemon;
  }

  // ==================== GEN 3 (GBA) ====================
  // GBA saves: VBA/mGBA = 128KB, some emulators = 256KB with duplicate blocks
  // RSE and FRLG have DIFFERENT party offsets within Sector 1.
  // Sector detection: magic 0x08012025 at +0xFF8, sector ID at +0xFF4, save counter at +0xFFC
  // Active slot: highest save counter in sector 0 header
  static parseGen3(buffer, gameInfo) {
    if (buffer.length < 0x800) return [];

    const version = (gameInfo && gameInfo.version) ? gameInfo.version : 'unknown';
    Logger.info('Gen3', `Parsing ${buffer.length} byte save (version=${version})`);

    const SIZE_SECTOR = 0x1000;
    const SIZE_MAIN = 0xE000;
    const COUNT_MAIN = 14;
    const GBA_MAGIC = 0x08012025;
    const SIZE_3PARTY = 100;

    // --- Shared helpers: sector detection and slot validation ---

    function isSlotValid(slot) {
      const start = slot * SIZE_MAIN;
      if (start + SIZE_MAIN > buffer.length) return false;
      let bitTrack = 0;
      let validSectors = 0;
      for (let ofs = start; ofs < start + SIZE_MAIN; ofs += SIZE_SECTOR) {
        if (ofs + 0xFFC > buffer.length) return false;
        const id = buffer.readUInt16LE(ofs + 0xFF4);
        if (id >= COUNT_MAIN) return false;
        const magic = buffer.readUInt32LE(ofs + 0xFF8);
        if (magic !== GBA_MAGIC) return false;
        bitTrack |= (1 << id);
        validSectors++;
      }
      return validSectors === COUNT_MAIN && bitTrack === 0x3FFF;
    }

    function findSectorOffset(slot, targetId) {
      const start = slot * SIZE_MAIN;
      const end = start + SIZE_MAIN;
      for (let ofs = start; ofs < end; ofs += SIZE_SECTOR) {
        if (ofs + 0xFF4 > buffer.length) continue;
        const id = buffer.readUInt16LE(ofs + 0xFF4);
        if (id === targetId) return ofs;
      }
      return -1;
    }

    // Determine active slot by save counter in sector 0
    const slots = [];
    const v0 = isSlotValid(0);
    const v1 = isSlotValid(1);
    Logger.info('Gen3', `Slot validation: slot0=${v0}, slot1=${v1}`);

    if (v0 || v1) {
      if (v0 && v1) {
        const s0Ofs = findSectorOffset(0, 0);
        const s1Ofs = findSectorOffset(1, 0);
        let counter0 = 0, counter1 = 0;
        if (s0Ofs >= 0) counter0 = buffer.readUInt32LE(s0Ofs + 0xFFC);
        if (s1Ofs >= 0) counter1 = buffer.readUInt32LE(s1Ofs + 0xFFC);
        Logger.info('Gen3', `Both slots valid: counter0=${counter0} counter1=${counter1}`);
        if (counter0 >= counter1) {
          slots.push(0, 1);
        } else {
          slots.push(1, 0);
        }
      } else if (v0) {
        slots.push(0, 1);
      } else {
        slots.push(1, 0);
      }
    }

    if (slots.length === 0) {
      Logger.warn('Gen3', 'No valid GBA save slots found');
      return [];
    }
    Logger.info('Gen3', `Trying slots: [${slots.join(', ')}]`);

    // --- Shared: decrypt + deshuffle one Pokemon ---
    // Handles both standard encrypted Gen3 and unencrypted CFRU/fangame saves.
    // Standard Gen3: data is XOR-encrypted with PID^OTID, then shuffled
    // CFRU/fangames: data is only shuffled (no XOR encryption), checksum is 0
    function decryptAndRead(pokemonFileOfs) {
      if (pokemonFileOfs + SIZE_3PARTY > buffer.length) return null;

      const pid = buffer.readUInt32LE(pokemonFileOfs);
      const otId = buffer.readUInt32LE(pokemonFileOfs + 0x04);
      if (pid === 0) return null;

      // Read 48 bytes of substructure data from offset 0x20
      const rawData = Buffer.alloc(48);
      buffer.copy(rawData, 0, pokemonFileOfs + 0x20, pokemonFileOfs + 0x20 + 48);

      // Check not empty
      let hasData = false;
      for (let b = 0; b < 48; b++) {
        if (rawData[b] !== 0x00 && rawData[b] !== 0xFF) { hasData = true; break; }
      }
      if (!hasData) return null;

      const storedCS = buffer.readUInt16LE(pokemonFileOfs + 0x1C);

      // Determine if data is encrypted or unencrypted (CFRU/fangames):
      // Unencrypted party data has valid species (1-1025) at offset 0x00
      // and stored checksum is 0 (CFRU doesn't populate the checksum field)
      const rawSpecies = rawData.readUInt16LE(0x00);
      const isUnencrypted = storedCS === 0 && rawSpecies >= 1 && rawSpecies <= 1025;

      let data48;
      let computedCS;
      let csOk;

      if (isUnencrypted) {
        // CFRU/fangame: data is only shuffled, no XOR encryption
        data48 = rawData;
        computedCS = 0;
        csOk = true;
      } else {
        // Standard Gen3: XOR decrypt with PID^OTID seed
        const seed = (pid ^ otId) >>> 0;
        data48 = Buffer.from(rawData);
        for (let b = 0; b < 48; b += 4) {
          data48.writeUInt32LE((data48.readUInt32LE(b) ^ seed) >>> 0, b);
        }
        // Verify checksum
        computedCS = 0;
        for (let i = 0; i < 48; i += 2) {
          computedCS = (computedCS + data48.readUInt16LE(i)) & 0xFFFF;
        }
        csOk = storedCS === computedCS;
      }

      // Unshuffle 4 x12-byte blocks (Growth, Attacks, EVs/Misc, Misc/Condition)
      const sv = pid % 24;
      const bp = SaveParser.GEN3_BLOCK_POSITIONS;
      const unshuffled = Buffer.alloc(48);
      for (let blk = 0; blk < 4; blk++) {
        const srcBlock = bp[sv * 4 + blk];
        const srcOff = srcBlock * 12;
        const dstOff = blk * 12;
        for (let k = 0; k < 12; k++) {
          unshuffled[dstOff + k] = data48[srcOff + k];
        }
      }

      // Growth substructure is block 0 (bytes 0x00-0x0B)
      // Species is uint16 LE at offset 0x00
      const speciesId = unshuffled.readUInt16LE(0x00);
      const rawLevel = buffer[pokemonFileOfs + 0x54] || 0;
      const level = Math.max(1, Math.min(100, rawLevel));
      const curHp = buffer.readUInt16LE(pokemonFileOfs + 0x56);
      const maxHp = buffer.readUInt16LE(pokemonFileOfs + 0x58);

      return { pid, otId, sv, speciesId, rawLevel, level, curHp, maxHp, storedCS, computedCS, csOk, isUnencrypted };
    }

    // --- Shared: read nickname/OT and build result ---
    function buildPokemonResult(pokemonFileOfs, monData, i) {
      const { speciesId, level, curHp, maxHp, pid, otId, isShiny: _ } = monData;

      if (speciesId === 0 || speciesId > 1025) {
        Logger.debug('Gen3', `  Pokemon ${i}: invalid species ${speciesId}, skipping`);
        return null;
      }

      let hasStats = false;
      for (let s = 0x56; s < 0x64; s += 2) {
        if (buffer.readUInt16LE(pokemonFileOfs + s) > 0) { hasStats = true; break; }
      }
      if (!hasStats) {
        Logger.debug('Gen3', `  Pokemon ${i}: all stats zero, skipping`);
        return null;
      }

      const rawNickname = SaveParser.readGen3String(buffer, pokemonFileOfs + 0x08, 10);
      const otName = SaveParser.readGen3String(buffer, pokemonFileOfs + 0x12, 7);

      let nickname = rawNickname;
      if (rawNickname && !/[a-zA-Z0-9]/.test(rawNickname)) {
        const { getPokemonName } = require('./pokemon-data');
        nickname = getPokemonName(speciesId);
      } else if (!rawNickname) {
        const { getPokemonName } = require('./pokemon-data');
        nickname = getPokemonName(speciesId);
      }

      const xorResult = (pid ^ otId) & 0xFFFF;
      const isShiny = xorResult < 8;

      const result = {
        speciesId,
        nickname: nickname || '',
        isShiny,
        isNicknamed: nickname !== '' && nickname !== otName,
        level: Math.max(1, Math.min(100, level)),
        form: 0
      };

      Logger.info('Gen3', `  Pokemon ${i}: species=${speciesId} "${nickname}" lv${level} shiny=${isShiny} HP=${curHp}/${maxHp} cs=${monData.storedCS.toString(16)}==${monData.computedCS.toString(16)}?${monData.csOk}`);
      return result;
    }

    // --- RSE: teamCount at Sector1+0x234 (4 bytes LE), teamData at Sector1+0x238 ---
    function tryRSE(sector1FileOfs) {
      const teamCountOfs = sector1FileOfs + 0x234;
      const teamDataOfs = sector1FileOfs + 0x238;
      if (teamCountOfs + 4 > buffer.length) return [];

      const teamCount = buffer.readUInt32LE(teamCountOfs);
      Logger.info('Gen3-RSE', `teamCount=${teamCount} at 0x${teamCountOfs.toString(16)}`);
      if (teamCount < 1 || teamCount > 6) return [];

      const pokemon = [];
      for (let i = 0; i < teamCount; i++) {
        const monOfs = teamDataOfs + (i * SIZE_3PARTY);
        const monData = decryptAndRead(monOfs);
        if (!monData) { Logger.debug('Gen3-RSE', `  Pokemon ${i}: null data`); continue; }
        const result = buildPokemonResult(monOfs, monData, i);
        if (result) pokemon.push(result);
      }

      Logger.info('Gen3-RSE', `Parsed ${pokemon.length}/${teamCount} Pokemon`);
      return pokemon.length > 0 ? pokemon : [];
    }

    // --- FRLG: teamCount at Sector1+0x0034 (1 byte), teamData at Sector1+0x0038 ---
    function tryFRLG(sector1FileOfs) {
      const teamCountOfs = sector1FileOfs + 0x0034;
      const teamDataOfs = sector1FileOfs + 0x0038;
      if (teamCountOfs + 1 > buffer.length) return [];

      const teamCount = buffer[teamCountOfs];
      Logger.info('Gen3-FRLG', `teamCount=${teamCount} at 0x${teamCountOfs.toString(16)}`);
      if (teamCount < 1 || teamCount > 6) return [];

      const pokemon = [];
      for (let i = 0; i < teamCount; i++) {
        const monOfs = teamDataOfs + (i * SIZE_3PARTY);
        const monData = decryptAndRead(monOfs);
        if (!monData) { Logger.debug('Gen3-FRLG', `  Pokemon ${i}: null data`); continue; }
        const result = buildPokemonResult(monOfs, monData, i);
        if (result) pokemon.push(result);
      }

      Logger.info('Gen3-FRLG', `Parsed ${pokemon.length}/${teamCount} Pokemon`);
      return pokemon.length > 0 ? pokemon : [];
    }

    // --- Main loop: try each slot, route to RSE or FRLG ---
    // Include fangames based on each engine (CFRU = FireRed-based, etc.)
    const isRSE = ['ruby', 'sapphire', 'emerald', 'ruby_sapphire', 'emerald_jp'].includes(version);
    const isFRLG = ['firered', 'leafgreen', 'firered_leafgreen', 'radicalred'].includes(version);

    for (const slot of slots) {
      Logger.info('Gen3', `Trying slot ${slot}`);
      const sector1FileOfs = findSectorOffset(slot, 1);
      if (sector1FileOfs < 0) {
        Logger.warn('Gen3', `Slot ${slot}: Sector 1 not found`);
        continue;
      }
      Logger.info('Gen3', `Slot ${slot} Sector 1 at 0x${sector1FileOfs.toString(16)}`);

      const parsers = isRSE
        ? [['RSE', tryRSE], ['FRLG', tryFRLG]]
        : isFRLG
          ? [['FRLG', tryFRLG], ['RSE', tryRSE]]
          : [['RSE', tryRSE], ['FRLG', tryFRLG]];

      for (const [name, parser] of parsers) {
        Logger.info('Gen3', `Trying ${name} parser`);
        const result = parser(sector1FileOfs);
        if (result.length > 0) return result;
      }
    }

    Logger.warn('Gen3', 'No valid party data found in any slot');
    return [];
  }

  static get GEN3_BLOCK_POSITIONS() {
    return [
      0, 1, 2, 3, 0, 1, 3, 2, 0, 2, 1, 3, 0, 3, 1, 2,
      0, 2, 3, 1, 0, 3, 2, 1, 1, 0, 2, 3, 1, 0, 3, 2,
      2, 0, 1, 3, 3, 0, 1, 2, 2, 0, 3, 1, 3, 0, 2, 1,
      1, 2, 0, 3, 1, 3, 0, 2, 2, 1, 0, 3, 3, 1, 0, 2,
      2, 3, 0, 1, 3, 2, 0, 1, 1, 2, 3, 0, 1, 3, 2, 0,
      2, 1, 3, 0, 3, 1, 2, 0, 2, 3, 1, 0, 3, 2, 1, 0
    ];
  }

  // ==================== GEN 4 (NDS: D/P/Pt/HG/SS) ====================
  // NDS saves: DeSmuME = 512KB (dual-block), melonDS = 512KB
  // Gen4 PK4 structure (236 bytes for party, 136 for stored):
  //   +0x00: PID (u32)
  //   +0x04: TID (u16)
  //   +0x06: Checksum (u16) — used as XOR key for decryption
  //   +0x08: Encrypted data (128 bytes = 4 blocks × 32 bytes)
  //   +0x88: Party stats (100 bytes, encrypted with PID)
  // Decryption: XOR with checksum, then unshuffle 4 blocks
  // Shuffle value: (PID >> 13) & 31, block size = 32 bytes

  static PK4_SHUFFLE_POSITIONS = [
    0,1,2,3, 0,1,3,2, 0,2,1,3, 0,3,1,2, 0,2,3,1, 0,3,2,1,
    1,0,2,3, 1,0,3,2, 2,0,1,3, 3,0,1,2, 2,0,3,1, 3,0,2,1,
    1,2,0,3, 1,3,0,2, 2,1,0,3, 3,1,0,2, 2,3,0,1, 3,2,0,1,
    1,2,3,0, 1,3,2,0, 2,1,3,0, 3,1,2,0, 2,3,1,0, 3,2,1,0,
  ];

  static decryptPK4(data) {
    if (data.length < 136) return null;
    const result = Buffer.from(data);

    const pid = result.readUInt32LE(0);
    const checksum = result.readUInt16LE(6);
    if (pid === 0 || pid === 0xFFFFFFFF) return null;

    const sv = (pid >> 13) & 31;

    // Step 1: XOR decrypt main data (8..136) with checksum seed
    let seed = checksum;
    for (let addr = 8; addr < 136; addr += 2) {
      seed = (0x41C64E6D * seed + 0x6073) >>> 0;
      const xor = (seed >> 16) & 0xFFFF;
      result.writeUInt16LE(result.readUInt16LE(addr) ^ xor, addr);
    }

    // Step 2: XOR decrypt party stats (136..236) with PID seed
    if (data.length > 136) {
      let pidSeed = pid;
      for (let addr = 136; addr < data.length; addr += 2) {
        pidSeed = (0x41C64E6D * pidSeed + 0x6073) >>> 0;
        const xor = (pidSeed >> 16) & 0xFFFF;
        result.writeUInt16LE(result.readUInt16LE(addr) ^ xor, addr);
      }
    }

    // Step 3: Unshuffle 4 blocks of 32 bytes
    if (sv !== 0 && sv < 24) {
      const shuffle = SaveParser.PK4_SHUFFLE_POSITIONS.slice(sv * 4, sv * 4 + 4);
      const blocks = [];
      for (let i = 0; i < 4; i++) {
        blocks.push(result.slice(8 + i * 32, 8 + (i + 1) * 32));
      }
      for (let i = 0; i < 4; i++) {
        blocks[shuffle[i]].copy(result, 8 + i * 32);
      }
    }

    return result;
  }

  static parseGen4(buffer) {
    if (buffer.length < 0x10000) return [];

    Logger.info('Gen4', `parseGen4: buffer=${buffer.length} bytes`);

    // Find active block via counter-based detection or try common offsets
    const candidates = [];

    // Standard 512KB dual-block: Block A at 0x00000, Block B at 0x40000
    // Active block detected via footer counters at block_end - 0x14
    if (buffer.length >= 0x80000) {
      const blockAActive = SaveParser.isGen4BlockActive(buffer, 0x00000, 0x40000);
      const blockBActive = SaveParser.isGen4BlockActive(buffer, 0x40000, 0x40000);

      Logger.info('Gen4', `Block A active: ${blockAActive}, Block B active: ${blockBActive}`);

      if (blockBActive) candidates.push({ offset: 0x40000, label: 'Block B' });
      if (blockAActive) candidates.push({ offset: 0x00000, label: 'Block A' });

      // If no block detected as active, try both
      if (!blockAActive && !blockBActive) {
        candidates.push({ offset: 0x40000, label: 'Block B (fallback)' });
        candidates.push({ offset: 0x00000, label: 'Block A (fallback)' });
      }
    }

    // Single-block 256KB
    if (buffer.length >= 0x40000 && buffer.length < 0x80000) {
      candidates.push({ offset: 0x00000, label: 'Single 256KB' });
    }

    // Try the whole buffer as a last resort
    if (candidates.length === 0) {
      candidates.push({ offset: 0x00000, label: 'Full buffer' });
    }

    for (const c of candidates) {
      Logger.info('Gen4', `Trying ${c.label} at 0x${c.offset.toString(16)}`);
      const result = SaveParser.tryGen4Party(buffer, c.offset);
      if (result.length > 0) {
        Logger.info('Gen4', `FOUND party at ${c.label}: ${result.map(p => `${p.speciesId}(${p.nickname || '?'})`).join(', ')}`);
        return result;
      }
    }

    Logger.info('Gen4', 'Standard offsets failed, trying scan...');
    return SaveParser.scanForGen4Team(buffer);
  }

  static isGen4BlockActive(buffer, blockOffset, blockSize) {
    if (blockOffset + blockSize > buffer.length) return false;
    // Footer at block_end - 0x14: contains block counters
    // For HGSS General block: footer at block + 0xF628 - 0x14 = block + 0xF614
    // For DP/Pt General block: footer at block + 0xE000 - 0x14 = block + 0xDFEC
    // Inactive block: major counter = 0xFFFFFFFF, Active: at least one != 0xFFFFFFFF
    // Try HGSS size first, then DP/Pt, then generic
    const footerOffsets = [
      blockOffset + 0xF614,   // HGSS GeneralSize (0xF628) - 0x14
      blockOffset + 0xDFEC,   // DP/Pt GeneralSize (0xE000) - 0x14
      blockOffset + blockSize - 0x14, // Generic fallback
    ];
    for (const footerOfs of footerOffsets) {
      if (footerOfs + 0x14 > buffer.length) continue;
      const major = buffer.readUInt32LE(footerOfs + 0x10);
      const minor = buffer.readUInt32LE(footerOfs + 0x0C);
      if (major === 0xFFFFFFFF && minor === 0xFFFFFFFF) return false;
      if (major === 0 && minor === 0) continue; // Not this footer, try next
      return true;
    }
    return false;
  }

  static tryGen4Party(buffer, blockOffset) {
    // HGSS: partyCount at block+0x94 (1 byte), PK4s at block+0x98
    // DP/Pt: partyCount at block+0x00 (or similar), PK4s follow
    const offsets = [
      { countOfs: blockOffset + 0x94, countSize: 1, dataOfs: blockOffset + 0x98, label: 'HGSS (0x98)' },
      { countOfs: blockOffset + 0x00, countSize: 4, dataOfs: blockOffset + 0x08, label: 'DP/Pt (0x00)' },
      { countOfs: blockOffset + 0x00, countSize: 1, dataOfs: blockOffset + 0x08, label: 'DP/Pt-alt (0x00)' },
    ];

    for (const o of offsets) {
      if (o.countOfs + o.countSize > buffer.length || o.dataOfs + 236 > buffer.length) continue;

      let partyCount;
      if (o.countSize === 4) partyCount = buffer.readUInt32LE(o.countOfs);
      else partyCount = buffer[o.countOfs];

      if (partyCount < 1 || partyCount > 6) continue;

      Logger.info('Gen4', `  ${o.label}: partyCount=${partyCount}`);

      const result = SaveParser.readGen4PartyPK4(buffer, o.dataOfs, partyCount);
      if (result.length > 0) return result;
    }
    return [];
  }

  static readGen4PartyPK4(buffer, dataOffset, count) {
    const SIZE_4PARTY = 236;
    if (dataOffset + count * SIZE_4PARTY > buffer.length) return [];

    const pokemon = [];
    for (let i = 0; i < count; i++) {
      const ofs = dataOffset + i * SIZE_4PARTY;
      const monData = buffer.slice(ofs, ofs + SIZE_4PARTY);
      if (monData.length < SIZE_4PARTY) continue;

      const decrypted = SaveParser.decryptPK4(monData);
      if (!decrypted) continue;

      const pid = decrypted.readUInt32LE(0);
      const species = decrypted.readUInt16LE(8);
      if (species === 0 || species > 1025) continue;

      // Level from party stats: at offset SIZE_4STORED + 8 = 0x90
      const level = decrypted.length > 0x90 ? decrypted.readUInt8(0x90) : 1;
      const validLevel = (level >= 1 && level <= 100);

      // Nickname at offset 0x40 in decrypted data (Gen4 custom encoding, 10 chars)
      const nickname = SaveParser.readGen4String(decrypted, 0x40, 10);

      // OT name at offset 0x48 (Gen4 custom encoding, 7 chars)
      const otName = SaveParser.readGen4String(decrypted, 0x48, 7);

      // Shiny check: (PID >> 16) ^ (PID & 0xFFFF) ^ TID ^ SID < 16
      const tid = decrypted.readUInt16LE(4);
      // SID is at offset 0x06 in the decrypted data (inside the header, not encrypted)
      const sid = decrypted.readUInt16LE(6);
      const xorShiny = ((pid >>> 16) ^ (pid & 0xFFFF) ^ tid ^ sid) & 0xFFFF;
      const isShiny = pid !== 0 ? xorShiny < 16 : false;

      Logger.info('Gen4', `  PK4 #${i + 1}: species=${species} level=${level}${validLevel ? '' : '(?)'} pid=0x${pid.toString(16)} nick="${nickname}" ot="${otName}" shiny=${isShiny}`);

      pokemon.push({
        speciesId: species,
        nickname: nickname || '',
        isShiny,
        isNicknamed: nickname !== '',
        level: validLevel ? level : 1,
        form: 0
      });
    }
    return pokemon;
  }

  static scanForGen4Team(buffer) {
    // Brute-force scan for valid PK4 structures with matching checksum
    Logger.info('Gen4', 'Starting brute-force scan for PK4 structures...');

    const maxScan = Math.min(buffer.length, 0x80000);
    for (let offset = 0; offset < maxScan - 236; offset += 4) {
      const pid = buffer.readUInt32LE(offset);
      if (pid === 0 || pid === 0xFFFFFFFF) continue;

      const checksum = buffer.readUInt16LE(offset + 6);

      // Quick sanity: encrypt then verify checksum matches
      const testMon = buffer.slice(offset, offset + 236);
      const decrypted = SaveParser.decryptPK4(testMon);
      if (!decrypted) continue;

      const species = decrypted.readUInt16LE(8);
      if (species >= 1 && species <= 1025) {
        // PK4 party stats start at offset 0x88
        // +0x00: level (uint8), +0x02: curHp (uint16 LE), +0x04: maxHp (uint16 LE)
        const level = decrypted.length > 0x88 ? decrypted.readUInt8(0x88) : 0;
        const curHp = decrypted.length > 0x8A ? decrypted.readUInt16LE(0x8A) : 0;
        const maxHp = decrypted.length > 0x8C ? decrypted.readUInt16LE(0x8C) : 0;
        if (level >= 1 && level <= 100 && curHp > 0 && maxHp > 0 && curHp <= maxHp && maxHp <= 999) {
          Logger.info('Gen4', `Scan found PK4 at 0x${offset.toString(16)}: species=${species} level=${level} HP=${curHp}/${maxHp}`);
          return [{
            speciesId: species,
            nickname: '',
            isShiny: false,
            isNicknamed: false,
            level,
            form: 0
          }];
        }
      }
    }

    Logger.error('Gen4', 'No PK4 found anywhere');
    return [];
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

      if (partyCount === 0) {
        Logger.info('Gen5', `Party count is 0 at ${c.label}, party is empty`);
        return [];
      }
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

        const tid = pokemonData.readUInt16LE(4);
        const sid = pokemonData.readUInt16LE(6);
        const xorShiny = ((pid >>> 16) ^ (pid & 0xFFFF) ^ tid ^ sid) & 0xFFFF;
        const isShiny = xorShiny < 16;

        if (speciesId === 0 || speciesId > 1025) {
          Logger.debug('Gen5', `  PK5 #${i + 1}: invalid species ${speciesId}, skipping`);
          continue;
        }

        const validLevel = (level >= 1 && level <= 100);
        const validHp = (curHp > 0 && maxHp > 0 && curHp <= maxHp && maxHp <= 999);

        Logger.info('Gen5', `  PK5 #${i + 1}: species=${speciesId} level=${level}${validLevel ? '' : '(?)'} HP=${curHp}/${maxHp}${validHp ? '' : '(?)'} nickname="${nickname}" sv=${sv} shiny=${isShiny}`);

        pokemon.push({
          speciesId,
          nickname: nickname || '',
          isShiny,
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
        if (sid === 0 || sid > 1025) { valid = false; break; }
        ids.push(sid);
      }
      if (!valid || ids.length === 0) continue;

      if (count < 6) {
        const after = buffer.readUInt16LE(speciesListOff + (count * 2));
        if (after !== 0) continue;
      }

      // Validate: check byte before count is 0 (party count marker)
      if (offset > 0 && buffer[offset - 1] !== 0) continue;

      // Validate full PK5 structure at expected offset
      // PK5 is 220 bytes (0xDC) per Pokemon, starting 8 bytes after the compact list
      const pk5Start = speciesListOff + count * 2;
      // Align to 4 bytes
      const alignedStart = (pk5Start + 3) & ~3;
      let structureValid = true;

      for (let i = 0; i < count; i++) {
        const pOff = alignedStart + (i * 0xDC);
        if (pOff + 0xDC > buffer.length) { structureValid = false; break; }

        try {
          const pokemonData = buffer.slice(pOff, pOff + 0xDC);
          const { decrypted, data } = SaveParser.decryptPK5(pokemonData);

          const pkSpecies = decrypted.readUInt16LE(0);
          const level = data.length > 0x8C ? data.readUInt8(0x8C) : 0;
          const curHp = data.length > 0x8F ? data.readUInt16LE(0x8E) : 0;
          const maxHp = data.length > 0x91 ? data.readUInt16LE(0x90) : 0;

          if (pkSpecies !== ids[i]) { structureValid = false; break; }
          if (level < 1 || level > 100) { structureValid = false; break; }
          if (curHp <= 0 || maxHp <= 0 || curHp > maxHp || maxHp > 999) { structureValid = false; break; }
        } catch (e) {
          structureValid = false;
          break;
        }
      }

      if (!structureValid) continue;

      if (count >= 1) {
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
      const speciesCheck = data.readUInt16LE(0x08);
      const nickname = SaveParser.readNdsString(data, 0x40, 12);

      // Cross-validate species: the species in the Pokemon blob must match the species list
      if (speciesCheck !== speciesId) continue;
      if (speciesCheck === 0 || speciesCheck > maxSpecies) continue;

      // Level: 3DS Pokemon have level at offset 0x88 in the Pokemon struct
      const level = data.length > 0x88 ? data.readUInt8(0x88) : 0;
      if (level < 1 || level > 100) continue;

      // HP validation: check that stats are plausible
      // In 3DS format, current HP is at offset 0x8A, max HP at 0x8C
      const curHp = data.length > 0x8A ? data.readUInt16LE(0x8A) : 0;
      const maxHp = data.length > 0x8C ? data.readUInt16LE(0x8C) : 0;
      if (curHp <= 0 || maxHp <= 0 || curHp > maxHp || maxHp > 999) continue;

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

    // PLA uses SwishCrypto with PA8 format
    if (gameInfo && gameInfo.saveType === 'gen8pla') {
      return SaveParser.parseGen8SwSh(buffer, 'pa8');
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
  static parseGen8SwSh(buffer, format) {
    Logger.info('SwSh', `parseGen8SwSh: buffer=${buffer.length} bytes, format=${format || 'pk8'}`);

    try {
      // Decrypt SwishCrypto
      if (!SwishCrypto.isValid(buffer)) {
        Logger.error('SwSh', 'Invalid SwishCrypto hash');
        return [];
      }

      const blocks = SwishCrypto.decrypt(buffer);
      Logger.info('SwSh', `Parsed ${blocks.length} SCBlocks`);

      // Get party data (format: 'pk8' for SwSh, 'pa8' for PLA, 'pa9' for ZA)
      const party = SwishCrypto.getParty(blocks, format);
      if (!party || party.pokemon.length === 0) {
        Logger.error('SwSh', 'No party data found');
        return [];
      }

      Logger.info('SwSh', `Party count: ${party.partyCount}, format: ${party.format}`);

      const isPA8 = party.format === 'pa8';
      const result = [];
      for (let i = 0; i < party.pokemon.length; i++) {
        const pkData = party.pokemon[i];
        // All formats are already decrypted by getParty
        const decrypted = pkData;

        const speciesId = decrypted.readUInt16LE(0x08);
        if (speciesId === 0 || speciesId > 1025) {
          Logger.debug('SwSh', `P${i + 1}: Invalid species ${speciesId}, skipping`);
          continue;
        }

        const heldItem = decrypted.readUInt16LE(0x0A);
        const exp = decrypted.readUInt32LE(0x10);
        const altForm = decrypted.readUInt16LE(0x16);
        const pid = decrypted.readUInt32LE(0x1C);

        // PA8 offsets: Nickname at 0x60, OT at 0x110, Level at 0x92
        // PK8 offsets: Nickname at 0x58, OT at 0xF8
        const nickOffset = isPA8 ? 0x60 : 0x58;
        const otOffset = isPA8 ? 0x110 : 0xF8;
        const levelOffset = isPA8 ? 0x92 : 0x88;
        let nickname = '';
        for (let j = nickOffset; j < nickOffset + 24; j += 2) {
          const ch = decrypted.readUInt16LE(j);
          if (ch === 0) break;
          nickname += String.fromCharCode(ch);
        }

        let otName = '';
        for (let j = otOffset; j < otOffset + 24; j += 2) {
          const ch = decrypted.readUInt16LE(j);
          if (ch === 0) break;
          otName += String.fromCharCode(ch);
        }

        // Level from party stats
        let level = 1;
        if (isPA8) {
          // PA8: level at 0x92
          level = decrypted[0x92] || 1;
        } else if (decrypted.length > 0x148) {
          // PK8: level at 0x148
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
      if (partyCount === 0) {
        Logger.info('BDSP', 'Party count is 0, party is empty');
      } else {
        Logger.error('BDSP', `Invalid party count: ${partyCount}`);
      }
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
        const tid = dec.readUInt16LE(0x04);
        const sid = dec.readUInt16LE(0x06);
        const formByte = dec.readUInt8(0x24);
        const nickname = SaveParser.readPB8String(dec, 0x58, 26);
        const ot = SaveParser.readPB8String(dec, 0xF8, 26);
        const level = dec.readUInt8(SaveParser.BDSP_SIZE_8STORED + 0x00) || 1;

        const xorShiny = ((pid >>> 16) ^ (pid & 0xFFFF) ^ tid ^ sid) & 0xFFFF;
        const isShiny = xorShiny < 16;

        if (speciesId === 0 || speciesId > 1025) {
          Logger.warn('BDSP', `P${i + 1}: invalid species ${speciesId}, skipping`);
          continue;
        }

        const formSuffix = SaveParser.getRegionalForm(speciesId, formByte);
        Logger.info('BDSP', `P${i + 1}: species=${speciesId} pid=0x${pid.toString(16).padStart(8, '0')} sv=${sv} formByte=${formByte} form="${formSuffix}" level=${level} nick="${nickname}" ot="${ot}" shiny=${isShiny}`);

        pokemon.push({
          speciesId,
          nickname: nickname || '',
          isShiny,
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

  // ==================== GEN 9 (Switch: S/V, Z-A) ====================
  static parseGen9(buffer, gameInfo) {
    if (buffer.length < 0x10000) return [];

    // Z-A uses SwishCrypto with PA9 format
    if (gameInfo && gameInfo.saveType === 'gen9za') {
      return SaveParser.parseGen8SwSh(buffer, 'pa9');
    }

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
      const speciesCheck = data.readUInt16LE(0x08);

      // Cross-validate species
      if (speciesCheck !== speciesId) continue;

      // Switch Pokemon use UTF-16LE for nicknames, not NDS encoding
      let nickname = '';
      try {
        const nickBuf = data.slice(0x40, 0x58);
        for (let j = 0; j < nickBuf.length - 1; j += 2) {
          const ch = nickBuf.readUInt16LE(j);
          if (ch === 0 || ch === 0xFFFF) break;
          if (ch >= 0x0020 && ch <= 0x007E) nickname += String.fromCharCode(ch);
          else if (ch >= 0xFF01 && ch <= 0xFF5E) nickname += String.fromCharCode(ch - 0xFEE0);
        }
      } catch (e) {}

      // Level: Switch PK8/PA8 have level at offset 0x88 (uint8) or 0x148 (uint8 in full PK8)
      // For compact 260-byte format, try 0x88 first
      const level = data.length > 0x88 ? data.readUInt8(0x88) : (data.length > 0x36 ? data.readUInt16LE(0x36) : 0);
      if (level < 1 || level > 100) continue;

      // HP validation
      const curHp = data.length > 0x8A ? data.readUInt16LE(0x8A) : 0;
      const maxHp = data.length > 0x8C ? data.readUInt16LE(0x8C) : 0;
      if (curHp <= 0 || maxHp <= 0 || curHp > maxHp || maxHp > 999) continue;

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

    // Switch Pokemon use UTF-16LE for nicknames
    let nickname = '';
    try {
      const nickBuf = data.slice(0x40, 0x58);
      for (let j = 0; j < nickBuf.length - 1; j += 2) {
        const ch = nickBuf.readUInt16LE(j);
        if (ch === 0 || ch === 0xFFFF) break;
        if (ch >= 0x0020 && ch <= 0x007E) nickname += String.fromCharCode(ch);
        else if (ch >= 0xFF01 && ch <= 0xFF5E) nickname += String.fromCharCode(ch - 0xFEE0);
      }
    } catch (e) {}

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

  static isShinyStd(pid, data) {
    const trainerId = data.readUInt16LE(0x04);
    const secretId = data.readUInt16LE(0x06);
    const highPid = (pid >> 16) & 0xFFFF;
    const lowPid = pid & 0xFFFF;
    return (highPid ^ lowPid ^ trainerId ^ secretId) < 16;
  }

  // ==================== GEN4 STRING ENCODING ====================
  // Gen4 uses a custom character table (NOT UTF-16LE).
  // Table from PKHeX StringConverter4Util.cs (international/English subset)
  static GEN4_CHAR_TABLE = [
    '\0','　','ぁ','あ','ぃ','い','ぅ','う','ぇ','え','ぉ','お','か','が','き','ぎ',
    'く','ぐ','け','げ','こ','ご','さ','ざ','し','じ','す','ず','せ','ぜ','そ','ぞ',
    'た','だ','ち','ぢ','っ','つ','づ','て','で','と','ど','な','に','ぬ','ね','の',
    'は','ば','ぱ','ひ','び','ぴ','ふ','ぶ','ぷ','へ','べ','ぺ','ほ','ぼ','ぽ','ま',
    'み','む','め','も','ゃ','や','ゅ','ゆ','ょ','よ','ら','り','る','れ','ろ','わ',
    'を','ん','ァ','ア','ィ','イ','ゥ','ウ','ェ','エ','ォ','オ','カ','ガ','キ','ギ',
    'ク','グ','ケ','ゲ','コ','ゴ','サ','ザ','シ','ジ','ス','ズ','セ','ゼ','ソ','ゾ',
    'タ','ダ','チ','ヂ','ッ','ツ','ヅ','テ','デ','ト','ド','ナ','ニ','ヌ','ネ','ノ',
    'ハ','バ','パ','ヒ','ビ','ピ','フ','ブ','プ','ヘ','ベ','ペ','ホ','ボ','ポ','マ',
    'ミ','ム','メ','モ','ャ','ヤ','ュ','ユ','ョ','ヨ','ラ','リ','ル','レ','ロ','ワ',
    'ヲ','ン','０','１','２','３','４','５','６','７','８','９','Ａ','Ｂ','Ｃ','Ｄ',
    'Ｅ','Ｆ','Ｇ','Ｈ','Ｉ','Ｊ','Ｋ','Ｌ','Ｍ','Ｎ','Ｏ','Ｐ','Ｑ','Ｒ','Ｓ','Ｔ',
    'Ｕ','Ｖ','Ｗ','Ｘ','Ｙ','Ｚ','ａ','ｂ','ｃ','ｄ','ｅ','ｆ','ｇ','ｈ','ｉ','ｊ',
    'ｋ','ｌ','ｍ','ｎ','ｏ','ｐ','ｑ','ｒ','ｓ','ｔ','ｕ','ｖ','ｗ','ｘ','ｙ','ｚ',
    '\0','！','？','、','。','…','・','／','「','」','『','』','（','）','♂','♀',
    '＋','ー','×','÷','＝','～','：','；','．','，','♠','♣','♥','♦','★','◎',
    '○','□','△','◇','＠','♪','％','☀','☁','☂','☃','①','②','③','④','⑤',
    '⑥','⑦','円','♈','♉','♊','♋','♌','♍','♎','♏','←','↑','↓','→','►',
    '＆','0','1','2','3','4','5','6','7','8','9','A','B','C','D','E',
    'F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U',
    'V','W','X','Y','Z','a','b','c','d','e','f','g','h','i','j','k',
    'l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','À',
    'Á','Â','Ã','Ä','Å','Æ','Ç','È','É','Ê','Ë','Ì','Í','Î','Ï','Ð',
    'Ñ','Ò','Ó','Ô','Õ','Ö','⑧','Ø','Ù','Ú','Û','Ü','Ý','Þ','ß','à',
    'á','â','ã','ä','å','æ','ç','è','é','ê','ë','ì','í','î','ï','ð',
    'ñ','ò','ó','ô','õ','ö','⑨','ø','ù','ú','û','ü','ý','þ','ÿ','Œ',
    'œ','Ş','ş','ª','º','⑩','⑪','⑫','$','¡','¿','!','?',',','.','⑬',
    '･','/','‘','\'','"','"','„','«','»','(',')','♂','♀','+','-','*',
    '#','=','&','~',':',';','⑯','⑰','⑱','⑲','⑳','⑴','⑵','⑶','⑷','⑸',
    '@','⑹','％','⑺','⑻','⑼','⑽','⑾','⑿','⒀','⒁','⒂','⒃','⒄',' ','⒅',
    '⒆','⒇','⒈','⒉','⒊','⒋','⒌','⒍','°','_','＿','⒎','⒏',
  ];

  // Gen4 terminator value
  static GEN4_TERMINATOR = 0xFFFF;
  static GEN4_EMPTY = 0x0000;

  // Read a Gen4-encoded string from a buffer
  // Gen4 strings are uint16 LE values, each mapped through GEN4_CHAR_TABLE
  static readGen4String(buffer, offset, maxChars) {
    let str = '';
    for (let i = 0; i < maxChars; i++) {
      const val = buffer.readUInt16LE(offset + i * 2);
      if (val === SaveParser.GEN4_TERMINATOR || val === SaveParser.GEN4_EMPTY) break;
      const table = SaveParser.GEN4_CHAR_TABLE;
      if (val < table.length && table[val] !== '\0') {
        str += table[val];
      } else if (val >= 0x0121 && val <= 0x013A) {
        // 0-9 range (0x121='0' to 0x13A='9')
        str += String.fromCharCode(0x30 + (val - 0x0121));
      } else if (val >= 0x0141 && val <= 0x015A) {
        // a-z range (0x141='a' to 0x15A='z')
        str += String.fromCharCode(0x61 + (val - 0x0141));
      } else if (val >= 0x0130 && val <= 0x0149) {
        // A-Z range (0x130='A' to 0x149='Z')
        str += String.fromCharCode(0x41 + (val - 0x0130));
      } else {
        str += '?';
      }
    }
    return str.trim();
  }

  // ==================== STRING READING ====================

  static readGen1String(buffer, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
      const c = buffer[offset + i];
      if (c === 0x50 || c === 0xFF || c === 0x00) break;
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
    const EXTENDED = '\u00A1\u00BF\u00C0\u00C1\u00C2\u00C3\u00C4\u00C5\u00C6\u00C7\u00C8\u00C9\u00CA\u00CB\u00CC\u00CD\u00CE\u00CF\u00D0\u00D1\u00D2\u00D3\u00D4\u00D5\u00D6\u00D8\u00D9\u00DA\u00DB\u00DC\u00DD\u00DE\u00DF\u00E0\u00E1\u00E2\u00E3\u00E4\u00E5\u00E6\u00E7\u00E8\u00E9\u00EA\u00EB\u00EC\u00ED\u00EE\u00EF\u00F0\u00F1\u00F2\u00F3\u00F4\u00F5\u00F6\u00F8\u00F9\u00FA\u00FB\u00FC\u00FD\u00FE\u00FF';
    let str = '';
    for (let i = 0; i < length; i++) {
      const c = buffer[offset + i];
      if (c === 0xFF || c === 0x00) break;
      if (c >= 0x01 && c <= 0x1A) str += String.fromCharCode(0x41 + (c - 1));
      else if (c >= 0x1B && c <= 0x34) str += String.fromCharCode(0x61 + (c - 0x1B));
      else if (c >= 0x35 && c <= 0x3E) str += String.fromCharCode(0x30 + (c - 0x35));
      else if (c === 0x3F) str += ' ';
      else if (c >= 0xA1 && c <= 0xFE) {
        const idx = c - 0xA1;
        str += idx < EXTENDED.length ? EXTENDED[idx] : '?';
      }
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

}

module.exports = SaveParser;
