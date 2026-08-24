const fs = require('fs');
const path = require('path');

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

function ensureLogDir() {
  const dir = getLogDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!logFile) {
    const date = new Date().toISOString().slice(0, 10);
    logFile = path.join(dir, `nuzlocke-${date}.log`);
  }
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function writeLog(level, category, message, data) {
  try {
    ensureLogDir();
    const line = `[${timestamp()}] [${level}] [${category}] ${message}` + (data !== undefined ? ` | ${typeof data === 'string' ? data : JSON.stringify(data)}` : '') + '\n';
    fs.appendFileSync(logFile, line);
  } catch (e) {
    // Last resort - write to stderr
    process.stderr.write(`[LOGGER FAIL] ${e.message}\n`);
  }
}

const Logger = {
  setLogDir,

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

  clear() {
    try {
      ensureLogDir();
      fs.writeFileSync(logFile, '');
    } catch (e) {}
  }
};

module.exports = Logger;
