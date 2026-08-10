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
    // 128KB or 256KB
    if (size >= 0x8000 && size <= 0x40000 && size % 0x10000 === 0) {
      // Check for Gen3 party at common offsets
      const offsets3 = [0x0890, 0x1F80];
      for (const off of offsets3) {
        if (off + 0x10 > size) continue;
        const count = buffer[off] & 0xFF;
        if (count < 1 || count > 6) continue;
        let valid = true;
        const ids = [];
        for (let i = 0; i < count; i++) {
          const sid = buffer[off + 1 + i] & 0xFF;
          if (sid === 0 || sid > 413) { valid = false; break; }
          ids.push(sid);
        }
        if (valid && ids.length >= 2) {
          log(`Gen3 GBA detected at offset 0x${off.toString(16)}: species=${JSON.stringify(ids)}`);
          return { generation: 3, saveType: 'gen3', version: 'emerald', name: 'Pokemon Gen 3 (Auto)' };
        }
      }
    }

    // === Gen 6/7 3DS ===
    // 512KB - 1MB with BEEF markers
    if (size >= 0x80000 && size <= 0x200000) {
      let beefCount = 0;
      for (let off = 0; off < Math.min(size - 8, 0x100000); off += 4) {
        if (buffer.readUInt32LE(off) === 0x42454546) {
          beefCount++;
          if (beefCount >= 2) break;
        }
      }
      if (beefCount >= 2) {
        // Try Gen7 first (newer), then Gen6
        log(`3DS detected with ${beefCount} BEEF blocks, trying Gen7...`);
        return { generation: 7, saveType: 'gen7', version: 'moon', name: 'Pokemon Gen 7 (Auto)' };
      }
    }

    // === Gen 1/2 (Virtual Console or original) ===
    // 32KB
    if (size >= 0x7000 && size <= 0x9000) {
      // Check for Gen1 party patterns
      const count1 = buffer[0xA0] & 0xFF;
      if (count1 >= 1 && count1 <= 6) {
        let valid = true;
        for (let i = 0; i < count1; i++) {
          const sid = buffer[0xA1 + i] & 0xFF;
          if (sid === 0 || sid > 151) { valid = false; break; }
        }
        if (valid) {
          log('Gen1 detected');
          return { generation: 1, saveType: 'gen1', version: 'red', name: 'Pokemon Gen 1 (Auto)' };
        }
      }
      // Try Gen2
      const count2 = buffer[0xA0] & 0xFF;
      if (count2 >= 1 && count2 <= 6) {
        let valid = true;
        for (let i = 0; i < count2; i++) {
          const sid = buffer[0xA1 + i] & 0xFF;
          if (sid === 0 || sid > 251) { valid = false; break; }
        }
        if (valid) {
          log('Gen2 detected');
          return { generation: 2, saveType: 'gen2', version: 'gold', name: 'Pokemon Gen 2 (Auto)' };
        }
      }
    }

    // === SwishCrypto (Sw/Sh) detection ===
    // Check SHA256 hash before entropy check
    if (size >= 0x10000) {
      try {
        const SwishCrypto = require('./swish-crypto');
        if (SwishCrypto.isValid(buffer)) {
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
