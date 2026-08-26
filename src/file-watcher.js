const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const SaveParser = require('./save-parser');
const DetectSave = require('./detect-save');
const { resolveSprite } = require('./sprite-scanner');
const Logger = require('./logger');

// Check party count directly from save file (most reliable empty-party detection)
function getPartyCountDirectly(buffer, generation) {
  if (!buffer || buffer.length < 0x100) return -1;
  try {
    switch (generation) {
      case 1: {
        // Gen1: party count at known offsets
        const offsets = [0x2F2C, 0x0F2C, 0x2F2D, 0x0F2D, 0x2F2B, 0x0F2B,
          0x2F2C + 0x100, 0x0F2C + 0x100, 0x2F2C - 0x100, 0x0F2C - 0x100];
        for (const off of offsets) {
          if (off < 0 || off >= buffer.length) continue;
          const count = buffer[off] & 0xFF;
          if (count >= 0 && count <= 6) return count;
        }
        return -1;
      }
      case 2: {
        // Gen2: party count at known offsets
        const offsets = [0x288A, 0x10E8, 0x2865, 0x1A65];
        for (const off of offsets) {
          if (off < 0 || off >= buffer.length) continue;
          const count = buffer[off] & 0xFF;
          if (count >= 0 && count <= 6) return count;
        }
        return -1;
      }
      case 3: {
        // Gen3: need sector validation first, then read count
        if (buffer.length < 0x10000) return -1;
        // Try RSE offset (Sector1 + 0x234)
        const rseCount = buffer.readUInt32LE(0x1234);
        if (rseCount >= 0 && rseCount <= 6) return rseCount;
        // Try FRLG offset (Sector1 + 0x0034)
        const frlgCount = buffer[0x1034] & 0xFF;
        if (frlgCount >= 0 && frlgCount <= 6) return frlgCount;
        return -1;
      }
      case 4: {
        // Gen4: party count in block A or B
        const offsets = [
          // HGSS: count at block+0x94
          { block: 0x00000, countOff: 0x94 },
          { block: 0x40000, countOff: 0x94 },
          // DP/Pt: count at block+0x00 (uint32)
          { block: 0x00000, countOff: 0x00, size: 4 },
          { block: 0x40000, countOff: 0x00, size: 4 },
        ];
        for (const o of offsets) {
          const off = o.block + o.countOff;
          if (off >= buffer.length) continue;
          const count = o.size === 4 ? buffer.readUInt32LE(off) : (buffer[off] & 0xFF);
          if (count >= 0 && count <= 6) return count;
        }
        return -1;
      }
      case 5: {
        // Gen5: party count at known offsets
        const offsets = [0x18E00, 0x24000 + 0x18E00];
        for (const off of offsets) {
          if (off + 4 >= buffer.length) continue;
          const count = buffer.readUInt32LE(off + 4);
          if (count >= 0 && count <= 6) return count;
        }
        return -1;
      }
      default:
        return -1;
    }
  } catch (e) {
    return -1;
  }
}

let PkHexReader = null;
try {
  PkHexReader = require('./pkhex-reader');
  Logger.info('Watcher', 'PkHexReader loaded OK');
} catch (e) {
  Logger.warn('Watcher', `PkHexReader not available: ${e.message}. Using built-in parser.`);
}

class FileWatcher {
  constructor() {
    this.watchers = new Map();
    this.projectData = new Map();
    this.debounceTimers = new Map();
    this.placeholderConfigs = new Map();
  }

  updatePlaceholderConfig(projectId, config) {
    this.placeholderConfigs.set(projectId, config);
  }

  startWatching(projectId, savePath, gameInfo, spriteStyle, spriteStylePath, spritesRoot, sseClients, onTeamChange) {
    Logger.info('Watcher', `startWatching for project ${projectId}`);
    Logger.info('Watcher', `  savePath: ${savePath}`);
    Logger.info('Watcher', `  PKHeX available: ${!!PkHexReader}`);

    this.stopWatching(projectId);

    if (!savePath || !fs.existsSync(savePath)) {
      Logger.error('Watcher', `Save file NOT found: ${savePath}`);
      return;
    }

    // If savePath is a directory (e.g. Citra's 00000001 folder), find the actual save file inside
    let resolvedSavePath = savePath;
    const stats = fs.statSync(savePath);
    if (stats.isDirectory()) {
      Logger.info('Watcher', `savePath is a directory, looking for save file inside...`);
      // Citra: look for 'main' file (3DS save format)
      const mainFile = path.join(savePath, 'main');
      if (fs.existsSync(mainFile)) {
        resolvedSavePath = mainFile;
        Logger.info('Watcher', `Found Citra save: ${resolvedSavePath}`);
      } else {
        // Try common save file extensions
        const exts = ['.sav', '.dsv', '.sa1', '.sa2', '.sa3', '.ss1', '.ss2', '.ss3', '.ss4', '.ss5', '.bin'];
        for (const ext of exts) {
          const candidate = path.join(savePath, 'main' + ext);
          if (fs.existsSync(candidate)) { resolvedSavePath = candidate; break; }
        }
        // If still directory, try first file inside
        if (resolvedSavePath === savePath) {
          const files = fs.readdirSync(savePath).filter(f => {
            try { return fs.statSync(path.join(savePath, f)).isFile(); } catch { return false; }
          });
          if (files.length > 0) {
            resolvedSavePath = path.join(savePath, files[0]);
            Logger.info('Watcher', `Using first file in directory: ${resolvedSavePath}`);
          }
        }
      }
    }

    Logger.info('Watcher', `Save file exists: ${resolvedSavePath} (${fs.statSync(resolvedSavePath).size} bytes)`);

    const watcher = chokidar.watch(resolvedSavePath, {
      ignoreInitial: false,
      usePolling: true,
      interval: 500,
    });

    let generation = 0;
    const DEBOUNCE_MS = 600;

    const parseAndBroadcast = async (gen) => {
      if (gen !== generation) return;
      try {
        Logger.info('Watcher', `Parsing save for project ${projectId}`);

        let team = [];
        let pkHexHadResults = false;
        let skipPkHex = false;

        // Check party count directly before calling PKHeX
        // PKHeX can read wrong offsets in early-game empty-party saves
        if (PkHexReader && gameInfo && gameInfo.generation >= 1 && gameInfo.generation <= 5) {
          try {
            const buf = fs.readFileSync(resolvedSavePath);
            const partyCount = getPartyCountDirectly(buf, gameInfo.generation);
            if (partyCount === 0) {
              Logger.info('Watcher', `Gen${gameInfo.generation} party count is 0, skipping PKHeX (empty party)`);
              skipPkHex = true;
            }
          } catch (e) {}
        }

        if (!skipPkHex && PkHexReader) {
          try {
            const result = await PkHexReader.parse(resolvedSavePath);
            Logger.info('Watcher', `[PKHeX] Found ${result.pokemon.length} Pokemon (${result.game} gen${result.generation})`);
            // Validate PKHeX results: reject if any Pokemon has invalid HP/level
            const pkValid = result.pokemon.every(pk => {
              if (!pk.speciesId || pk.speciesId < 1 || pk.speciesId > 721) return false;
              if (pk.level !== undefined && (pk.level < 1 || pk.level > 100)) return false;
              if (pk.currentHp !== undefined && pk.maxHp !== undefined) {
                if (pk.currentHp <= 0 || pk.maxHp <= 0 || pk.currentHp > pk.maxHp) return false;
              }
              return true;
            });
            if (!pkValid && result.pokemon.length > 0) {
              Logger.warn('Watcher', `[PKHeX] Invalid Pokemon detected, falling back to native parser`);
              team = [];
            } else {
              pkHexHadResults = result.pokemon.length > 0;
              team = result.pokemon.map(pk => ({
                speciesId: pk.speciesId,
                nickname: pk.nickname || '',
                isShiny: pk.isShiny,
                isNicknamed: false,
                level: pk.level,
                form: pk.form || 0,
                gender: pk.gender,
                heldItem: pk.heldItem,
                ability: pk.ability,
                nature: pk.nature,
                pid: pk.pid,
                tid: pk.tid,
                sid: pk.sid,
                currentHp: pk.currentHp,
                maxHp: pk.maxHp,
                move1: pk.move1,
                move2: pk.move2,
                move3: pk.move3,
                move4: pk.move4,
                otName: pk.otName || '',
              }));
            }
          } catch (pkErr) {
            Logger.error('Watcher', `[PKHeX] Failed: ${pkErr.message}`);
            team = [];
          }
        }

        if (team.length === 0) {
          Logger.info('Watcher', 'Using built-in parser');
          const buffer = fs.readFileSync(resolvedSavePath);
          let currentGameInfo = gameInfo;
          if (gameInfo && gameInfo.version === 'auto') {
            const detected = DetectSave.detect(buffer);
            if (detected) {
              currentGameInfo = detected;
              Logger.info('Watcher', `Auto-detected: ${detected.name}`);
            } else {
              Logger.warn('Watcher', 'Auto-detection failed, using manual game or skipping built-in parser');
            }
          }
          if (currentGameInfo && currentGameInfo.generation > 0 && !currentGameInfo.encrypted) {
            team = SaveParser.parse(buffer, currentGameInfo);
            // If native parser found nothing but PKHeX found something, trust native
            // (PKHeX can read wrong offsets in early-game empty-party saves)
            if (team.length === 0 && pkHexHadResults) {
              Logger.warn('Watcher', 'Native parser found 0 Pokemon, overriding PKHeX result (likely false positive)');
            }
          }
        }

        Logger.info('Watcher', `Parsed ${team.length} Pokemon for project ${projectId}`);

        if (team.length === 0) {
          Logger.warn('Watcher', `NO POKEMON FOUND in save file`);
        }

        const absStylePath = path.resolve(spritesRoot, spriteStylePath);
        let resolvedTeam = team.map(pokemon => {
          if (!pokemon || !pokemon.speciesId) return null;
          const spriteUrl = resolveSprite(absStylePath, pokemon.speciesId, {
            form: pokemon.form,
            shiny: pokemon.isShiny,
            spritesRoot: spritesRoot,
            styleId: spriteStyle
          });
          return { ...pokemon, spriteUrl };
        }).filter(Boolean);

        const phConfig = this.placeholderConfigs.get(projectId);
        if (phConfig && phConfig.usePlaceholder && resolvedTeam.length < 6) {
          const placeholderUrl = resolveSprite(absStylePath, 0, {
            spritesRoot: spritesRoot,
            styleId: spriteStyle
          });

          if (placeholderUrl) {
            while (resolvedTeam.length < 6) {
              resolvedTeam.push({
                speciesId: 0,
                nickname: '',
                isShiny: false,
                level: 0,
                form: 0,
                isPlaceholder: true,
                spriteUrl: placeholderUrl
              });
            }
          }
        }

        Logger.info('Watcher', `Resolved team: ${resolvedTeam.map(p => `${p.speciesId}(${p.nickname || '?'})`).join(', ')}`);

        if (gen !== generation) return;

        this.projectData.set(projectId, resolvedTeam);

        const clients = sseClients.get(projectId) || new Set();
        const eventData = JSON.stringify({ team: resolvedTeam });
        Logger.info('Watcher', `Sending SSE to ${clients.size} clients for project ${projectId}`);
        for (const client of clients) {
          client.write(`data: ${eventData}\n\n`);
        }

        if (onTeamChange) {
          Logger.info('Watcher', `Notifying renderer for project ${projectId}`);
          onTeamChange(projectId, resolvedTeam);
        }
      } catch (err) {
        Logger.error('Watcher', `Error parsing save: ${err.message}`);
        Logger.error('Watcher', err.stack);
      }
    };

    const debouncedParse = () => {
      const curGen = generation;
      if (this.debounceTimers.has(projectId)) {
        clearTimeout(this.debounceTimers.get(projectId));
      }
      this.debounceTimers.set(projectId, setTimeout(() => {
        this.debounceTimers.delete(projectId);
        parseAndBroadcast(curGen);
      }, DEBOUNCE_MS));
    };

    watcher.on('change', () => { Logger.debug('Watcher', `change event for ${projectId}`); debouncedParse(); });
    watcher.on('add', () => { Logger.debug('Watcher', `add event for ${projectId}`); debouncedParse(); });
    this.watchers.set(projectId, watcher);

    Logger.info('Watcher', `Scheduling initial parse for project ${projectId} (2s delay)...`);
    setTimeout(() => parseAndBroadcast(generation), 2000);
  }

  stopWatching(projectId) {
    if (this.debounceTimers.has(projectId)) {
      clearTimeout(this.debounceTimers.get(projectId));
      this.debounceTimers.delete(projectId);
    }
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      Logger.info('Watcher', `Stopping watcher for project ${projectId}`);
      watcher.close();
      this.watchers.delete(projectId);
      this.projectData.delete(projectId);
      this.placeholderConfigs.delete(projectId);
    }
  }

  getCachedTeam(projectId) {
    const team = this.projectData.get(projectId) || [];
    Logger.debug('Watcher', `getCachedTeam(${projectId}): ${team.length} Pokemon`);
    return team;
  }
}

module.exports = FileWatcher;
