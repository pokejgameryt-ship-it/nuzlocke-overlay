const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');

app.commandLine.appendSwitch('js-flags', '--no-code-cache');
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');

const Logger = require('./src/logger');
const { scanSprites, resolveSprite } = require('./src/sprite-scanner');
const DetectSave = require('./src/detect-save');
const ProjectManager = require('./src/project-manager');
const PresetManager = require('./src/preset-manager');
const FileWatcher = require('./src/file-watcher');

function resolveBaseDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (fs.existsSync(path.join(exeDir, 'Recursos'))) return exeDir;
    const parent = path.dirname(exeDir);
    if (fs.existsSync(path.join(parent, 'Recursos'))) return parent;
    return exeDir;
  }
  return __dirname;
}

const BASE_DIR = resolveBaseDir();

const SPRITES_ROOT = path.join(BASE_DIR, 'Recursos', 'Sprites');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = { language: 'es', backgroundMode: true };

let mainWindow = null;
let settingsWindow = null;
let tray = null;
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
    { label: L.quit, click: () => { mainWindow.destroy(); app.quit(); } },
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

  const expressApp = express();
  expressApp.use('/css', express.static(path.join(BASE_DIR, 'public', 'css')));
  expressApp.use('/js', express.static(path.join(BASE_DIR, 'public', 'js')));
  expressApp.use('/sprites', express.static(SPRITES_ROOT));

  expressApp.get('/', (req, res) => {
    res.sendFile(path.join(BASE_DIR, 'public', 'overlay.html'));
  });

  expressApp.get('/overlay/:projectId', (req, res) => {
    res.sendFile(path.join(BASE_DIR, 'public', 'overlay.html'));
  });

  expressApp.get('/api/projects/:id', (req, res) => {
    const project = projectManager.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    res.json(project);
  });

  expressApp.get('/api/team/:projectId', (req, res) => {
    const team = fileWatcher.getCachedTeam(req.params.projectId);
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
    if (loadSettings().backgroundMode) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// === IPC HANDLERS ===

ipcMain.handle('get-base-dir', () => BASE_DIR);

// Projects
ipcMain.handle('list-projects', () => projectManager.listAll());
ipcMain.handle('get-project', (event, id) => projectManager.get(id));
ipcMain.handle('create-project', (event, data) => {
  const project = projectManager.create(data);
  if (project && project.savePath) startWatching(project);
  return project;
});
ipcMain.handle('update-project', (event, id, data) => {
  const updated = projectManager.update(id, data);
  if (updated) {
    fileWatcher.updatePlaceholderConfig(id, {
      usePlaceholder: updated.usePlaceholder || false
    });
    fileWatcher.stopWatching(id);
    if (updated.savePath) startWatching(updated);
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
  const team = fileWatcher.getCachedTeam(projectId);
  return team.map(p => p.spriteUrl ? { ...p, spriteUrl: `http://127.0.0.1:${overlayPort}${p.spriteUrl}` } : p);
});

// Overlay URL
ipcMain.handle('get-overlay-url', (event, projectId) => {
  return `http://127.0.0.1:${overlayPort}/overlay/${projectId}`;
});

// Styles
ipcMain.handle('get-styles', () => scanSprites(SPRITES_ROOT));
ipcMain.handle('refresh-styles', () => scanSprites(SPRITES_ROOT));
ipcMain.handle('resolve-sprite', (event, stylePath, speciesId, options) => {
  return resolveSprite(stylePath, speciesId, options);
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
    title: 'Seleccionar save file',
    filters: [
      { name: 'Save Files', extensions: ['sav', 'dsv', 'sa1', 'sa2', 'sa3', 'ss1', 'ss2', 'ss3', 'ss4', 'ss5', 'main', 'bin'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Detect game
ipcMain.handle('detect-game', (event, savePath) => {
  try {
    const buffer = fs.readFileSync(savePath);
    return DetectSave.detect(buffer);
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
ipcMain.handle('save-settings', (event, settings) => {
  saveSettingsToFile(settings);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-changed', settings);
    updateTrayMenu();
  }
  return settings;
});

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
    migrateFromBaseDir();
    startOverlayServer();
    createWindow();

    const projects = projectManager.listAll();
    for (const p of projects) {
      if (p.savePath) startWatching(p);
    }
  });

  app.on('window-all-closed', () => {
    if (loadSettings().backgroundMode) {
      // Keep running in tray
    } else {
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

  app.on('before-quit', () => {
    const projects = projectManager.listAll();
    for (const p of projects) {
      fileWatcher.stopWatching(p.id);
    }
  });
}
