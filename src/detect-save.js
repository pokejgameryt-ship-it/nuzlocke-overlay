const Logger = require('./logger');

class DetectSave {
  static detect(buffer) {
    if (!buffer || buffer.length < 100) return null;

    const size = buffer.length;
    const log = (msg) => Logger.info('Detect', msg);

    log(`Analyzing ${size} bytes (0x${size.toString(16).toUpperCase()})`);

    // === Gen 8 BDSP (SaveData.bin) ===
    // Ryujinx/Yuzu: ~979KB, party at 0x14098, count at 0x148A8
    if (size >= 0xEEF00 && size <= 0xF0000) {
      const count = buffer.readUInt8(0x148A8);
      if (count >= 1 && count <= 6) {
        const pv = buffer.readUInt32LE(0x14098);
        const sv = (pv >> 13) & 31;
        if (sv >= 0 && sv <= 29) {
          log(`BDSP detected: party_count=${count}, pv=0x${pv.toString(16)}`);
          return { generation: 8, saveType: 'gen8bdsp', version: 'brilliantdiamond', name: 'Pokemon BDSP (Auto)' };
        }
      }
    }

    // === Gen 5 NDS (BW/B2W2) ===
    // 512KB with BEEF block footer, or ~524KB with DeSmuME footer
    const isNdsSize = (size >= 0x70000 && size <= 0x90000);
    if (isNdsSize) {
      // Check for DeSmuME footer
      const tail = buffer.slice(Math.max(0, size - 256)).toString('ascii');
      const hasDesmmeFooter = tail.includes('-DESMUME SAVE') || tail.includes('DESMUME SAVE');

      // Check for BEEF block markers
      let hasBeef = false;
      for (let off = 0x1FFFC; off < Math.min(size, 0x90000); off += 0x20000) {
        if (off + 4 <= size && buffer.readUInt32LE(off) === 0x42454546) {
          hasBeef = true;
          break;
        }
      }

      // Check for Gen5 party structure at 0x18E00
      let hasGen5Party = false;
      if (size >= 0x19400) {
        const partyCountA = buffer.readUInt32LE(0x18E04);
        const partyCountB = buffer.readUInt32LE(0x3CE04);
        if ((partyCountA >= 1 && partyCountA <= 6) || (partyCountB >= 1 && partyCountB <= 6)) {
          hasGen5Party = true;
        }
      }

      if (hasGen5Party || (hasBeef && hasDesmmeFooter)) {
        log(`Gen5 NDS detected: BEEF=${hasBeef}, DesmME=${hasDesmmeFooter}, party=${hasGen5Party}`);
        return { generation: 5, saveType: 'gen5', version: 'black', name: 'Pokemon Gen 5 (Auto)' };
      }
    }

    // === Gen 4 NDS (D/P/Pt/HG/SS) ===
    // 256KB or 512KB NDS save
    const isNds4Size = (size >= 0x40000 && size <= 0x80000);
    if (isNds4Size && !isNdsSize) {
      // Gen4 party structure: count at block start, species list nearby
      for (let blockOff = 0; blockOff < Math.min(size, 0x80000); blockOff += 0x20000) {
        for (let partyOff = 0; partyOff < 0x1000; partyOff += 0x200) {
          const abs = blockOff + partyOff;
          if (abs + 0x100 > size) continue;
          const count = buffer[abs] & 0xFF;
          if (count < 1 || count > 6) continue;
          let valid = true;
          for (let i = 0; i < count; i++) {
            const sp = buffer.readUInt16LE(abs + 0x68 + i * 2);
            if (sp === 0 || sp > 493) { valid = false; break; }
          }
          if (valid) {
            log(`Gen4 NDS detected at offset 0x${abs.toString(16)}`);
            return { generation: 4, saveType: 'gen4', version: 'diamond', name: 'Pokemon Gen 4 (Auto)' };
          }
        }
      }
    }

    // === Gen 3 GBA (RSE/FRLG) ===
    // 128KB or 256KB with sector-based structure
    if (size >= 0x8000 && size <= 0x40000) {
      const SIZE_SECTOR = 0x1000;
      const SIZE_MAIN = 0xE000;
      const COUNT_MAIN = 14;
      const GBA_MAGIC = 0x08012025;

      function hasValidSectorStructure(slot) {
        const start = slot * SIZE_MAIN;
        if (start + SIZE_MAIN > size) return false;
        let bitTrack = 0;
        let sectorCount = 0;
        for (let ofs = start; ofs < start + SIZE_MAIN; ofs += SIZE_SECTOR) {
          if (ofs + 0xFFC > size) return false;
          const id = buffer.readUInt16LE(ofs + 0xFF4);
          const magic = buffer.readUInt32LE(ofs + 0xFF8);
          if (id >= COUNT_MAIN) return false;
          if (magic !== GBA_MAGIC) return false;
          bitTrack |= (1 << id);
          sectorCount++;
        }
        return sectorCount === COUNT_MAIN && bitTrack === 0x3FFF;
      }

      if (hasValidSectorStructure(0) || hasValidSectorStructure(1)) {
        // Determine RSE vs FRLG by checking team count at both offset sets
        function findSector1(slot) {
          const start = slot * SIZE_MAIN;
          for (let ofs = start; ofs < start + SIZE_MAIN; ofs += SIZE_SECTOR) {
            if (ofs + 0xFF4 > buffer.length) continue;
            const id = buffer.readUInt16LE(ofs + 0xFF4);
            if (id === 1) return ofs;
          }
          return -1;
        }
        const sec1_0 = findSector1(0);
        const sec1_1 = findSector1(1);
        let detectedVersion = 'ruby';
        for (const sec1 of [sec1_0, sec1_1]) {
          if (sec1 < 0) continue;
          const rseCount = buffer.readUInt32LE(sec1 + 0x0234);
          const frlgCount = buffer[sec1 + 0x0034];
          log(`Gen3 Sector1 at 0x${sec1.toString(16)}: RSE_teamCount=${rseCount}, FRLG_teamCount=${frlgCount}`);
          // RSE uses 4-byte LE at 0x234, FRLG uses 1-byte at 0x34
          const rseValid = rseCount >= 1 && rseCount <= 6;
          const frlgValid = frlgCount >= 1 && frlgCount <= 6;
          if (rseValid && !frlgValid) { detectedVersion = 'ruby'; break; }
          if (frlgValid && !rseValid) { detectedVersion = 'firered'; break; }
          if (rseValid && frlgValid) { detectedVersion = 'ruby'; break; }
        }
        log(`Gen3 GBA detected: valid sector structure found, version=${detectedVersion}`);
        return { generation: 3, saveType: 'gen3', version: detectedVersion, name: 'Pokemon Gen 3 (Auto)' };
      }
    }

    // === Gen 6/7 3DS ===
    // Citra saves can be 400KB-1MB with BEEF markers
    // Some Citra saves are smaller (< 0x80000) with only 1 BEEF block
    if (size >= 0x50000 && size <= 0x200000) {
      let beefCount = 0;
      for (let off = 0; off < Math.min(size - 8, 0x200000); off += 4) {
        if (buffer.readUInt32LE(off) === 0x42454546) {
          beefCount++;
          if (beefCount >= 2) break;
        }
      }
      if (beefCount >= 1) {
        // Try Gen7 first (newer), then Gen6
        log(`3DS detected with ${beefCount} BEEF blocks, trying Gen7...`);
        return { generation: 7, saveType: 'gen7', version: 'moon', name: 'Pokemon Gen 7 (Auto)' };
      }
    }

    // === Gen 6/7 3DS (small Citra saves) ===
    // Some Citra saves are 400-500KB with a single BEEF block near the end
    if (size >= 0x40000 && size < 0x50000) {
      // Check last 4KB for BEEF marker
      const tailStart = Math.max(0, size - 0x1000);
      for (let off = tailStart; off < size - 8; off += 4) {
        if (buffer.readUInt32LE(off) === 0x42454546) {
          log(`Small 3DS save detected with BEEF at 0x${off.toString(16)}, trying Gen7...`);
          return { generation: 7, saveType: 'gen7', version: 'moon', name: 'Pokemon Gen 7 (Auto)' };
        }
      }
    }

    // === Gen 2 (GSC) ===
    // 32KB, party count at verified Bulbapedia offsets
    // G/S primary: 0x288A, G/S backup: 0x10E8
    // Crystal primary: 0x2865, Crystal backup: 0x1A65
    if (size >= 0x7000) {
      const gen2Offsets = [0x288A, 0x10E8, 0x2865, 0x1A65];
      for (const pcOffset of gen2Offsets) {
        if (pcOffset + 7 > size) continue;
        const count2 = buffer[pcOffset] & 0xFF;
        if (count2 < 1 || count2 > 6) continue;
        let valid = true;
        for (let i = 0; i < count2; i++) {
          const sid = buffer[pcOffset + 1 + i] & 0xFF;
          if (sid === 0 || sid > 251) { valid = false; break; }
        }
        // Verify with 0xFF terminator
        if (valid && buffer[pcOffset + 1 + count2] === 0xFF) {
          log(`Gen2 detected at offset 0x${pcOffset.toString(16)}, count=${count2}`);
          return { generation: 2, saveType: 'gen2', version: 'gold', name: 'Pokemon Gen 2 (Auto)' };
        }
      }
    }

    // === Gen 1 (RBY) ===
    // 32KB, party count at Bulbapedia offset 0x2F2C or search with mon data validation
    if (size >= 0x7000 && size <= 0x9000) {
      // Try Bulbapedia offset first
      const g1PartyOff = 0x2F2C;
      if (g1PartyOff + 7 <= size) {
        const count1 = buffer[g1PartyOff] & 0xFF;
        if (count1 >= 1 && count1 <= 6) {
          let valid = true;
          for (let i = 0; i < count1; i++) {
            const sid = buffer[g1PartyOff + 1 + i] & 0xFF;
            if (sid === 0 || sid > 151) { valid = false; break; }
          }
          if (valid) {
            log('Gen1 detected at Bulbapedia offset 0x2F2C');
            return { generation: 1, saveType: 'gen1', version: 'red', name: 'Pokemon Gen 1 (Auto)' };
          }
        }
      }
      // Fallback: search with species + mon data validation
      for (let i = 0; i < Math.min(size - 400, 0x8000); i++) {
        const count1 = buffer[i] & 0xFF;
        if (count1 < 1 || count1 > 6) continue;
        let valid = true;
        const spList = [];
        for (let j = 0; j < count1; j++) {
          const sid = buffer[i + 1 + j] & 0xFF;
          if (sid === 0 || sid > 151) { valid = false; break; }
          spList.push(sid);
        }
        if (!valid) continue;
        // Also require 0xFF terminator after species list (Gen1 format)
        if (buffer[i + 1 + count1] !== 0xFF) continue;
        // Also require mon data: species at monStart must match, level must be valid
        const monStart = i + 1 + 7 + 66; // WRAM layout: species(7) + OT(66)
        if (monStart + 0x1E < size) {
          const monSp = buffer[monStart];
          const monLv = buffer[monStart + 0x21];
          if (monSp === spList[0] && monLv >= 1 && monLv <= 100) {
            log(`Gen1 detected via search at offset 0x${i.toString(16)}`);
            return { generation: 1, saveType: 'gen1', version: 'red', name: 'Pokemon Gen 1 (Auto)' };
          }
        }
      }
    }

    // === SwishCrypto (Sw/Sh/PLA/ZA) detection ===
    // Check SHA256 hash before entropy check
    if (size >= 0x10000) {
      try {
        const SwishCrypto = require('./swish-crypto');
        if (SwishCrypto.isValid(buffer)) {
          // Try to determine which SwishCrypto game based on size and blocks
          const blocks = SwishCrypto.decrypt(buffer);
          const partyBlock = blocks.find(b => b.key === 0x2985FE5D);
          const partyBlockZA = blocks.find(b => b.key === 0x3AA1A9AD);
          
          if (partyBlockZA) {
            // Z-A uses KPartyZA key
            log(`SwishCrypto Z-A detected: ${size} bytes, blocks=${blocks.length}`);
            return { generation: 9, saveType: 'gen9za', version: 'legendsza', name: 'Pokemon Legends Z-A (Auto)' };
          }
          
          if (partyBlock) {
            // Check if PLA format (PA8 has larger blocks)
            const isPA8 = partyBlock.data.length === 376 * 6 + 4; // SIZE_8APARTY * 6 + count
            if (isPA8) {
              log(`SwishCrypto PLA detected: ${size} bytes, blocks=${blocks.length}`);
              return { generation: 8, saveType: 'gen8pla', version: 'legendsarceus', name: 'Pokemon Legends Arceus (Auto)' };
            }
            log(`SwishCrypto Sw/Sh detected: ${size} bytes, blocks=${blocks.length}`);
            return { generation: 8, saveType: 'gen8swsh', version: 'sword', name: 'Pokemon Sw/Sh (Auto)' };
          }
          
          // Fallback: use file size heuristic
          if (size < 1500000) {
            log(`SwishCrypto PLA detected (size heuristic): ${size} bytes`);
            return { generation: 8, saveType: 'gen8pla', version: 'legendsarceus', name: 'Pokemon Legends Arceus (Auto)' };
          } else if (size > 2500000) {
            log(`SwishCrypto Z-A detected (size heuristic): ${size} bytes`);
            return { generation: 9, saveType: 'gen9za', version: 'legendsza', name: 'Pokemon Legends Z-A (Auto)' };
          }
          
          log(`SwishCrypto save detected (${size} bytes)`);
          return { generation: 8, saveType: 'gen8swsh', version: 'sword', name: 'Pokemon Sw/Sh (Auto)' };
        }
      } catch (e) {
        // SwishCrypto module not available, fall through
      }
    }

    // === Encrypted save detection ===
    // If the file has near-maximum entropy (~8.0 bits/byte), it's likely encrypted
    if (size >= 0x10000) {
      const sampleSize = Math.min(size, 65536);
      const freq = new Float64Array(256);
      for (let i = 0; i < sampleSize; i++) freq[buffer[i]]++;
      let entropy = 0;
      for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) { const p = freq[i] / sampleSize; entropy -= p * Math.log2(p); }
      }
      if (entropy > 7.95) {
        log(`Encrypted save detected: entropy=${entropy.toFixed(3)} bits/byte (${size} bytes)`);
        return { generation: 0, saveType: 'encrypted', version: 'unknown', name: 'Save encriptado (Ryujinx Sw/Sh)', encrypted: true };
      }
    }

    // === Gen 8 Sw/Sh (SCBlock format) ===
    // Variable size, check for SCBlock header pattern
    if (size >= 0x10000) {
      // Sw/Sh saves start with a version uint32 then SCBlock count
      const possibleCount = buffer.readUInt32LE(0);
      if (possibleCount > 0 && possibleCount < 1000) {
        // Check if offset 4 looks like a valid SCBlock type
        const blockType = buffer.readUInt32LE(4);
        if (blockType >= 0 && blockType <= 10) {
          log(`Gen8 Sw/Sh SCBlock detected (blocks=${possibleCount})`);
          return { generation: 8, saveType: 'gen8', version: 'sword', name: 'Pokemon Sw/Sh (Auto)' };
        }
      }
    }

    // === Gen 9 (Scarlet/Violet) ===
    // Variable size, similar SCBlock but different structure
    if (size >= 0x10000 && size <= 0x200000) {
      // Try reading as SV save
      log('Trying Gen9 detection...');
      // SV saves have a different block structure
    }

    // === Fallback: Try each parser and see which one finds valid data ===
    log('Primary detection failed, trying fallback parsers...');

    // Gen1 saves are exactly 32KB and aren't detected by other methods
    if (size >= 0x7000 && size <= 0x9000) {
      log('Fallback: 32KB file, assuming Gen1 RBY');
      return { generation: 1, saveType: 'gen1', version: 'red', name: 'Pokemon Gen 1 (Auto)' };
    }

    // If nothing matched, try Gen5 scan (most common for DeSmuME users)
    if (size >= 0x40000) {
      log('Fallback: assuming Gen5 NDS');
      return { generation: 5, saveType: 'gen5', version: 'black', name: 'Pokemon Gen 5 (Auto)' };
    }

    log('Detection failed');
    return null;
  }
}

module.exports = DetectSave;
