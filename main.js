const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');

app.commandLine.appendSwitch('js-flags', '--no-code-cache');
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { execFileSync, execFile } = require('child_process');

const Logger = require('./src/logger');
const { scanSprites, resolveSprite, getPreviewSprite } = require('./src/sprite-scanner');
const DetectSave = require('./src/detect-save');
const ProjectManager = require('./src/project-manager');
const PresetManager = require('./src/preset-manager');
const FileWatcher = require('./src/file-watcher');

function checkDotnetRuntime() {
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

function showDotnetMissingDialog() {
  const message = [
    'Se requiere .NET 8.0 Runtime para leer los archivos de guardado de Pokemon.',
    '',
    'La app usa PKHeX (librería oficial) que necesita .NET para funcionar.',
    '',
    'Opciones:',
    '1. Instala .NET 8.0 Desktop Runtime desde: https://dotnet.microsoft.com/en-us/download/dotnet/8.0',
    '2. Reinicia la app después de instalar',
    '',
    '¿Quieres abrir la página de descarga ahora?'
  ].join('\n');
  const { response } = dialog.showMessageBoxSync(mainWindow || null, {
    type: 'warning',
    title: '.NET 8.0 Runtime no encontrado',
    message,
    buttons: ['Descargar .NET', 'Cancelar'],
    defaultId: 0,
    cancelId: 1
  });
  if (response === 0) {
    shell.openExternal('https://dotnet.microsoft.com/en-us/download/dotnet/8.0');
  }
  return false;
}

function resolveBaseDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (fs.existsSync(path.join(exeDir, 'Recursos'))) return exeDir;
    const parent = path.dirname(exeDir);
    if (fs.existsSync(path.join(parent, 'Recursos'))) return parent;
    return exeDir;
  }
  if (app.isPackaged) {
    return app.getPath('userData');
  }
  return __dirname;
}

let dotnetAvailable = false;
let dotnetPath = null;

const BASE_DIR = resolveBaseDir();
const APP_DIR = app.isPackaged ? app.getAppPath() : __dirname;

if (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR) {
  Logger.setLogDir(path.join(BASE_DIR, 'logs'));
}

const SPRITES_ROOT = (() => {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (fs.existsSync(path.join(exeDir, 'Recursos', 'Sprites'))) return path.join(exeDir, 'Recursos', 'Sprites');
    const parent = path.dirname(exeDir);
    if (fs.existsSync(path.join(parent, 'Recursos', 'Sprites'))) return path.join(parent, 'Recursos', 'Sprites');
  }
  if (app.isPackaged) {
    const inUserData = path.join(app.getPath('userData'), 'Recursos', 'Sprites');
    if (fs.existsSync(inUserData)) return inUserData;
    const besideExe = path.join(path.dirname(process.execPath), 'Recursos', 'Sprites');
    if (fs.existsSync(besideExe)) return besideExe;
    return inUserData;
  }
  return path.join(__dirname, 'Recursos', 'Sprites');
})();
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = { language: 'es', backgroundMode: true, lastSeenVersion: '' };

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let forceQuit = false;
let overlayServer = null;
let overlayPort = 19876;

const sseClients = new Map();
const userDataDir = app.getPath('userData');
const projectManager = new ProjectManager(userDataDir);
const presetManager = new PresetManager(userDataDir);
const fileWatcher = new FileWatcher();

const GAMES = [
  { id: 'red', name: 'Pokemon Rojo', generation: 1, saveType: 'gen1' },
  { id: 'blue', name: 'Pokemon Azul', generation: 1, saveType: 'gen1' },
  { id: 'yellow', name: 'Pokemon Amarillo', generation: 1, saveType: 'gen1' },
  { id: 'gold', name: 'Pokemon Oro', generation: 2, saveType: 'gen2' },
  { id: 'silver', name: 'Pokemon Plata', generation: 2, saveType: 'gen2' },
  { id: 'crystal', name: 'Pokemon Cristal', generation: 2, saveType: 'gen2' },
  { id: 'ruby', name: 'Pokemon Rubi', generation: 3, saveType: 'gen3' },
  { id: 'sapphire', name: 'Pokemon Zafiro', generation: 3, saveType: 'gen3' },
  { id: 'emerald', name: 'Pokemon Esmeralda', generation: 3, saveType: 'gen3' },
  { id: 'firered', name: 'Pokemon Rojo Fuego', generation: 3, saveType: 'gen3' },
  { id: 'leafgreen', name: 'Pokemon Verde Hoja', generation: 3, saveType: 'gen3' },
  { id: 'diamond', name: 'Pokemon Diamante', generation: 4, saveType: 'gen4' },
  { id: 'pearl', name: 'Pokemon Perla', generation: 4, saveType: 'gen4' },
  { id: 'platinum', name: 'Pokemon Platino', generation: 4, saveType: 'gen4' },
  { id: 'heartgold', name: 'Pokemon HeartGold', generation: 4, saveType: 'gen4' },
  { id: 'soulsilver', name: 'Pokemon SoulSilver', generation: 4, saveType: 'gen4' },
  { id: 'black', name: 'Pokemon Negro', generation: 5, saveType: 'gen5' },
  { id: 'white', name: 'Pokemon Blanco', generation: 5, saveType: 'gen5' },
  { id: 'black2', name: 'Pokemon Negro 2', generation: 5, saveType: 'gen5' },
  { id: 'white2', name: 'Pokemon Blanco 2', generation: 5, saveType: 'gen5' },
  { id: 'x', name: 'Pokemon X', generation: 6, saveType: 'gen6' },
  { id: 'y', name: 'Pokemon Y', generation: 6, saveType: 'gen6' },
  { id: 'omegaruby', name: 'Pokemon Omega Ruby', generation: 6, saveType: 'gen6' },
  { id: 'alphasapphire', name: 'Pokemon Alpha Sapphire', generation: 6, saveType: 'gen6' },
  { id: 'sun', name: 'Pokemon Sol', generation: 7, saveType: 'gen7' },
  { id: 'moon', name: 'Pokemon Luna', generation: 7, saveType: 'gen7' },
  { id: 'ultrasun', name: 'Pokemon Ultra Sol', generation: 7, saveType: 'gen7' },
  { id: 'ultramoon', name: 'Pokemon Ultra Luna', generation: 7, saveType: 'gen7' },
  { id: 'sword', name: 'Pokemon Espada', generation: 8, saveType: 'gen8swsh' },
  { id: 'shield', name: 'Pokemon Escudo', generation: 8, saveType: 'gen8swsh' },
  { id: 'brilliantdiamond', name: 'Pokemon Diamante Brillante', generation: 8, saveType: 'gen8bdsp' },
  { id: 'shiningpearl', name: 'Pokemon Perla Reluciente', generation: 8, saveType: 'gen8bdsp' },
  { id: 'scarlet', name: 'Pokemon Escarlata', generation: 9, saveType: 'gen9' },
  { id: 'violet', name: 'Pokemon Violeta', generation: 9, saveType: 'gen9' },
];

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return { port: 19876 };
}

function saveConfigToFile(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {}
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    }
  } catch (err) {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettingsToFile(settings) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (err) {}
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const lang = (loadSettings().language) || 'es';
  const L = lang === 'es'
    ? { open: 'Abrir', settings: 'Configuracion', quit: 'Salir' }
    : { open: 'Open', settings: 'Settings', quit: 'Quit' };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: L.open, click: () => mainWindow.show() },
    { label: L.settings, click: () => createSettingsWindow(mainWindow) },
    { type: 'separator' },
    { label: L.quit, click: () => { forceQuit = true; app.quit(); } },
  ]));
}

function createSettingsWindow(parent) {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 420, height: 320, parent, modal: true, resizable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.webContents.on('did-finish-load', () => {
    settingsWindow.webContents.send('load-settings', loadSettings());
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function startOverlayServer() {
  const config = loadConfig();
  overlayPort = config.port || 19876;

  const FAKEMON_DIR = path.join(app.getPath('userData'), 'Fakemon');
  function ensureFakemonDir() { if (!fs.existsSync(FAKEMON_DIR)) fs.mkdirSync(FAKEMON_DIR, {recursive: true}); }
  function getFakemonMetaPath() { return path.join(FAKEMON_DIR, 'fakemon.json'); }
  function loadFakemonMeta() {
    const p = getFakemonMetaPath();
    if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) {} }
    return [];
  }
  function saveFakemonMeta(list) {
    ensureFakemonDir();
    fs.writeFileSync(getFakemonMetaPath(), JSON.stringify(list, null, 2), 'utf8');
  }

  const expressApp = express();
  expressApp.use('/css', express.static(path.join(APP_DIR, 'public', 'css')));
  expressApp.use('/js', express.static(path.join(APP_DIR, 'public', 'js')));
  expressApp.use('/sprites', express.static(SPRITES_ROOT));
  expressApp.use('/fakemon', express.static(FAKEMON_DIR));

  expressApp.get('/', (req, res) => {
    res.sendFile(path.join(APP_DIR, 'public', 'overlay.html'));
  });

  expressApp.get('/overlay/:projectId', (req, res) => {
    res.sendFile(path.join(APP_DIR, 'public', 'overlay.html'));
  });

  expressApp.get('/api/projects/:id', (req, res) => {
    const project = projectManager.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    res.json(project);
  });

  expressApp.get('/api/team/:projectId', (req, res) => {
    const pid = req.params.projectId;
    const project = projectManager.get(pid);
    if (project && project.inputMode === 'manual') {
      const { resolveSprite } = require('./src/sprite-scanner');
      const absStylePath = path.resolve(SPRITES_ROOT, project.spriteStylePath || '');
      const fakemonMeta = loadFakemonMeta();
      const rawTeam = project.manualTeam || [];
      const team = rawTeam.map(entry => {
        if (!entry) {
          return { speciesId: 0, nickname: '', isShiny: false, level: 0, form: 0, spriteUrl: null };
        }
        const speciesId = entry.speciesId || 0;
        let spriteUrl = null;
        if (speciesId <= -2000) {
          const f = fakemonMeta.find(e => e.id === speciesId);
          if (f && f.spriteFile) spriteUrl = `/fakemon/${encodeURIComponent(f.spriteFile)}`;
        } else if (speciesId !== 0 && speciesId !== -1) {
          spriteUrl = resolveSprite(absStylePath, speciesId === -2 ? 0 : speciesId, {
            spritesRoot: SPRITES_ROOT,
            styleId: project.spriteStyle
          });
        }
        return {
          speciesId,
          nickname: entry.nickname || '',
          isShiny: false,
          level: 0,
          form: 0,
          spriteUrl: spriteUrl ? `http://127.0.0.1:${overlayPort}${spriteUrl}` : null
        };
      });

      while (team.length < 6) {
        team.push({ speciesId: 0, nickname: '', isShiny: false, level: 0, form: 0, spriteUrl: null });
      }

      if (project.usePlaceholder) {
        const placeholderUrl = resolveSprite(absStylePath, 0, {
          spritesRoot: SPRITES_ROOT,
          styleId: project.spriteStyle
        });
        if (placeholderUrl) {
          for (let i = 0; i < 6; i++) {
            if (!team[i].spriteUrl) {
              team[i].spriteUrl = `http://127.0.0.1:${overlayPort}${placeholderUrl}`;
              team[i].isPlaceholder = true;
            }
          }
        }
      }
      return res.json({ team });
    }
    const team = fileWatcher.getCachedTeam(pid);
    res.json({ team });
  });

  expressApp.get('/events/:projectId', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('\n');

    const projectId = req.params.projectId;
    if (!sseClients.has(projectId)) sseClients.set(projectId, new Set());
    sseClients.get(projectId).add(res);

    req.on('close', () => {
      const clients = sseClients.get(projectId);
      if (clients) clients.delete(res);
    });
  });

  const server = http.createServer(expressApp);
  server.listen(overlayPort, '127.0.0.1', () => {
    Logger.info('Server', `Overlay server running on port ${overlayPort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      Logger.warn('Server', `Port ${overlayPort} in use, trying ${overlayPort + 1}`);
      overlayPort++;
      config.port = overlayPort;
      saveConfigToFile(config);
      server.listen(overlayPort, '127.0.0.1');
    } else {
      Logger.error('Server', `Overlay server error: ${err.message}`);
    }
  });

  overlayServer = server;
}

function startWatching(project) {
  if (!project || !project.savePath) return;
  fileWatcher.updatePlaceholderConfig(project.id, {
    usePlaceholder: project.usePlaceholder || false
  });
  fileWatcher.startWatching(
    project.id,
    project.savePath,
    project.game,
    project.spriteStyle,
    project.spriteStylePath,
    SPRITES_ROOT,
    sseClients,
    (projectId, team, error) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const prefixed = error ? team : team.map(p => p.spriteUrl ? { ...p, spriteUrl: `http://127.0.0.1:${overlayPort}${p.spriteUrl}` } : p);
        mainWindow.webContents.send('team-updated', projectId, prefixed, error);
      }
    }
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));

  try {
    const iconPath = path.join(resolveBaseDir(), 'icon.png');
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);
    } else {
      const size = 16;
      const buf = Buffer.alloc(size * size * 4);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const cx = x - size / 2, cy = y - size / 2;
          const dist = Math.sqrt(cx * cx + cy * cy);
          if (dist < size / 2 - 1) {
            buf[i] = 230; buf[i + 1] = 0; buf[i + 2] = 18; buf[i + 3] = 255;
          } else if (dist < size / 2) {
            buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255;
          } else {
            buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 0;
          }
        }
      }
      tray = new Tray(nativeImage.createFromBuffer(buf, { width: size, height: size }));
    }
    tray.setToolTip('Nuzlocke Overlay');
    updateTrayMenu();
    tray.on('click', () => mainWindow.show());
  } catch (e) {
    Logger.error('App', `Tray creation failed: ${e.message}`);
  }

  mainWindow.on('close', (event) => {
    if (forceQuit) return;
    if (loadSettings().backgroundMode) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// === IPC HANDLERS ===

ipcMain.handle('get-base-dir', () => BASE_DIR);
ipcMain.handle('get-dotnet-status', () => ({ available: dotnetAvailable, path: dotnetPath || null }));
ipcMain.handle('stop-watching', (event, projectId) => { fileWatcher.stopWatching(projectId); return true; });

// Projects
ipcMain.handle('list-projects', () => projectManager.listAll());
ipcMain.handle('get-project', (event, id) => projectManager.get(id));
ipcMain.handle('create-project', (event, data) => {
  const project = projectManager.create(data);
  if (project && project.savePath) startWatching(project);
  return project;
});
ipcMain.handle('update-project', (event, id, data) => {
  console.log('[MAIN] update-project:', id, 'inputMode:', data.inputMode);
  const updated = projectManager.update(id, data);
  if (updated) {
    fileWatcher.stopWatching(id);
    if (updated.inputMode !== 'manual' && updated.savePath) startWatching(updated);
    else fileWatcher.updatePlaceholderConfig(id, { usePlaceholder: updated.usePlaceholder || false });
    const clients = sseClients.get(id) || new Set();
    for (const client of clients) {
      client.write(`event: config-updated\ndata: ${JSON.stringify(updated)}\n\n`);
    }
  }
  return updated;
});
ipcMain.handle('delete-project', (event, id) => {
  fileWatcher.stopWatching(id);
  sseClients.delete(id);
  return projectManager.delete(id);
});

// Team
ipcMain.handle('get-team', (event, projectId) => {
  const project = projectManager.get(projectId);
  console.log('[MAIN] get-team:', projectId, 'inputMode:', project?.inputMode);
  if (project && project.inputMode === 'manual') {
    const { resolveSprite } = require('./src/sprite-scanner');
    const absStylePath = path.resolve(SPRITES_ROOT, project.spriteStylePath || '');
    const fakemonMeta = loadFakemonMeta();
    const rawTeam = project.manualTeam || [];
    const team = rawTeam.map(entry => {
      if (!entry) {
        return { speciesId: 0, nickname: '', isShiny: false, level: 0, form: 0, spriteUrl: null };
      }
      const speciesId = entry.speciesId || 0;
      let spriteUrl = null;
      if (speciesId <= -2000) {
        const f = fakemonMeta.find(e => e.id === speciesId);
        if (f && f.spriteFile) {
          spriteUrl = `/fakemon/${encodeURIComponent(f.spriteFile)}`;
        }
      } else if (speciesId !== 0 && speciesId !== -1) {
        spriteUrl = resolveSprite(absStylePath, speciesId === -2 ? 0 : speciesId, {
          spritesRoot: SPRITES_ROOT,
          styleId: project.spriteStyle
        });
      }
      return {
        speciesId,
        nickname: entry.nickname || '',
        isShiny: false,
        level: 0,
        form: 0,
        spriteUrl: spriteUrl ? `http://127.0.0.1:${overlayPort}${spriteUrl}` : null
      };
    });

    while (team.length < 6) {
      team.push({ speciesId: 0, nickname: '', isShiny: false, level: 0, form: 0, spriteUrl: null });
    }

    if (project.usePlaceholder) {
      const placeholderUrl = resolveSprite(absStylePath, 0, {
        spritesRoot: SPRITES_ROOT,
        styleId: project.spriteStyle
      });
      if (placeholderUrl) {
        for (let i = 0; i < 6; i++) {
          if (!team[i].spriteUrl) {
            team[i].spriteUrl = `http://127.0.0.1:${overlayPort}${placeholderUrl}`;
            team[i].isPlaceholder = true;
          }
        }
      }
    }
    return team;
  }
  const team = fileWatcher.getCachedTeam(projectId);
  return team.map(p => p.spriteUrl ? { ...p, spriteUrl: `http://127.0.0.1:${overlayPort}${p.spriteUrl}` } : p);
});

ipcMain.handle('set-manual-team', (event, projectId, manualTeam) => {
  const project = projectManager.get(projectId);
  console.log('[MAIN] set-manual-team:', projectId, 'inputMode:', project?.inputMode, 'manualTeam len:', manualTeam?.length);
  if (!project || project.inputMode !== 'manual') { console.log('[MAIN] set-manual-team: RETURNING NULL'); return null; }

  const { resolveSprite } = require('./src/sprite-scanner');
  const absStylePath = path.resolve(SPRITES_ROOT, project.spriteStylePath || '');
  const fakemonMeta = loadFakemonMeta();

  const team = (manualTeam || []).map(entry => {
    if (!entry) {
      return { speciesId: 0, nickname: '', isShiny: false, level: 0, form: 0, spriteUrl: null };
    }
    const speciesId = entry.speciesId || 0;
    let spriteUrl = null;
    if (speciesId <= -2000) {
      const f = fakemonMeta.find(e => e.id === speciesId);
      if (f && f.spriteFile) {
        spriteUrl = `/fakemon/${encodeURIComponent(f.spriteFile)}`;
      }
    } else if (speciesId !== 0 && speciesId !== -1) {
      spriteUrl = resolveSprite(absStylePath, speciesId === -2 ? 0 : speciesId, {
        spritesRoot: SPRITES_ROOT,
        styleId: project.spriteStyle
      });
    }
    return {
      speciesId,
      nickname: entry.nickname || '',
      isShiny: false,
      level: 0,
      form: 0,
      spriteUrl
    };
  });

  while (team.length < 6) {
    team.push({ speciesId: 0, nickname: '', isShiny: false, level: 0, form: 0, spriteUrl: null });
  }

  if (project.usePlaceholder) {
    const placeholderUrl = resolveSprite(absStylePath, 0, {
      spritesRoot: SPRITES_ROOT,
      styleId: project.spriteStyle
    });
    if (placeholderUrl) {
      for (let i = 0; i < team.length; i++) {
        if (!team[i].spriteUrl) {
          team[i].spriteUrl = placeholderUrl;
          team[i].isPlaceholder = true;
        }
      }
    }
  }

  const prefixed = team.map(p => p.spriteUrl
    ? { ...p, spriteUrl: `http://127.0.0.1:${overlayPort}${p.spriteUrl}` }
    : p);

  const clients = sseClients.get(projectId) || new Set();
  const eventData = JSON.stringify({ team: prefixed });
  for (const client of clients) {
    client.write(`data: ${eventData}\n\n`);
  }

  return prefixed;
});

ipcMain.handle('get-species-list', () => {
  return require('./src/species-list');
});

ipcMain.handle('get-fakemon-list', () => loadFakemonMeta());

ipcMain.handle('get-fakemon-sprite', (event, fakemonId) => {
  const meta = loadFakemonMeta();
  const f = meta.find(e => e.id === fakemonId);
  if (!f || !f.spriteFile) return null;
  const fullPath = path.join(FAKEMON_DIR, f.spriteFile);
  if (!fs.existsSync(fullPath)) return null;
  return `/fakemon/${encodeURIComponent(f.spriteFile)}`;
});

ipcMain.handle('import-fakemon', async (event) => {
  console.log('[MAIN] import-fakemon called');
  const { dialog, BrowserWindow } = require('electron');
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: 'Seleccionar sprite del Fakemon',
    filters: [{name: 'Images', extensions: ['png','gif','jpg','jpeg','webp']}],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  const srcPath = result.filePaths[0];
  const meta = loadFakemonMeta();
  const nextNum = meta.length + 1;
  const idLabel = 'F' + String(nextNum).padStart(3, '0');
  const ext = path.extname(srcPath) || '.png';
  const filename = `fakemon_${nextNum}${ext}`;
  ensureFakemonDir();
  const destPath = path.join(FAKEMON_DIR, filename);
  fs.copyFileSync(srcPath, destPath);

  // Single modal window for name input with sprite preview
  const inputWin = new BrowserWindow({
    width: 380, height: 220, parent: win, modal: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    resizable: false, autoHideMenuBar: true, show: false
  });
  inputWin.setMenu(null);
  const inputHtml = `<!DOCTYPE html><html><head><style>
    body{background:#1a1a2e;color:#e0e0e0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;margin:0;padding:16px;overflow:hidden;}
    input{background:#0f0f1a;color:#e0e0e0;border:1px solid #2a2a40;border-radius:4px;padding:8px;font-size:14px;width:280px;margin:8px 0;outline:none;}
    input:focus{border-color:#e94560;}
    .btn-row{display:flex;gap:8px;margin-top:12px;}
    button{border:none;border-radius:4px;padding:10px 24px;font-size:13px;cursor:pointer;}
    .btn-primary{background:#e94560;color:#fff;}
    .btn-primary:hover{background:#c73550;}
    .btn-cancel{background:#2a2a40;color:#aaa;}
    .btn-cancel:hover{background:#3a3a50;color:#fff;}
    label{font-size:13px;margin-bottom:4px;color:#ccc;}
    .preview{width:64px;height:64px;image-rendering:pixelated;margin-bottom:8px;border:1px solid #2a2a40;border-radius:4px;}
    h3{margin:0 0 8px;color:#e94560;font-size:14px;}
  </style></head><body>
    <h3>Nuevo Fakemon: ${idLabel}</h3>
    <img class="preview" src="file:///${destPath.replace(/\\/g, '/')}" alt="Sprite preview">
    <label>Nombre:</label>
    <input id="fName" type="text" placeholder="${idLabel}" autofocus>
    <div class="btn-row">
      <button class="btn-cancel" id="fCancel">Cancelar</button>
      <button class="btn-primary" id="fOk">Crear Fakemon</button>
    </div>
    <script>
      const { ipcRenderer } = require('electron');
      const input = document.getElementById('fName');
      input.focus();
      document.getElementById('fOk').onclick=()=>{
        const n=input.value.trim();
        ipcRenderer.send('fakemon-name-result', n || '${idLabel}');
      };
      document.getElementById('fCancel').onclick=()=>{
        ipcRenderer.send('fakemon-name-result', '');
      };
      input.addEventListener('keydown',(e)=>{
        if(e.key==='Enter')document.getElementById('fOk').click();
        if(e.key==='Escape')document.getElementById('fCancel').click();
      });
    </script>
  </body></html>`;
  inputWin.loadURL('data:text/html,' + encodeURIComponent(inputHtml));
  
  inputWin.once('ready-to-show', () => inputWin.show());
  
  let fakemonName = null;
  let finished = false;
  await new Promise(resolve => {
    const onName = (e, name) => {
      if (!finished) {
        finished = true;
        fakemonName = name || '';
        if (inputWin && !inputWin.isDestroyed()) inputWin.close();
        resolve();
      }
    };
    ipcMain.once('fakemon-name-result', onName);
    inputWin.on('closed', () => {
      if (!finished) {
        finished = true;
        fakemonName = null;
      }
      ipcMain.removeListener('fakemon-name-result', onName);
      resolve();
    });
    setTimeout(() => {
      if (!finished) {
        finished = true;
        fakemonName = null;
        if (inputWin && !inputWin.isDestroyed()) inputWin.close();
        resolve();
      }
    }, 30000);
  });
  
  if (!fakemonName) {
    const filePath = path.join(FAKEMON_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return null;
  }

  const entry = {id: -2000 - nextNum, idLabel, name: fakemonName, spriteFile: filename};
  meta.push(entry);
  saveFakemonMeta(meta);
  return entry;
});

ipcMain.handle('select-fakemon-sprite', async (event) => {
  const { dialog, BrowserWindow } = require('electron');
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: 'Seleccionar nuevo sprite para el Fakemon',
    filters: [{name: 'Images', extensions: ['png','gif','jpg','jpeg','webp']}],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  const srcPath = result.filePaths[0];
  const ext = path.extname(srcPath) || '.png';
  const tempFilename = `fakemon_edit_${Date.now()}${ext}`;
  ensureFakemonDir();
  const destPath = path.join(FAKEMON_DIR, tempFilename);
  fs.copyFileSync(srcPath, destPath);
  return tempFilename;
});

ipcMain.handle('delete-fakemon', (event, fakemonId) => {
  const meta = loadFakemonMeta();
  const idx = meta.findIndex(e => e.id === fakemonId);
  if (idx === -1) return false;
  const entry = meta[idx];
  const filePath = path.join(FAKEMON_DIR, entry.spriteFile);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  meta.splice(idx, 1);
  saveFakemonMeta(meta);
  return true;
});

ipcMain.handle('edit-fakemon', async (event, fakemonId, newName, newSpriteFile) => {
  const meta = loadFakemonMeta();
  const entry = meta.find(e => e.id === fakemonId);
  if (!entry) return null;

  if (newName !== undefined && newName !== null) {
    entry.name = newName;
  }

  if (newSpriteFile && newSpriteFile !== entry.spriteFile) {
    const oldPath = path.join(FAKEMON_DIR, entry.spriteFile);
    entry.spriteFile = newSpriteFile;
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  saveFakemonMeta(meta);
  return entry;
});

// Overlay URL
ipcMain.handle('get-overlay-url', (event, projectId) => {
  return `http://127.0.0.1:${overlayPort}/overlay/${projectId}`;
});

ipcMain.handle('get-port', () => overlayPort);

// Styles
ipcMain.handle('get-styles', () => scanSprites(SPRITES_ROOT));
ipcMain.handle('refresh-styles', () => { invalidateStyleCache(); return scanSprites(SPRITES_ROOT); });
ipcMain.handle('resolve-sprite', (event, stylePath, speciesId, options) => {
  return resolveSprite(stylePath, speciesId, options);
});
ipcMain.handle('get-preview-sprite', (event, stylePath) => {
  return getPreviewSprite(SPRITES_ROOT, stylePath);
});

// Games
ipcMain.handle('get-games', () => GAMES);

// Presets
ipcMain.handle('list-presets', () => presetManager.listAll());
ipcMain.handle('save-preset', (event, data) => presetManager.create(data));
ipcMain.handle('delete-preset', (event, presetId) => presetManager.delete(presetId));

// Save file browsing
ipcMain.handle('browse-save-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar save file o carpeta del emulador',
    filters: [
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const selected = result.filePaths[0];
  if (fs.existsSync(selected) && fs.statSync(selected).isDirectory()) {
    const fileResult = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar archivo save dentro de la carpeta',
      defaultPath: selected,
      filters: [
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (fileResult.canceled || !fileResult.filePaths.length) return null;
    return fileResult.filePaths[0];
  }
  return selected;
});

// Detect game
ipcMain.handle('detect-game', async (event, savePath) => {
  try {
    let filePath = savePath;
    // If path is a directory (e.g. Citra 00000001 folder), find the actual save file
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      const mainFile = path.join(filePath, 'main');
      if (fs.existsSync(mainFile)) {
        filePath = mainFile;
      } else {
        const files = fs.readdirSync(filePath).filter(f => fs.statSync(path.join(filePath, f)).isFile());
        if (files.length > 0) filePath = path.join(filePath, files[0]);
      }
    }
    const buffer = fs.readFileSync(filePath);
    const detected = DetectSave.detect(buffer);
    if (detected) return detected;

    // Fallback: try PKHeX for detection
    try {
      const PkHexReader = require('./src/pkhex-reader');
      const result = await PkHexReader.parse(filePath);
      if (result && result.generation) {
        Logger.info('App', `PKHeX detected: gen${result.generation} ${result.game}`);
        const saveTypeMap = { 1: 'gen1', 2: 'gen2', 3: 'gen3', 4: 'gen4', 5: 'gen5', 6: 'gen6', 7: 'gen7', 8: 'gen8swsh', 9: 'gen9' };
        return {
          generation: result.generation,
          saveType: saveTypeMap[result.generation] || 'gen' + result.generation,
          version: result.version || result.game || 'auto',
          name: 'Pokemon Gen ' + result.generation + ' (PKHeX)'
        };
      }
    } catch (pkErr) {
      Logger.warn('App', `PKHeX detection fallback failed: ${pkErr.message}`);
    }

    return null;
  } catch (e) {
    Logger.error('App', `detect-game error: ${e.message}`);
    return null;
  }
});

// Open external URL (only HTTPS for security)
  ipcMain.handle('open-external', (event, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      shell.openExternal(url);
    }
  });

// Config (overlay port)
ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (event, config) => {
  saveConfigToFile(config);
  return config;
});

// Settings
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (event, newSettings) => {
  const oldSettings = loadSettings();
  saveSettingsToFile(newSettings);
  if (newSettings.logEndpoint !== oldSettings.logEndpoint) {
    Logger.setLogEndpoint(newSettings.logEndpoint || null);
    Logger.info('Main', `Log endpoint changed: ${newSettings.logEndpoint || 'disabled'}`);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-changed', newSettings);
    updateTrayMenu();
  }
  return newSettings;
});

let _systemFontsCache = null;
ipcMain.handle('get-system-fonts', async () => {
  if (_systemFontsCache) return _systemFontsCache;
  try {
    const { execFileSync } = require('child_process');
    const fs = require('fs');
    const tmpScript = path.join(app.getPath('temp'), 'nuzlocke-fonts.ps1');
    const psScript = [
      '$raw = @()',
      'foreach ($root in @("HKLM","HKCU")) {',
      '  $regPath = "$root" + ":\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"',
      '  $item = Get-ItemProperty $regPath -ErrorAction SilentlyContinue',
      '  if ($item) {',
      '    $item.PSObject.Properties | Where-Object { $_.Value -match ".+" -and $_.Name -notmatch "PS" } |',
      '    ForEach-Object { $raw += $_.Name }',
      '  }',
      '}',
      '$clean = $raw | ForEach-Object {',
      '  $s = $_ -replace "\\(.*","" -replace ";$","" -replace "^\\s+|\\s+$",""',
      '  $s -split "\\s*&\\s*"',
      '} | ForEach-Object { $_ } | Sort-Object -Unique',
      '$clean'
    ].join('\n');
    fs.writeFileSync(tmpScript, psScript, 'utf8');
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpScript], { timeout: 15000, encoding: 'utf8' });
    try { fs.unlinkSync(tmpScript); } catch(e) {}
    const skipExact = /^(modern|roman|script|symbol|sans serif collection|font|fonts)$/i;
    const fonts = out.split(/\r?\n/)
      .map(s => s.trim().replace(/^"|"$/g, ''))
      .filter(f => f && f.length > 1 && !skipExact.test(f))
      .sort((a, b) => a.localeCompare(b));
    _systemFontsCache = fonts.length > 0 ? fonts : getDefaultFonts();
    return _systemFontsCache;
  } catch (e) {
    console.error('[FONTS] Failed:', e.message);
    _systemFontsCache = getDefaultFonts();
    return _systemFontsCache;
  }
});

function getDefaultFonts() {
  return [
    'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS',
    'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic',
    'Futura', 'Gabriola', 'Georgia', 'Haettenschweiler', 'Impact', 'Ink Free',
    'Leelawadee', 'Lucida Console', 'Lucida Sans', 'Malgun Gothic', 'Microsoft JhengHei',
    'Microsoft Sans Serif', 'Myanmar Text', 'Nirmala UI', 'Palatino Linotype',
    'Papyrus', 'Perpetua', 'Rockwell', 'Segoe UI', 'SimSun', 'Snap ITC',
    'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Viner Hand ITC'
  ];
}

ipcMain.on('open-settings', (event) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  if (parent) createSettingsWindow(parent);
});
ipcMain.on('update-settings', (event, newSettings) => {
  saveSettingsToFile(newSettings);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-changed', newSettings);
    updateTrayMenu();
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
});

const GITHUB_REPO = 'pokejgameryt-ship-it/nuzlocke-overlay';
const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'NuzlockeOverlay' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

ipcMain.handle('check-for-updates', async (event, includeBetas) => {
  try {
    const releases = await fetchJSON(`https://api.github.com/repos/${GITHUB_REPO}/releases`);
    const allReleases = (Array.isArray(releases) ? releases : []).filter(r => !r.draft);
    const stableRelease = allReleases.find(r => !r.prerelease);
    const betaRelease = allReleases.find(r => r.prerelease);
    const currentVersion = app.getVersion();
    const settings = loadSettings();
    const skippedVersion = settings.skippedVersion || '';
    const lastSeenVersion = settings.lastSeenVersion || '';
    const wantBetas = includeBetas || settings.includeBetas || false;

    const parseVer = (v) => v.split('.').map(Number);
    const cur = parseVer(currentVersion);
    const compareVer = (a, b) => {
      const va = parseVer(a), vb = parseVer(b);
      for (let i = 0; i < 3; i++) {
        if ((va[i] || 0) > (vb[i] || 0)) return 1;
        if ((va[i] || 0) < (vb[i] || 0)) return -1;
      }
      return 0;
    };

    let targetRelease = null;
    let isPrerelease = false;
    if (stableRelease) {
      const stableVer = (stableRelease.tag_name || '').replace(/^v/, '');
      if (compareVer(stableVer, currentVersion) > 0) {
        targetRelease = stableRelease;
      }
    }
    if (!targetRelease && wantBetas && betaRelease) {
      const betaVer = (betaRelease.tag_name || '').replace(/^v/, '');
      if (compareVer(betaVer, currentVersion) > 0) {
        targetRelease = betaRelease;
        isPrerelease = true;
      }
    }
    if (!targetRelease) return { hasUpdate: false, hasChangelog: false };

    const latestVersion = (targetRelease.tag_name || '').replace(/^v/, '');
    const hasUpdate = true;
    const hasChangelog = latestVersion !== lastSeenVersion;
    console.log('[UPDATE] check:', { currentVersion, latestVersion, isPrerelease, lastSeenVersion, hasUpdate, hasChangelog });
    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      isPrerelease,
      releaseNotes: targetRelease.body || '',
      releaseUrl: targetRelease.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
      skipped: hasUpdate && skippedVersion === latestVersion,
      hasChangelog: !!hasChangelog,
    };
  } catch (e) {
    return { hasUpdate: false, hasChangelog: false, error: e.message };
  }
});

ipcMain.handle('skip-version', (event, version) => {
  const settings = loadSettings();
  settings.skippedVersion = version;
  saveSettingsToFile(settings);
  return true;
});

ipcMain.handle('download-update', async (event, releaseUrl) => {
  const webContents = event.sender;
  try {
    const release = await fetchJSON(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    const assets = release.assets || [];
    const installer = assets.find(a => a.name && a.name.endsWith('.exe') && a.name.includes('Setup'));
    if (!installer) return { success: false, error: 'Installer not found in release assets' };

    const downloadUrl = installer.browser_download_url;
    const tempDir = app.getPath('temp');
    const destPath = path.join(tempDir, installer.name);

    webContents.send('download-progress', { status: 'downloading', message: 'Downloading update...', current: 0, total: 100 });

    await new Promise((resolve, reject) => {
      const doDownload = (url, redirectsLeft) => {
        https.get(url, { headers: { 'User-Agent': 'NuzlockeOverlay' } }, (res) => {
          if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location && redirectsLeft > 0) {
            res.resume();
            return doDownload(res.headers.location, redirectsLeft - 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error('HTTP ' + res.statusCode));
          }
          const dir = path.dirname(destPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on('finish', () => {
            file.close(() => resolve());
          });
          file.on('error', (e) => {
            try { fs.unlinkSync(destPath); } catch(ex) {}
            reject(e);
          });
        }).on('error', reject);
      };
      doDownload(downloadUrl, 5);
    });

    webContents.send('download-progress', { status: 'done', message: 'Download complete', current: 100, total: 100 });
    await new Promise(r => setTimeout(r, 500));
    shell.openPath(destPath);
    return { success: true, path: destPath };
  } catch (e) {
    console.error('[UPDATE] Download failed:', e.message);
    webContents.send('download-progress', { status: 'error', message: e.message });
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dismiss-changelog', (event, version) => {
  const settings = loadSettings();
  settings.lastSeenVersion = version;
  saveSettingsToFile(settings);
  console.log('[CHANGELOG] dismissed, saved lastSeenVersion:', version);
  return true;
});

// === DOWNLOAD RECURSOS VIA ZIPs + FAST LEGACY ===
const SPRITES_ZIP_MANIFEST_URL = 'https://raw.githubusercontent.com/pokejgameryt-ship-it/nuzlocke-overlay/master/sprites-manifest.json';
const SPRITES_ZIP_BASE_URL = 'https://github.com/pokejgameryt-ship-it/nuzlocke-overlay/releases/download/sprites-v1/';
const GDRIVE_LEGACY_MANIFEST = 'https://raw.githubusercontent.com/pokejgameryt-ship-it/nuzlocke-overlay/master/public/recursos-manifest.json';
const GDRIVE_DOWNLOAD_URL = 'https://drive.google.com/uc?export=download';
const extractZip = require('extract-zip');
const dlAgent = new https.Agent({ keepAlive: true, maxSockets: 80, maxFreeSockets: 30, timeout: 30000 });

let activeDownload = null;

function dlBuffer(url) {
  return new Promise((resolve, reject) => {
    const doReq = (u, left) => {
      https.get(u, { headers: { 'User-Agent': 'NuzlockeOverlay' }, agent: dlAgent }, (res) => {
        if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location && left > 0) {
          res.resume(); return doReq(res.headers.location, left - 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        const ch = []; res.on('data', (c) => ch.push(c)); res.on('end', () => resolve(Buffer.concat(ch))); res.on('error', reject);
      }).on('error', reject);
    };
    doReq(url, 5);
  });
}

function dlFileStream(url, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = fs.createWriteStream(destPath);
    const doReq = (u, left) => {
      https.get(u, { headers: { 'User-Agent': 'NuzlockeOverlay' }, agent: dlAgent }, (res) => {
        if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location && left > 0) {
          res.resume(); return doReq(res.headers.location, left - 1);
        }
        if (res.statusCode !== 200) { res.resume(); file.close(); try { fs.unlinkSync(destPath); } catch(ex) {} return reject(new Error('HTTP ' + res.statusCode)); }
        res.pipe(file);
        file.on('finish', () => { file.close(() => resolve()); });
        file.on('error', (e) => { try { fs.unlinkSync(destPath); } catch(ex) {} reject(e); });
      }).on('error', (e) => { file.close(); reject(e); });
    };
    doReq(url, 5);
  });
}

async function dlRetry(url, destPath, retries) {
  retries = retries || 3;
  for (let i = 0; i <= retries; i++) {
    try { await dlFileStream(url, destPath); return; }
    catch (e) { if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1))); else throw e; }
  }
}

function fmtBytes(b) {
  if (!b) return '0 B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(0) + ' MB';
  return (b / 1073741824).toFixed(1) + ' GB';
}

function sendDownloadProgress(data) {
  activeDownload = { ...activeDownload, ...data, _ts: Date.now() };
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('download-progress', data);
    }
  } catch (e) { /* window closed, progress stored in activeDownload */ }
}

ipcMain.handle('download-recursos', async (event) => {
  const webContents = event.sender;
  const destDir = path.join(userDataDir, 'Recursos');
  const spritesDir = path.join(destDir, 'Sprites');
  if (!fs.existsSync(spritesDir)) fs.mkdirSync(spritesDir, { recursive: true });

  try {
    let zipManifest = null;
    try {
      sendDownloadProgress({ status: 'listing', message: 'Checking for sprite packs...' });
      const data = await dlBuffer(SPRITES_ZIP_MANIFEST_URL);
      zipManifest = JSON.parse(data.toString());
    } catch (e) { zipManifest = null; }

    if (zipManifest && zipManifest.zips && zipManifest.zips.length > 0) {
      return await doZipDownload(webContents, spritesDir, zipManifest);
    }
    return await doMultiGenDownload(webContents, spritesDir);
  } catch (e) {
    console.error('[DOWNLOAD] Failed:', e.message);
    sendDownloadProgress({ status: 'error', message: e.message });
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-download-status', () => {
  return activeDownload || null;
});

ipcMain.handle('cancel-download', () => {
  if (activeDownload) {
    activeDownload.status = 'cancelled';
    sendDownloadProgress({ status: 'cancelled', message: 'Download cancelled' });
  }
  return { success: true };
});

async function doZipDownload(webContents, spritesDir, zipManifest) {
  const zips = zipManifest.zips;
  const totalZips = zips.length;
  let done = 0, totalBytes = 0, dlBytes = 0;
  for (const z of zips) totalBytes += z.size || 0;

  sendDownloadProgress({ status: 'downloading', message: totalZips + ' sprite packs to download...', current: 0, total: totalZips, bytesTotal: totalBytes, bytesDownloaded: 0, isZipMode: true });

  const tmpDir = path.join(path.dirname(spritesDir), '_zip_temp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  let idx = 0;
  let lastReport = 0;

  function reportZipProgress() {
    const now = Date.now();
    if (now - lastReport < 500) return;
    lastReport = now;
    sendDownloadProgress({ status: 'downloading', message: done + '/' + totalZips + ' packs (' + fmtBytes(dlBytes) + '/' + fmtBytes(totalBytes) + ')', current: done, total: totalZips, bytesTotal: totalBytes, bytesDownloaded: dlBytes, isZipMode: true });
  }

  async function zipWorker() {
    while (true) {
      if (activeDownload && activeDownload.status === 'cancelled') break;
      const i = idx++;
      if (i >= zips.length) break;
      const zip = zips[i];
      const zipPath = path.join(tmpDir, zip.name);
      try {
        if (!fs.existsSync(zipPath)) await dlFileStream(zip.url || (SPRITES_ZIP_BASE_URL + zip.name), zipPath);
        dlBytes += zip.size || 0;
        reportZipProgress();
        await extractZip(zipPath, { dir: spritesDir });
        done++;
        reportZipProgress();
      } catch (e) {
        console.error('[DOWNLOAD] ZIP failed:', zip.name, e.message);
        done++;
        reportZipProgress();
      }
    }
  }

  const workers = [];
  for (let i = 0; i < 3; i++) workers.push(zipWorker());
  await Promise.all(workers);

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(ex) {}
  // Write marker with expected file count from legacy manifest
  try {
    const mData = await dlBuffer(GDRIVE_LEGACY_MANIFEST);
    const legacyManifest = JSON.parse(mData.toString());
    const totalFiles = (legacyManifest.files || []).length;
    const markerPath = path.join(path.dirname(spritesDir), '.download-marker');
    fs.writeFileSync(markerPath, JSON.stringify({ total: totalFiles, date: Date.now() }));
  } catch (e) {}
  sendDownloadProgress({ status: 'done', message: 'Download complete', current: totalZips, total: totalZips, bytesTotal: totalBytes, bytesDownloaded: totalBytes, isZipMode: true });
  _cachedStyles = null;
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('styles-refreshed', scanSprites(SPRITES_ROOT));
    }
  } catch (e) {}
  return { success: true, zips: done };
}

async function doMultiGenDownload(webContents, spritesDir) {
  const WORKERS = 50;

  sendDownloadProgress({ status: 'listing', message: 'Fetching file manifest...' });
  const mData = await dlBuffer(GDRIVE_LEGACY_MANIFEST);
  const manifest = JSON.parse(mData.toString());
  const allFiles = manifest.files || [];
  const total = allFiles.length;

  sendDownloadProgress({ status: 'listing', message: 'Checking existing files...' });
  const existing = new Set();
  const filesToDownload = [];
  for (const file of allFiles) {
    const filePath = path.join(spritesDir, file.path);
    try { fs.accessSync(filePath, fs.constants.F_OK); existing.add(file.path); } catch (e) { filesToDownload.push(file); }
  }
  const skipped = existing.size;
  const toDownload = filesToDownload.length;

  let downloaded = 0;
  let failed = 0;
  let idx = 0;
  let lastReport = 0;

  function reportProgress() {
    const now = Date.now();
    if (now - lastReport < 1000) return;
    lastReport = now;
    sendDownloadProgress({
      status: 'downloading',
      message: (skipped + downloaded) + '/' + total + ' files (' + failed + ' failed)',
      current: skipped + downloaded,
      total
    });
  }

  function gdriveDl(fileId, destPath) {
    return new Promise((resolve, reject) => {
      const url = GDRIVE_DOWNLOAD_URL + '&id=' + fileId + '&confirm=t';
      const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, agent: dlAgent, timeout: 15000 }, (res) => {
        if (res.statusCode >= 301 && res.statusCode <= 308) {
          const loc = res.headers.location;
          res.resume();
          if (loc && !loc.includes('virus')) {
            https.get(loc, { headers: { 'User-Agent': 'Mozilla/5.0' }, agent: dlAgent, timeout: 15000 }, (r2) => handleGdrive(r2, destPath, resolve, reject)).on('error', (e) => reject(e));
          } else {
            handleGdrive(res, destPath, resolve, reject);
          }
          return;
        }
        handleGdrive(res, destPath, resolve, reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  function handleGdrive(res, destPath, resolve, reject) {
    if (res.statusCode === 429 || res.statusCode >= 500) {
      res.resume();
      return reject(new Error('HTTP ' + res.statusCode));
    }
    if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
    if ((res.headers['content-type'] || '').includes('text/html')) {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        const cm = body.match(/confirm=([0-9A-Za-z_-]+)/);
        if (!cm) return reject(new Error('No confirm'));
        const idMatch = body.match(/id=([0-9A-Za-z_-]+)/);
        let nu = GDRIVE_DOWNLOAD_URL + '&id=' + (idMatch ? idMatch[1] : '') + '&confirm=' + cm[1];
        const um = body.match(/uuid=([0-9A-Za-z_-]+)/);
        if (um) nu += '&uuid=' + um[1];
        https.get(nu, { headers: { 'User-Agent': 'Mozilla/5.0' }, agent: dlAgent, timeout: 15000 }, (r2) => {
          handleGdrive(r2, destPath, resolve, reject);
        }).on('error', reject);
      });
      return;
    }
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = fs.createWriteStream(destPath);
    res.pipe(file);
    file.on('finish', () => { file.close(() => resolve()); });
    file.on('error', (e) => { try { fs.unlinkSync(destPath); } catch(ex) {} reject(e); });
  }

  sendDownloadProgress({ status: 'downloading', message: 'Downloading ' + toDownload + ' files (skipped ' + skipped + ')...', current: skipped, total });

  async function worker() {
    while (true) {
      if (activeDownload && activeDownload.status === 'cancelled') break;
      const fileIdx = idx++;
      if (fileIdx >= toDownload) break;
      const file = filesToDownload[fileIdx];
      const filePath = path.join(spritesDir, file.path);
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          await gdriveDl(file.id, filePath);
          ok = true;
          downloaded++;
          reportProgress();
        } catch (e) {
          if (attempt < 2) await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
          else { downloaded++; failed++; reportProgress(); }
        }
      }
    }
  }

  const workers = [];
  for (let i = 0; i < WORKERS; i++) workers.push(worker());
  await Promise.all(workers);

  // Write marker with total file count
  try {
    const markerPath = path.join(path.dirname(spritesDir), '.download-marker');
    fs.writeFileSync(markerPath, JSON.stringify({ total, date: Date.now() }));
  } catch (e) {}

  sendDownloadProgress({ status: 'done', message: 'Download complete', current: skipped + downloaded, total, skipped });

  _cachedStyles = null;
  const refreshedStyles = scanSprites(SPRITES_ROOT);
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('styles-refreshed', refreshedStyles);
    }
  } catch (e) {}
  return { success: true, files: toDownload - failed, skipped, failed };
}

ipcMain.handle('has-recursos', () => {
  const spritesDir = path.join(userDataDir, 'Recursos', 'Sprites');
  return fs.existsSync(spritesDir) && fs.readdirSync(spritesDir).length > 0;
});

ipcMain.handle('check-recursos-status', async () => {
  const spritesDir = path.join(userDataDir, 'Recursos', 'Sprites');
  const markerPath = path.join(userDataDir, 'Recursos', '.download-marker');

  if (!fs.existsSync(spritesDir) || fs.readdirSync(spritesDir).length === 0) {
    return { total: 0, downloaded: 0, status: 'none' };
  }

  // Try to read cached total from marker file
  let expectedTotal = 0;
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expectedTotal = marker.total || 0;
  } catch (e) {}

  if (expectedTotal === 0) {
    // Fetch manifest to get total
    try {
      let manifest = null;
      try {
        const data = await dlBuffer(SPRITES_ZIP_MANIFEST_URL);
        manifest = JSON.parse(data.toString());
        if (manifest && manifest.zips) {
          // For zip mode, count files in legacy manifest
          const mData = await dlBuffer(GDRIVE_LEGACY_MANIFEST);
          const legacyManifest = JSON.parse(mData.toString());
          expectedTotal = (legacyManifest.files || []).length;
        }
      } catch (e) {}

      if (expectedTotal === 0) {
        try {
          const mData = await dlBuffer(GDRIVE_LEGACY_MANIFEST);
          const legacyManifest = JSON.parse(mData.toString());
          expectedTotal = (legacyManifest.files || []).length;
        } catch (e) {}
      }

      // Write marker
      if (expectedTotal > 0) {
        try { fs.writeFileSync(markerPath, JSON.stringify({ total: expectedTotal, date: Date.now() })); } catch (e) {}
      }
    } catch (e) {}
  }

  // Count existing files by scanning a sample of directories
  let downloaded = 0;
  try {
    const regions = fs.readdirSync(spritesDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const region of regions) {
      const regionPath = path.join(spritesDir, region.name);
      const countFiles = (dir) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.png', '.gif', '.jpg', '.jpeg', '.webp'].includes(ext)) downloaded++;
          } else if (entry.isDirectory()) {
            countFiles(path.join(dir, entry.name));
          }
        }
      };
      countFiles(regionPath);
    }
  } catch (e) {}

  let status = 'done';
  if (expectedTotal > 0 && downloaded < expectedTotal) status = 'partial';
  if (downloaded === 0) status = 'none';

  return { total: expectedTotal, downloaded, status };
});

ipcMain.handle('open-recursos-folder', async () => {
  const recursosDir = path.join(userDataDir, 'Recursos');
  if (!fs.existsSync(recursosDir)) fs.mkdirSync(recursosDir, { recursive: true });
  const { shell } = require('electron');
  await shell.openPath(recursosDir);
  return true;
});

// === LOG EXPORT ===

ipcMain.handle('get-log-info', () => {
  return Logger.getExportData();
});

ipcMain.handle('read-log-file', (event, filename) => {
  return Logger.readLogContent(filename);
});

ipcMain.handle('get-recent-errors', (event, lines) => {
  return Logger.readRecentJsonl(lines || 200);
});

ipcMain.handle('export-diagnostic-zip', async () => {
  const data = Logger.getExportData();
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar diagnosticos',
    defaultPath: `nuzlocke-diagnostics-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  });
  if (!filePath) return null;

  try {
    const { ZipArchive } = require('archiver');
    const output = fs.createWriteStream(filePath);
    const archive = new ZipArchive('zip', { zlib: { level: 6 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => resolve({ path: filePath, size: archive.pointer() }));
      archive.on('error', reject);
      archive.pipe(output);

      if (data.sessionMeta) {
        archive.append(JSON.stringify(data.sessionMeta, null, 2), { name: 'session-info.json' });
      }

      for (const file of data.files) {
        if (fs.existsSync(file.path)) {
          archive.file(file.path, { name: `logs/${file.name}` });
        }
      }

      const projects = projectManager.listAll();
      archive.append(JSON.stringify(projects, null, 2), { name: 'projects.json' });

      archive.append(JSON.stringify(loadConfig(), null, 2), { name: 'config.json' });
      archive.append(JSON.stringify(loadSettings(), null, 2), { name: 'settings.json' });

      archive.finalize();
    });
  } catch (e) {
    Logger.error('Export', `Failed to create diagnostic zip: ${e.message}`);
    return null;
  }
});

// === APP LIFECYCLE ===

function migrateFromBaseDir() {
  const oldProjectsDir = path.join(BASE_DIR, 'projects');
  const oldPresetsDir = path.join(BASE_DIR, 'presets');
  const newProjectsDir = path.join(userDataDir, 'projects');
  const newPresetsDir = path.join(userDataDir, 'presets');

  for (const [oldDir, newDir] of [[oldProjectsDir, newProjectsDir], [oldPresetsDir, newPresetsDir]]) {
    if (!fs.existsSync(oldDir)) continue;
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
    const files = fs.readdirSync(oldDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const dest = path.join(newDir, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(oldDir, file), dest);
      }
    }
  }
}

function cleanupBeforeQuit() {
  for (const [, clients] of sseClients) {
    for (const res of clients) {
      try { res.end(); } catch (e) {}
    }
  }
  sseClients.clear();
  if (overlayServer) {
    try { overlayServer.close(); } catch (e) {}
  }
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  const projects = projectManager.listAll();
  for (const p of projects) {
    fileWatcher.stopWatching(p.id);
  }
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Initialize logging session
    const pkg = require('./package.json');
    const settings = loadSettings();
    Logger.initSession(pkg.version, settings.logEndpoint || null);

    // Log environment details for debugging
    Logger.info('Main', `process.resourcesPath=${process.resourcesPath || 'undefined'}`);
    Logger.info('Main', `__dirname=${__dirname}`);
    Logger.info('Main', `PORTABLE_EXECUTABLE_DIR=${process.env.PORTABLE_EXECUTABLE_DIR || 'undefined'}`);
    Logger.info('Main', `LOCALAPPDATA=${process.env.LOCALAPPDATA || 'undefined'}`);

    // Check PKHeX DLLs exist
    const pkhexDll = path.join(process.resourcesPath || '', 'PkHexReader.dll');
    const pkhexCore = path.join(process.resourcesPath || '', 'PKHeX.Core.dll');
    const pkhexDllExists = fs.existsSync(pkhexDll);
    const pkhexCoreExists = fs.existsSync(pkhexCore);
    Logger.info('Main', `PKHeX DLL in resources: ${pkhexDllExists} (${pkhexDll})`);
    Logger.info('Main', `PKHeX.Core in resources: ${pkhexCoreExists} (${pkhexCore})`);

    // Check for .NET 8.0 Runtime required for PKHeX
    dotnetPath = checkDotnetRuntime();
    dotnetAvailable = !!dotnetPath;
    if (!dotnetAvailable) {
      Logger.error('Main', '.NET 8.0 Runtime not found - PKHeX will not work');
      setTimeout(() => showDotnetMissingDialog(), 1000);
    } else {
      Logger.info('Main', `.NET 8.0 Runtime found at: ${dotnetPath}`);
      // Pre-validate: try to copy DLLs now so parsing works when user opens a save
      try {
        const PkHexReader = require('./src/pkhex-reader');
        Logger.info('Main', 'PkHexReader module loaded OK');
      } catch (e) {
        Logger.error('Main', `PkHexReader module failed to load: ${e.message}`);
        if (!pkhexDllExists) {
          Logger.error('Main', 'CRITICAL: PkHexReader.dll NOT FOUND in resources directory!');
          Logger.error('Main', `Expected at: ${pkhexDll}`);
          Logger.error('Main', `process.resourcesPath = ${process.resourcesPath}`);
          setTimeout(() => {
            dialog.showMessageBox(mainWindow || null, {
              type: 'error',
              title: 'PKHeX no disponible',
              message: 'Los archivos de PKHeX no se encontraron.\n\n' +
                'Esto puede pasar si:\n' +
                '1. La instalacion se corrompio\n' +
                '2. Los archivos fueron eliminados\n\n' +
                `Ruta busqueda: ${process.resourcesPath}\n\n` +
                'Intenta reinstalar la app desde GitHub Releases.',
              buttons: ['OK']
            });
          }, 1500);
        }
      }
    }

    migrateFromBaseDir();
    startOverlayServer();
    createWindow();

    const projects = projectManager.listAll();
    for (const p of projects) {
      if (p.savePath) startWatching(p);
    }
  });

  app.on('window-all-closed', () => {
    if (forceQuit) {
      app.quit();
    } else if (!loadSettings().backgroundMode) {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  app.on('before-quit', (e) => {
    if (forceQuit) return;
    if (activeDownload && activeDownload.status === 'downloading') {
      e.preventDefault();
      return;
    }
    cleanupBeforeQuit();
  });
}
