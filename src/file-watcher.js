const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const SaveParser = require('./save-parser');
const DetectSave = require('./detect-save');
const { resolveSprite } = require('./sprite-scanner');
const Logger = require('./logger');

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
    this.stoppedProjects = new Set();
    this.workingParsers = new Map();
  }

  updatePlaceholderConfig(projectId, config) {
    this.placeholderConfigs.set(projectId, config);
  }

  startWatching(projectId, savePath, gameInfo, spriteStyle, spriteStylePath, spritesRoot, sseClients, onTeamChange) {
    Logger.info('Watcher', `startWatching for project ${projectId}`);
    Logger.info('Watcher', `  savePath: ${savePath}`);
    Logger.info('Watcher', `  PKHeX available: ${!!PkHexReader}`);

    this.stopWatching(projectId);
    this.stoppedProjects.delete(projectId);
    this.workingParsers.delete(projectId);

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

    // Log gameInfo details
    Logger.info('Watcher', `gameInfo: ${JSON.stringify(gameInfo)}`);

    const watcher = chokidar.watch(resolvedSavePath, {
      ignoreInitial: false,
      usePolling: true,
      interval: 500,
    });

    let generation = gameInfo ? gameInfo.generation || 0 : 0;
    const DEBOUNCE_MS = 600;

    Logger.info('Watcher', `Config: generation=${generation}, gameInfo=${JSON.stringify(gameInfo)}, PKHeX=${!!PkHexReader}`);

    const mapPkHeXTeam = (pokemon) => pokemon.map(pk => ({
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

    const parseAndBroadcast = async (gen) => {
      if (gen !== generation) return;
      try {
        let saveSize = 0;
        try { saveSize = fs.statSync(resolvedSavePath).size; } catch (e) {}

        Logger.info('Watcher', `Parsing save for project ${projectId} (gen=${gen}, PKHeX=${!!PkHexReader}, resolvedPath=${resolvedSavePath}, size=${saveSize})`);

        let team = [];
        let pkhexError = null;
        let pkhexResult = null;
        let nativeError = null;
        let nativeTeamLength = 0;

        const storedParser = this.workingParsers.get(projectId);

        if (storedParser) {
          // === RE-DETECTION: use the same parser that worked before ===
          Logger.info('Watcher', `Re-detection: using stored parser "${storedParser}" for project ${projectId}`);

          if (storedParser === 'pkhex') {
            if (!PkHexReader) {
              Logger.warn('Watcher', 'Stored parser is pkhex but PkHexReader not available. Keeping last team.');
              return;
            }
            try {
              pkhexResult = await PkHexReader.parse(resolvedSavePath);
              Logger.info('Watcher', `[PKHeX] Re-detection result: partyCount=${pkhexResult.partyCount}, pokemon=${pkhexResult.pokemon.length}`);
              Logger.logPkHexResult(resolvedSavePath, saveSize, gameInfo, pkhexResult, null);
              team = mapPkHeXTeam(pkhexResult.pokemon);
            } catch (pkErr) {
              pkhexError = pkErr.message;
              Logger.error('Watcher', `[PKHeX] Re-detection FAILED: ${pkErr.message}. Keeping last team.`);
              Logger.logPkHexResult(resolvedSavePath, saveSize, gameInfo, null, pkErr.message);
              return;
            }
          } else if (storedParser === 'native') {
            try {
              const buffer = fs.readFileSync(resolvedSavePath);
              const nativeTeam = SaveParser.parse(buffer, gameInfo);
              nativeTeamLength = nativeTeam.length;
              Logger.info('Watcher', `[Native] Re-detection found ${nativeTeam.length} Pokemon`);
              Logger.logNativeParserResult(resolvedSavePath, saveSize, gameInfo, nativeTeam.length, null);
              team = nativeTeam;
            } catch (nativeErr) {
              nativeError = nativeErr.message;
              Logger.error('Watcher', `[Native] Re-detection FAILED: ${nativeErr.message}. Keeping last team.`);
              Logger.logNativeParserResult(resolvedSavePath, saveSize, gameInfo, 0, nativeErr.message);
              return;
            }
          }
        } else {
          // === FIRST DETECTION: try PKHeX first, then native fallback ===
          if (PkHexReader) {
            try {
              Logger.info('Watcher', `[PKHeX] First detection, calling parse on: ${resolvedSavePath}`);
              pkhexResult = await PkHexReader.parse(resolvedSavePath);
              Logger.info('Watcher', `[PKHeX] Result: game=${pkhexResult.game}, gen=${pkhexResult.generation}, partyCount=${pkhexResult.partyCount}, pokemon=${pkhexResult.pokemon.length}`);
              Logger.logPkHexResult(resolvedSavePath, saveSize, gameInfo, pkhexResult, null);
              team = mapPkHeXTeam(pkhexResult.pokemon);
            } catch (pkErr) {
              pkhexError = pkErr.message;
              Logger.error('Watcher', `[PKHeX] Failed for ${resolvedSavePath}: ${pkErr.message}`);
              Logger.logPkHexResult(resolvedSavePath, saveSize, gameInfo, null, pkErr.message);
            }
          } else {
            Logger.warn('Watcher', 'PkHexReader not available');
          }

          if (team.length === 0 && pkhexError && gameInfo && !gameInfo.encrypted) {
            Logger.info('Watcher', `PKHeX failed (${pkhexError}), trying native parser as fallback`);
            try {
              const buffer = fs.readFileSync(resolvedSavePath);
              const nativeTeam = SaveParser.parse(buffer, gameInfo);
              nativeTeamLength = nativeTeam.length;
              if (nativeTeam.length > 0) {
                Logger.info('Watcher', `Native parser found ${nativeTeam.length} Pokemon (fallback)`);
                Logger.logNativeParserResult(resolvedSavePath, saveSize, gameInfo, nativeTeam.length, null);
                team = nativeTeam;
              } else {
                Logger.warn('Watcher', 'Native parser also returned empty');
                Logger.logNativeParserResult(resolvedSavePath, saveSize, gameInfo, 0, null);
              }
            } catch (nativeErr) {
              nativeError = nativeErr.message;
              Logger.error('Watcher', `Native parser fallback failed: ${nativeErr.message}`);
              Logger.logNativeParserResult(resolvedSavePath, saveSize, gameInfo, 0, nativeErr.message);
            }
          }

          // Store which parser succeeded for future re-detections
          if (team.length > 0) {
            if (!pkhexError && pkhexResult) {
              this.workingParsers.set(projectId, 'pkhex');
              Logger.info('Watcher', `Stored working parser: pkhex for project ${projectId}`);
            } else if (nativeTeamLength > 0) {
              this.workingParsers.set(projectId, 'native');
              Logger.info('Watcher', `Stored working parser: native for project ${projectId}`);
            }
          }
        }

        Logger.logSaveParse(resolvedSavePath, saveSize, gameInfo, {
          game: pkhexResult?.game || gameInfo?.version,
          generation: pkhexResult?.generation || gameInfo?.generation,
          partyCount: pkhexResult?.partyCount || team.length,
          pokemon: team,
        }, team.length === 0 ? (pkhexError || nativeError || 'No Pokemon found') : null);

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

        if (onTeamChange && !this.stoppedProjects.has(projectId)) {
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
    this.stoppedProjects.add(projectId);
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
