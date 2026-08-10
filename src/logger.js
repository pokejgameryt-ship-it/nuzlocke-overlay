const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.PORTABLE_EXECUTABLE_DIR
  ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'logs')
  : path.join(__dirname, '..', 'logs');

let logFile = null;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!logFile) {
    const date = new Date().toISOString().slice(0, 10);
    logFile = path.join(LOG_DIR, `nuzlocke-${date}.log`);
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
