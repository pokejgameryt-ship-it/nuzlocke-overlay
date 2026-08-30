const fs = require('fs');
const path = require('path');
const os = require('os');
const LogUploader = require('./log-uploader');

let LOG_DIR = null;

function setLogDir(dir) {
  LOG_DIR = dir;
}

function getLogDir() {
  if (!LOG_DIR) {
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      LOG_DIR = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'logs');
    } else if (process.env.NUZLOGE_USERDATA) {
      LOG_DIR = path.join(process.env.NUZLOGE_USERDATA, 'logs');
    } else {
      LOG_DIR = path.join(__dirname, '..', 'logs');
    }
  }
  return LOG_DIR;
}

let logFile = null;
let jsonlFile = null;
let sessionId = null;
let sessionMeta = null;
const uploader = new LogUploader();

function ensureLogDir() {
  const dir = getLogDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!logFile) {
    const date = new Date().toISOString().slice(0, 10);
    logFile = path.join(dir, `nuzlocke-${date}.log`);
    jsonlFile = path.join(dir, `nuzlocke-${date}.jsonl`);
  }
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function getSessionId() {
  if (!sessionId) {
    sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  return sessionId;
}

function cleanOldLogs(currentVersion) {
  const settingsPath = path.join(
    process.env.APPDATA || process.env.USERPROFILE || '',
    'nuzlocke-overlay', 'settings.json'
  );
  let lastVersion = null;
  try {
    if (fs.existsSync(settingsPath)) {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      lastVersion = s.lastLogVersion || null;
    }
  } catch (e) {}

  if (lastVersion && lastVersion !== currentVersion) {
    const dir = getLogDir();
    try {
      const files = fs.readdirSync(dir);
      let cleaned = 0;
      for (const f of files) {
        if (f.endsWith('.log') || f.endsWith('.jsonl')) {
          try {
            fs.unlinkSync(path.join(dir, f));
            cleaned++;
          } catch (e) {}
        }
      }
      if (cleaned > 0) {
        console.log(`[Logger] Cleaned ${cleaned} old log files (v${lastVersion} -> v${currentVersion})`);
      }
    } catch (e) {}
  }

  try {
    if (fs.existsSync(settingsPath)) {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      s.lastLogVersion = currentVersion;
      fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
    }
  } catch (e) {}
}

function initSession(appVersion, logEndpoint) {
  cleanOldLogs(appVersion);

  sessionMeta = {
    sessionId: getSessionId(),
    appVersion: appVersion || 'unknown',
    os: `${os.platform()} ${os.release()} (${os.arch()})`,
    nodeVersion: process.version,
    electronVersion: process.versions?.electron || 'unknown',
    hostname: os.hostname(),
    totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
    freeMemory: `${Math.round(os.freemem() / 1024 / 1024)}MB`,
    cpus: os.cpus()?.length || 0,
    startedAt: new Date().toISOString(),
  };

  try {
    const { execFileSync } = require('child_process');
    const where = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(where, ['dotnet'], { stdio: 'pipe', timeout: 3000 }).toString().trim();
    sessionMeta.dotnetPath = result.split('\n')[0].trim();
  } catch (e) {
    sessionMeta.dotnetPath = 'NOT FOUND';
  }

  uploader.configure(logEndpoint, sessionMeta);

  writeLog('INFO', 'Session', '=== Session started ===', sessionMeta);
  return sessionMeta;
}

function setLogEndpoint(endpoint) {
  uploader.configure(endpoint, sessionMeta);
}

function writeLog(level, category, message, data) {
  try {
    ensureLogDir();

    const textLine = `[${timestamp()}] [${level}] [${category}] ${message}` + (data !== undefined ? ` | ${typeof data === 'string' ? data : JSON.stringify(data)}` : '') + '\n';
    fs.appendFileSync(logFile, textLine);

    const jsonEntry = {
      t: timestamp(),
      s: getSessionId(),
      l: level,
      c: category,
      m: message,
    };
    if (data !== undefined) {
      jsonEntry.d = typeof data === 'string' ? data : data;
    }
    fs.appendFileSync(jsonlFile, JSON.stringify(jsonEntry) + '\n');
  } catch (e) {
    process.stderr.write(`[LOGGER FAIL] ${e.message}\n`);
  }
}

const Logger = {
  setLogDir,
  initSession,
  setLogEndpoint,

  info(category, message, data) {
    writeLog('INFO', category, message, data);
    console.log(`[${category}] ${message}`);
  },

  warn(category, message, data) {
    writeLog('WARN', category, message, data);
    console.warn(`[${category}] WARN: ${message}`);
  },

  error(category, message, data) {
    writeLog('ERROR', category, message, data);
    console.error(`[${category}] ERROR: ${message}`);
  },

  debug(category, message, data) {
    writeLog('DEBUG', category, message, data);
  },

  logSaveParse(filePath, fileSize, gameInfo, result, error) {
    const entry = {
      event: 'save_parse',
      savePath: filePath,
      saveSize: fileSize,
      gameInfo: gameInfo,
      result: result ? {
        game: result.game,
        generation: result.generation,
        partyCount: result.partyCount,
        pokemonCount: result.pokemon?.length || 0,
        pokemon: (result.pokemon || []).map(p => ({
          species: p.speciesId,
          nickname: p.nickname,
          level: p.level,
          shiny: p.isShiny,
        })),
      } : null,
      error: error || null,
      timestamp: timestamp(),
    };
    writeLog('INFO', 'SaveParse', `Parsed ${result?.pokemon?.length || 0} Pokemon from ${path.basename(filePath)}`, entry);
    uploader.sendNow(entry);
  },

  logPkHexResult(filePath, fileSize, gameInfo, result, error) {
    const entry = {
      event: 'pkhex_result',
      savePath: filePath,
      saveSize: fileSize,
      gameVersion: gameInfo?.version,
      gameGeneration: gameInfo?.generation,
      pkhexGame: result?.game,
      pkhexGeneration: result?.generation,
      pkhexPartyCount: result?.partyCount,
      pkhexPokemonCount: result?.pokemon?.length || 0,
      pkhexError: error || null,
      timestamp: timestamp(),
    };
    writeLog(error ? 'ERROR' : 'INFO', 'PKHeX', error || `PKHeX returned ${result?.pokemon?.length || 0} Pokemon`, entry);
    uploader.sendNow(entry);
  },

  logNativeParserResult(filePath, fileSize, gameInfo, teamLength, error) {
    const entry = {
      event: 'native_parser_result',
      savePath: filePath,
      saveSize: fileSize,
      gameVersion: gameInfo?.version,
      gameGeneration: gameInfo?.generation,
      teamLength: teamLength,
      error: error || null,
      timestamp: timestamp(),
    };
    writeLog(error ? 'ERROR' : 'INFO', 'NativeParser', error || `Native parser returned ${teamLength} Pokemon`, entry);
    uploader.sendNow(entry);
  },

  getExportData() {
    ensureLogDir();
    const dir = getLogDir();
    const files = [];
    try {
      const allFiles = fs.readdirSync(dir);
      for (const f of allFiles) {
        if (f.endsWith('.log') || f.endsWith('.jsonl')) {
          const fp = path.join(dir, f);
          const stat = fs.statSync(fp);
          files.push({
            name: f,
            path: fp,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      }
    } catch (e) {}

    return {
      sessionMeta,
      logDir: dir,
      files,
      totalSize: files.reduce((acc, f) => acc + f.size, 0),
    };
  },

  readLogContent(filename) {
    ensureLogDir();
    const fp = path.join(getLogDir(), filename);
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp, 'utf8');
  },

  readRecentJsonl(lines) {
    ensureLogDir();
    if (!jsonlFile || !fs.existsSync(jsonlFile)) return [];
    try {
      const content = fs.readFileSync(jsonlFile, 'utf8');
      const allLines = content.trim().split('\n').filter(Boolean);
      return allLines.slice(-lines).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    } catch (e) {
      return [];
    }
  },

  clear() {
    try {
      ensureLogDir();
      fs.writeFileSync(logFile, '');
      fs.writeFileSync(jsonlFile, '');
    } catch (e) {}
  }
};

module.exports = Logger;
