const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const SaveParser = require('./save-parser');
const DetectSave = require('./detect-save');
const { resolveSprite } = require('./sprite-scanner');
const Logger = require('./logger');

class FileWatcher {
  constructor() {
    this.watchers = new Map();
    this.projectData = new Map();
  }

  startWatching(projectId, savePath, gameInfo, spriteStyle, spriteStylePath, spritesRoot, sseClients, onTeamChange) {
    Logger.info('Watcher', `startWatching called for project ${projectId}`);
    Logger.info('Watcher', `  savePath: ${savePath}`);
    Logger.info('Watcher', `  gameInfo: ${JSON.stringify(gameInfo)}`);
    Logger.info('Watcher', `  spriteStylePath: ${spriteStylePath}`);
    Logger.info('Watcher', `  spritesRoot: ${spritesRoot}`);

    if (this.watchers.has(projectId)) {
      Logger.info('Watcher', `Stopping existing watcher for project ${projectId}`);
      this.stopWatching(projectId);
    }

    if (!savePath || !fs.existsSync(savePath)) {
      Logger.error('Watcher', `Save file NOT found: ${savePath}`);
      return;
    }

    Logger.info('Watcher', `Save file exists: ${savePath} (${fs.statSync(savePath).size} bytes)`);

    const watcher = chokidar.watch(savePath, {
      ignoreInitial: false,
      usePolling: true,
      interval: 1000,
      awaitWriteFinish: {
        stabilityThreshold: 800,
        pollInterval: 200
      }
    });

    const onChange = async () => {
      try {
        Logger.info('Watcher', `File change detected for project ${projectId}`);
        const buffer = fs.readFileSync(savePath);
        Logger.info('Watcher', `Read ${buffer.length} bytes from ${savePath}`);

        // Auto-detect game if needed
        let currentGameInfo = gameInfo;
        if (gameInfo && gameInfo.version === 'auto') {
          const detected = DetectSave.detect(buffer);
          if (detected) {
            currentGameInfo = detected;
            Logger.info('Watcher', `Auto-detected: ${detected.name}`);
          }
        }

        // Handle encrypted saves
        if (currentGameInfo && currentGameInfo.encrypted) {
          const clients = sseClients.get(projectId) || new Set();
          const eventData = JSON.stringify({ team: [], error: 'encrypted', message: 'Save encriptado. Ryujinx almacena los saves de Sw/Sh encriptados. Usa Checkpoint/JKSM o exporta el save desde el juego para obtener un archivo sin encriptar.' });
          for (const client of clients) {
            client.write(`data: ${eventData}\n\n`);
          }
          if (onTeamChange) {
            onTeamChange(projectId, [], 'encrypted');
          }
          return;
        }

        const team = SaveParser.parse(buffer, currentGameInfo);
        Logger.info('Watcher', `Parsed ${team.length} Pokemon for project ${projectId}`);

        if (team.length === 0) {
          Logger.warn('Watcher', `NO POKEMON FOUND in save file! Possible causes:`);
          Logger.warn('Watcher', `  - Save file format not recognized`);
          Logger.warn('Watcher', `  - Game generation mismatch (gen=${gameInfo.generation})`);
          Logger.warn('Watcher', `  - File is corrupted or encrypted`);
        }

        const absStylePath = path.resolve(spritesRoot, spriteStylePath);
        Logger.info('Watcher', `Resolving sprites with style: ${absStylePath}`);
        Logger.info('Watcher', `  Style dir exists: ${fs.existsSync(absStylePath)}`);

        const resolvedTeam = team.map(pokemon => {
          if (!pokemon || !pokemon.speciesId) return null;
          const spriteUrl = resolveSprite(absStylePath, pokemon.speciesId, {
            form: pokemon.form,
            shiny: pokemon.isShiny,
            spritesRoot: spritesRoot,
            styleId: spriteStyle
          });
          if (!spriteUrl) {
            Logger.warn('Watcher', `  Sprite NOT found for species ${pokemon.speciesId} (shiny=${pokemon.isShiny}, form=${pokemon.form})`);
          } else {
            Logger.debug('Watcher', `  Species ${pokemon.speciesId} -> ${spriteUrl}`);
          }
          return { ...pokemon, spriteUrl };
        }).filter(Boolean);

        Logger.info('Watcher', `Resolved team: ${resolvedTeam.map(p => `${p.speciesId}(${p.spriteUrl ? 'OK' : 'NO_SPRITE'})`).join(', ')}`);

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
        Logger.error('Watcher', `Error parsing save for project ${projectId}: ${err.message}`);
        Logger.error('Watcher', err.stack);
      }
    };

    watcher.on('change', () => { Logger.debug('Watcher', `chokidar change event for ${projectId}`); onChange(); });
    watcher.on('add', () => { Logger.debug('Watcher', `chokidar add event for ${projectId}`); onChange(); });
    this.watchers.set(projectId, watcher);

    Logger.info('Watcher', `Initial parse for project ${projectId}...`);
    onChange();
  }

  stopWatching(projectId) {
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      Logger.info('Watcher', `Stopping watcher for project ${projectId}`);
      watcher.close();
      this.watchers.delete(projectId);
      this.projectData.delete(projectId);
    }
  }

  getCachedTeam(projectId) {
    const team = this.projectData.get(projectId) || [];
    Logger.debug('Watcher', `getCachedTeam(${projectId}): ${team.length} Pokemon`);
    return team;
  }
}

module.exports = FileWatcher;
