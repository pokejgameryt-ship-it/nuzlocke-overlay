const { ipcRenderer } = require('electron');

window.api = {
  getBaseDir: () => ipcRenderer.invoke('get-base-dir'),
  getDotnetStatus: () => ipcRenderer.invoke('get-dotnet-status'),
  stopWatching: (projectId) => ipcRenderer.invoke('stop-watching', projectId),

  listProjects: () => ipcRenderer.invoke('list-projects'),
  getProject: (id) => ipcRenderer.invoke('get-project', id),
  createProject: (data) => ipcRenderer.invoke('create-project', data),
  updateProject: (id, data) => ipcRenderer.invoke('update-project', id, data),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),

  getTeam: (projectId) => ipcRenderer.invoke('get-team', projectId),
  setManualTeam: (projectId, manualTeam) => ipcRenderer.invoke('set-manual-team', projectId, manualTeam),
  getSpeciesList: () => ipcRenderer.invoke('get-species-list'),
  getOverlayUrl: (projectId) => ipcRenderer.invoke('get-overlay-url', projectId),
  getPort: () => ipcRenderer.invoke('get-port'),

  getStyles: () => ipcRenderer.invoke('get-styles'),
  refreshStyles: () => ipcRenderer.invoke('refresh-styles'),
  resolveSprite: (stylePath, speciesId, options) => ipcRenderer.invoke('resolve-sprite', stylePath, speciesId, options),
  getPreviewSprite: (stylePath) => ipcRenderer.invoke('get-preview-sprite', stylePath),

  getGames: () => ipcRenderer.invoke('get-games'),
  getPresets: () => ipcRenderer.invoke('list-presets'),
  savePreset: (data) => ipcRenderer.invoke('save-preset', data),
  deletePreset: (presetId) => ipcRenderer.invoke('delete-preset', presetId),

  browseSaveFile: () => ipcRenderer.invoke('browse-save-file'),
  detectGame: (savePath) => ipcRenderer.invoke('detect-game', savePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  getSystemFonts: () => ipcRenderer.invoke('get-system-fonts'),

  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openSettingsWindow: () => ipcRenderer.send('open-settings'),

  checkForUpdates: (includeBetas) => ipcRenderer.invoke('check-for-updates', includeBetas),
  skipVersion: (version) => ipcRenderer.invoke('skip-version', version),
  downloadUpdate: (releaseUrl) => ipcRenderer.invoke('download-update', releaseUrl),
  dismissChangelog: (version) => ipcRenderer.invoke('dismiss-changelog', version),

  hasRecursos: () => ipcRenderer.invoke('has-recursos'),
  checkRecursosStatus: () => ipcRenderer.invoke('check-recursos-status'),
  openRecursosFolder: () => ipcRenderer.invoke('open-recursos-folder'),
  downloadRecursos: () => ipcRenderer.invoke('download-recursos'),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  getDownloadStatus: () => ipcRenderer.invoke('get-download-status'),
  onDownloadProgress: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  getLogInfo: () => ipcRenderer.invoke('get-log-info'),
  readLogFile: (filename) => ipcRenderer.invoke('read-log-file', filename),
  getRecentErrors: (lines) => ipcRenderer.invoke('get-recent-errors', lines),
  exportDiagnosticZip: () => ipcRenderer.invoke('export-diagnostic-zip'),

  onSettingsChanged: (callback) => {
    const handler = (e, settings) => callback(settings);
    ipcRenderer.on('settings-changed', handler);
    return () => ipcRenderer.removeListener('settings-changed', handler);
  },
  onTeamUpdated: (callback) => {
    const handler = (e, projectId, team, error) => callback(projectId, team, error);
    ipcRenderer.on('team-updated', handler);
    return () => ipcRenderer.removeListener('team-updated', handler);
  },
  onStylesRefreshed: (callback) => {
    const handler = (e, newStyles) => callback(newStyles);
    ipcRenderer.on('styles-refreshed', handler);
    return () => ipcRenderer.removeListener('styles-refreshed', handler);
  },

  getFakemonList: () => ipcRenderer.invoke('get-fakemon-list'),
  getFakemonSprite: (fakemonId) => ipcRenderer.invoke('get-fakemon-sprite', fakemonId),
  importFakemon: () => ipcRenderer.invoke('import-fakemon'),
  deleteFakemon: (fakemonId) => ipcRenderer.invoke('delete-fakemon', fakemonId),
  editFakemon: (fakemonId, newName, newSpritePath) => ipcRenderer.invoke('edit-fakemon', fakemonId, newName, newSpritePath),
};
