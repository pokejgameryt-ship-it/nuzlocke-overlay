const { execFile, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const Logger = require('./logger');

const CODE_VERSION = '5.0';
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

  const systemDotnet = 'C:\\Program Files\\dotnet\\dotnet.exe';
  if (fs.existsSync(systemDotnet)) return systemDotnet;

  return null;
}

function getSourceDirCandidates() {
  const candidates = [];

  if (process.resourcesPath) {
    candidates.push(process.resourcesPath);
  }

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    candidates.push(process.env.PORTABLE_EXECUTABLE_DIR);
  }

  candidates.push(__dirname);
  candidates.push(path.join(__dirname, '..'));
  candidates.push(path.join(__dirname, '..', '..'));
  candidates.push(path.join(__dirname, '..', '..', 'resources'));

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'app'));
    candidates.push(path.join(process.resourcesPath, 'app', 'src'));
  }

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR;
    candidates.push(path.join(exeDir, 'resources'));
    candidates.push(path.join(exeDir, 'resources', 'app'));
    candidates.push(path.join(exeDir, 'resources', 'app', 'src'));
  }

  return [...new Set(candidates)];
}

function ensureDllsInFixedDir() {
  try {
    if (!fs.existsSync(FIXED_DLL_DIR)) {
      fs.mkdirSync(FIXED_DLL_DIR, { recursive: true });
    }
  } catch (e) {
    Logger.error('PkHexReader', `Cannot create ${FIXED_DLL_DIR}: ${e.message}`);
    return FIXED_DLL_DIR;
  }

  const dllFiles = ['PkHexReader.dll', 'PkHexReader.runtimeconfig.json', 'PkHexReader.deps.json', 'PKHeX.Core.dll'];
  const sourceDirs = getSourceDirCandidates();

  let copied = 0;
  for (const file of dllFiles) {
    const dest = path.join(FIXED_DLL_DIR, file);
    let destExists = false;
    if (fs.existsSync(dest)) {
      destExists = true;
      let foundNewer = false;
      for (const srcDir of sourceDirs) {
        const src = path.join(srcDir, file);
        try {
          if (fs.existsSync(src)) {
            const srcStat = fs.statSync(src);
            const destStat = fs.statSync(dest);
            if (srcStat.size !== destStat.size || srcStat.mtimeMs > destStat.mtimeMs) {
              foundNewer = true;
              Logger.info('PkHexReader', `[v${CODE_VERSION}] ${file} outdated (${destStat.size}b vs ${srcStat.size}b), updating`);
            }
            break;
          }
        } catch (e) {}
      }
      if (!foundNewer) {
        copied++;
        continue;
      }
    }
    let found = false;
    for (const srcDir of sourceDirs) {
      const src = path.join(srcDir, file);
      try {
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          Logger.info('PkHexReader', `[v${CODE_VERSION}] Copied ${file} from ${srcDir}`);
          copied++;
          found = true;
          break;
        }
      } catch (e) {
        Logger.warn('PkHexReader', `Failed to copy ${file} from ${srcDir}: ${e.message}`);
      }
    }
    if (!found) {
      Logger.warn('PkHexReader', `Source not found: ${file} in any of ${sourceDirs.length} directories`);
    }
  }

  Logger.info('PkHexReader', `[v${CODE_VERSION}] ensureDlls: ${copied}/${dllFiles.length} files ready in ${FIXED_DLL_DIR}`);
  return FIXED_DLL_DIR;
}

function findDll() {
  const name = 'PkHexReader.dll';
  const sourceDirs = getSourceDirCandidates();

  const fixedDll = path.join(FIXED_DLL_DIR, name);
  if (fs.existsSync(fixedDll)) {
    Logger.info('PkHexReader', `[v${CODE_VERSION}] DLL found at FIXED_DIR: ${fixedDll}`);
    return fixedDll;
  }

  for (const dir of sourceDirs) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      Logger.info('PkHexReader', `[v${CODE_VERSION}] DLL found at: ${p}`);
      return p;
    }
  }

  Logger.warn('PkHexReader', `[v${CODE_VERSION}] DLL NOT FOUND in any location. Searched:`);
  Logger.warn('PkHexReader', `  FIXED_DIR: ${fixedDll}`);
  sourceDirs.forEach(d => Logger.warn('PkHexReader', `  ${d}`));

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
      Logger.info('PkHexReader', `[v${CODE_VERSION}] resourcesPath=${process.resourcesPath || 'undefined'}`);
      Logger.info('PkHexReader', `[v${CODE_VERSION}] __dirname=${__dirname}`);
      Logger.info('PkHexReader', `[v${CODE_VERSION}] PORTABLE_EXECUTABLE_DIR=${process.env.PORTABLE_EXECUTABLE_DIR || 'undefined'}`);

      if (!dotnetPath) {
        return reject(new Error(
          '.NET 8.0 Runtime no encontrado. PKHeX requiere .NET 8.0 para funcionar.\n' +
          'Descarga desde: https://dotnet.microsoft.com/en-us/download/dotnet/8.0\n' +
          'Instala "Desktop Runtime 8.0.x" y reinicia la app.'
        ));
      }
      if (!dllPath) {
        return reject(new Error(
          'PkHexReader.dll no encontrado. Los archivos de PKHeX no se instalaron correctamente.\n' +
          'Reinstala la app o contacta al desarrollador.'
        ));
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
          Logger.error('PkHexReader', `[v${CODE_VERSION}] EXEC ERROR: ${error.message}`);
          if (stderr) Logger.error('PkHexReader', `[v${CODE_VERSION}] stderr: ${stderr.substring(0, 1000)}`);
          if (stdout) Logger.error('PkHexReader', `[v${CODE_VERSION}] stdout: ${stdout.substring(0, 500)}`);
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
          reject(new Error(`Parse error: ${e.message}. stdout: ${(stdout || '').substring(0, 500)}`));
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
