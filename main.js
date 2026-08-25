const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');

app.commandLine.appendSwitch('js-flags', '--no-code-cache');
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');

const Logger = require('./src/logger');
const { scanSprites, resolveSprite, getPreviewSprite } = require('./src/sprite-scanner');
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
  if (app.isPackaged) {
    return app.getPath('userData');
  }
  return __dirname;
}

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
  expressApp.use('/css', express.static(path.join(APP_DIR, 'public', 'css')));
  expressApp.use('/js', express.static(path.join(APP_DIR, 'public', 'js')));
  expressApp.use('/sprites', express.static(SPRITES_ROOT));

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
      { name: 'Save Files', extensions: ['sav', 'dsv', 'sa1', 'sa2', 'sa3', 'ss1', 'ss2', 'ss3', 'ss4', 'ss5', 'main', 'bin'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const selected = result.filePaths[0];
  // If directory selected, open a second dialog inside it
  if (fs.existsSync(selected) && fs.statSync(selected).isDirectory()) {
    const fileResult = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar archivo save dentro de la carpeta',
      defaultPath: selected,
      filters: [
        { name: 'Save Files', extensions: ['sav', 'dsv', 'sa1', 'sa2', 'sa3', 'ss1', 'ss2', 'ss3', 'ss4', 'ss5', 'main', 'bin'] },
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
ipcMain.handle('save-settings', (event, settings) => {
  saveSettingsToFile(settings);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-changed', settings);
    updateTrayMenu();
  }
  return settings;
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
    const skipPattern = /\b(bold|italic|cursiva|negrita|light|black|demi|narrow|condensed|regular|semibold|extrabold|ultrabold|thin|medium|heavy|ultralight|semilight|oblique|roman)\b/i;
    const skipExact = /^(modern|roman|script|symbol|sans serif collection)$/i;
    const fonts = out.split(/\r?\n/)
      .map(s => s.trim().replace(/^"|"$/g, ''))
      .filter(f => f && f.length > 1 && !skipPattern.test(f) && !skipExact.test(f))
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

ipcMain.handle('check-for-updates', async () => {
  try {
    const release = await fetchJSON(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    const latestVersion = (release.tag_name || '').replace(/^v/, '');
    const currentVersion = app.getVersion();
    const settings = loadSettings();
    const skippedVersion = settings.skippedVersion || '';
    const lastSeenVersion = settings.lastSeenVersion || '';
    const hasUpdate = latestVersion && latestVersion !== currentVersion;
    const hasChangelog = latestVersion && latestVersion !== lastSeenVersion;
    console.log('[UPDATE] check:', { currentVersion, latestVersion, lastSeenVersion, hasUpdate, hasChangelog });
    return {
      hasUpdate: !!hasUpdate,
      currentVersion,
      latestVersion,
      releaseNotes: release.body || '',
      releaseUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
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
const dlAgent = new https.Agent({ keepAlive: true, maxSockets: 60, maxFreeSockets: 20, timeout: 30000 });

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

async function doZipDownload(webContents, spritesDir, zipManifest) {
  const zips = zipManifest.zips;
  const totalZips = zips.length;
  let done = 0, totalBytes = 0, dlBytes = 0;
  for (const z of zips) totalBytes += z.size || 0;

  sendDownloadProgress({ status: 'downloading', message: totalZips + ' sprite packs to download...', current: 0, total: totalZips, bytesTotal: totalBytes, bytesDownloaded: 0, isZipMode: true });

  const tmpDir = path.join(path.dirname(spritesDir), '_zip_temp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  for (const zip of zips) {
    const zipPath = path.join(tmpDir, zip.name);
    sendDownloadProgress({ status: 'downloading', message: zip.name + ' (' + fmtBytes(zip.size) + ')', current: done, total: totalZips, bytesTotal: totalBytes, bytesDownloaded: dlBytes, currentZip: zip.name, isZipMode: true });
    try {
      if (!fs.existsSync(zipPath)) await dlRetry(zip.url || (SPRITES_ZIP_BASE_URL + zip.name), zipPath);
      dlBytes += zip.size || 0;
      sendDownloadProgress({ status: 'extracting', message: 'Extracting ' + zip.name + '...', current: done, total: totalZips, bytesTotal: totalBytes, bytesDownloaded: dlBytes, currentZip: zip.name, isZipMode: true });
      await extractZip(zipPath, { dir: spritesDir });
    } catch (e) { console.error('[DOWNLOAD] ZIP failed:', zip.name, e.message); }
    done++;
  }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(ex) {}
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
  const MAX_CONCURRENT = 50;
  let activeCount = 0;
  const waitQueue = [];

  function acquireSlot() {
    return new Promise((resolve) => {
      if (activeCount < MAX_CONCURRENT) {
        activeCount++;
        resolve();
      } else {
        waitQueue.push(resolve);
      }
    });
  }

  function releaseSlot() {
    activeCount--;
    if (waitQueue.length > 0 && activeCount < MAX_CONCURRENT) {
      activeCount++;
      waitQueue.shift()();
    }
  }

  function gdriveDl(fileId, destPath) {
    return new Promise((resolve, reject) => {
      const url = GDRIVE_DOWNLOAD_URL + '&id=' + fileId + '&confirm=t';
      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, agent: dlAgent }, (res) => {
        if (res.statusCode >= 301 && res.statusCode <= 308) {
          const loc = res.headers.location;
          if (loc && !loc.includes('virus')) {
            https.get(loc, { headers: { 'User-Agent': 'Mozilla/5.0' }, agent: dlAgent }, (r2) => {
              handleGdrive(r2, fileId, destPath, resolve, reject);
            }).on('error', (e) => retryGdrive(fileId, destPath, 0, e, resolve, reject));
          } else { handleGdrive(res, fileId, destPath, resolve, reject); }
          return;
        }
        handleGdrive(res, fileId, destPath, resolve, reject);
      }).on('error', (e) => retryGdrive(fileId, destPath, 0, e, resolve, reject));
    });
  }

  function handleGdrive(res, fileId, destPath, resolve, reject) {
    if (res.statusCode === 429 || res.statusCode >= 500) {
      res.resume();
      const err = new Error('HTTP ' + res.statusCode);
      err.isRateLimit = res.statusCode === 429;
      return reject(err);
    }
    if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
    if ((res.headers['content-type'] || '').includes('text/html')) {
      let body = ''; res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        const cm = body.match(/confirm=([0-9A-Za-z_-]+)/);
        const um = body.match(/uuid=([0-9A-Za-z_-]+)/);
        const da = body.match(/action="([^"]+)"/);
        if (cm || da) {
          let nu = da ? da[1] : GDRIVE_DOWNLOAD_URL;
          nu += '&id=' + fileId + '&confirm=' + (cm ? cm[1] : 't');
          if (um) nu += '&uuid=' + um[1];
          https.get(nu, { headers: { 'User-Agent': 'Mozilla/5.0' }, agent: dlAgent }, (r2) => {
            handleGdrive(r2, fileId, destPath, resolve, reject);
          }).on('error', (e) => retryGdrive(fileId, destPath, 0, e, resolve, reject));
        } else { retryGdrive(fileId, destPath, 0, new Error('No download link'), resolve, reject); }
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

  function retryGdrive(fileId, destPath, retries, err, resolve, reject) {
    if (retries < 3) {
      const delay = err && err.isRateLimit ? 2000 : 500 * (retries + 1);
      setTimeout(() => { gdriveDl(fileId, destPath).then(resolve).catch(reject); }, delay);
    } else { reject(err); }
  }

  sendDownloadProgress({ status: 'listing', message: 'Fetching file manifest...' });
  const mData = await dlBuffer(GDRIVE_LEGACY_MANIFEST);
  const manifest = JSON.parse(mData.toString());
  const allFiles = manifest.files || [];

  const GENERATION_ORDER = ['Gen1','Gen2','Gen3','Gen4','Gen5','Gen6','Gen7','Gen8','Gen9','LEGENDS ARCEUS'];
  const filesByGen = {};
  for (const gen of GENERATION_ORDER) filesByGen[gen] = [];
  for (const file of allFiles) {
    const gen = file.path.split('/')[0];
    if (filesByGen[gen]) filesByGen[gen].push(file);
  }

  const total = allFiles.length;
  const genStates = {};
  let totalDownloaded = 0;
  let totalSkipped = 0;
  let lastReport = 0;

  for (const gen of GENERATION_ORDER) {
    genStates[gen] = {
      current: 0, total: filesByGen[gen].length,
      done: filesByGen[gen].length === 0,
      rateLimited: 0, failed: 0, skipped: 0
    };
  }

  function reportProgress() {
    const now = Date.now();
    if (now - lastReport < 500) return;
    lastReport = now;
    const genProgress = {};
    for (const gen of GENERATION_ORDER) {
      const s = genStates[gen];
      genProgress[gen] = { current: s.current, total: s.total, done: s.done };
    }
    sendDownloadProgress({
      status: 'downloading',
      message: totalDownloaded + '/' + total + ' files',
      current: totalDownloaded,
      total,
      generations: genProgress
    });
  }

  async function genWorker(gen) {
    const files = filesByGen[gen];
    const state = genStates[gen];
    let idx = 0;

    while (idx < files.length) {
      if (state.rateLimited > 0) {
        await new Promise(r => setTimeout(r, 500));
        state.rateLimited--;
        continue;
      }
      const file = files[idx++];
      const filePath = path.join(spritesDir, file.path);
      if (fs.existsSync(filePath)) {
        state.current++;
        state.skipped++;
        totalDownloaded++;
        totalSkipped++;
        reportProgress();
        continue;
      }
      await acquireSlot();
      try {
        await gdriveDl(file.id, filePath);
        state.current++;
        totalDownloaded++;
        reportProgress();
      } catch (e) {
        state.current++;
        totalDownloaded++;
        if (e.isRateLimit) {
          state.rateLimited = 2;
        } else {
          state.failed++;
        }
        reportProgress();
      } finally {
        releaseSlot();
      }
    }
    state.done = true;
    reportProgress();
  }

  sendDownloadProgress({
    status: 'downloading',
    message: 'Downloading ' + total + ' files (max ' + MAX_CONCURRENT + ' at a time)...',
    current: 0, total
  });

  const allWorkers = [];
  for (const gen of GENERATION_ORDER) {
    if (filesByGen[gen].length > 0) {
      allWorkers.push(genWorker(gen));
    }
  }
  await Promise.all(allWorkers);

  const successCount = totalDownloaded - totalSkipped;
  sendDownloadProgress({
    status: 'done',
    message: 'Download complete',
    current: totalDownloaded,
    total,
    skipped: totalSkipped
  });

  _cachedStyles = null;
  sendDownloadProgress({ status: 'refreshing' });
  const refreshedStyles = scanSprites(SPRITES_ROOT);
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('styles-refreshed', refreshedStyles);
    }
  } catch (e) {}
  return { success: true, files: successCount, skipped: totalSkipped };
}

ipcMain.handle('has-recursos', () => {
  const spritesDir = path.join(userDataDir, 'Recursos', 'Sprites');
  return fs.existsSync(spritesDir) && fs.readdirSync(spritesDir).length > 0;
});

ipcMain.handle('open-recursos-folder', async () => {
  const recursosDir = path.join(userDataDir, 'Recursos');
  if (!fs.existsSync(recursosDir)) fs.mkdirSync(recursosDir, { recursive: true });
  const { shell } = require('electron');
  await shell.openPath(recursosDir);
  return true;
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

  app.on('before-quit', (e) => {
    if (activeDownload && activeDownload.status === 'downloading') {
      e.preventDefault();
      return;
    }
    const projects = projectManager.listAll();
    for (const p of projects) {
      fileWatcher.stopWatching(p.id);
    }
  });
}
