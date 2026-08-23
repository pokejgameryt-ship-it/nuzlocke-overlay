const { execFile, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const Logger = require('./logger');

const CODE_VERSION = '4.0';
const FIXED_DLL_DIR = path.join(
  process.env.LOCALAPPDATA || process.env.USERPROFILE || '',
  '.nuzlocke-pkhex'
);

function findDotnet() {
  const userDotnet = path.join(process.env['USERPROFILE'] || '', '.dotnet', 'dotnet.exe');
  if (fs.existsSync(userDotnet)) return userDotnet;

  const localDotnet = path.join(process.env['LOCALAPPDATA'] || '', '.dotnet', 'dotnet.exe');
  if (fs.existsSync(localDotnet)) return localDotnet;

  try {
    const where = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(where, ['dotnet'], { stdio: 'pipe', timeout: 5000 }).toString().trim();
    const firstLine = result.split('\n')[0].trim();
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch (e) {}

  return null;
}

function ensureDllsInFixedDir() {
  if (!fs.existsSync(FIXED_DLL_DIR)) {
    fs.mkdirSync(FIXED_DLL_DIR, { recursive: true });
  }

  const dllFiles = ['PkHexReader.dll', 'PkHexReader.runtimeconfig.json', 'PkHexReader.deps.json', 'PKHeX.Core.dll'];
  const sourceDir = process.resourcesPath || __dirname;

  for (const file of dllFiles) {
    const dest = path.join(FIXED_DLL_DIR, file);
    if (!fs.existsSync(dest)) {
      const candidates = [
        path.join(sourceDir, file),
        path.join(__dirname, file),
        path.join(__dirname, '..', 'PkHexReader', 'bin', 'Release', 'net8.0', file),
      ];
      for (const src of candidates) {
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          Logger.info('PkHexReader', `[v${CODE_VERSION}] Copied ${file} -> ${FIXED_DLL_DIR}`);
          break;
        }
      }
    }
  }

  return FIXED_DLL_DIR;
}

function findDll() {
  const name = 'PkHexReader.dll';

  const fixedDll = path.join(FIXED_DLL_DIR, name);
  if (fs.existsSync(fixedDll)) return fixedDll;

  if (process.resourcesPath) {
    const p = path.join(process.resourcesPath, name);
    if (fs.existsSync(p)) return p;
  }

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const p = path.join(process.env.PORTABLE_EXECUTABLE_DIR, name);
    if (fs.existsSync(p)) return p;
  }

  const p3 = path.join(__dirname, name);
  if (fs.existsSync(p3)) return p3;

  const p4 = path.join(__dirname, '..', 'PkHexReader', 'bin', 'Release', 'net8.0', name);
  if (fs.existsSync(p4)) return p4;

  return null;
}

class PkHexReader {
  static parse(filePath) {
    return new Promise((resolve, reject) => {
      const dotnetPath = findDotnet();
      ensureDllsInFixedDir();
      const dllPath = findDll();

      Logger.info('PkHexReader', `[v${CODE_VERSION}] dotnet=${dotnetPath || 'NOT FOUND'}`);
      Logger.info('PkHexReader', `[v${CODE_VERSION}] dll=${dllPath || 'NOT FOUND'}`);

      if (!dotnetPath) {
        return reject(new Error('dotnet runtime not found'));
      }
      if (!dllPath) {
        return reject(new Error('PkHexReader.dll not found'));
      }
      if (!fs.existsSync(filePath)) {
        return reject(new Error(`File not found: ${filePath}`));
      }

      Logger.info('PkHexReader', `[v${CODE_VERSION}] exec: ${dotnetPath} ${dllPath} ${filePath}`);

      const child = execFile(dotnetPath, [dllPath, filePath], {
        timeout: 30000,
        maxBuffer: 512 * 1024,
        windowsHide: true,
        env: { ...process.env }
      }, (error, stdout, stderr) => {
        if (error) {
          Logger.error('PkHexReader', `[v${CODE_VERSION}] error: ${error.message}`);
          if (stderr) Logger.error('PkHexReader', `[v${CODE_VERSION}] stderr: ${stderr.substring(0, 500)}`);
          return reject(error);
        }
        try {
          const raw = (stdout || '').trim();
          Logger.info('PkHexReader', `[v${CODE_VERSION}] stdout len=${raw.length}`);
          if (!raw) {
            return reject(new Error('PkHexReader returned empty output'));
          }
          const result = JSON.parse(raw);
          if (result.error) {
            return reject(new Error(result.error));
          }
          resolve(result);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });

      setTimeout(() => {
        if (!child.killed) {
          Logger.error('PkHexReader', `[v${CODE_VERSION}] TIMEOUT - killing dotnet process`);
          child.kill('SIGKILL');
        }
      }, 35000);
    });
  }
}

module.exports = PkHexReader;
