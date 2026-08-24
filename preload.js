const { ipcRenderer } = require('electron');

window.api = {
  getBaseDir: () => ipcRenderer.invoke('get-base-dir'),

  listProjects: () => ipcRenderer.invoke('list-projects'),
  getProject: (id) => ipcRenderer.invoke('get-project', id),
  createProject: (data) => ipcRenderer.invoke('create-project', data),
  updateProject: (id, data) => ipcRenderer.invoke('update-project', id, data),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),

  getTeam: (projectId) => ipcRenderer.invoke('get-team', projectId),
  getOverlayUrl: (projectId) => ipcRenderer.invoke('get-overlay-url', projectId),
  getPort: () => ipcRenderer.invoke('get-port'),

  getStyles: () => ipcRenderer.invoke('get-styles'),
  refreshStyles: () => ipcRenderer.invoke('refresh-styles'),
  resolveSprite: (stylePath, speciesId, options) => ipcRenderer.invoke('resolve-sprite', stylePath, speciesId, options),

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

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  skipVersion: (version) => ipcRenderer.invoke('skip-version', version),
  checkChangelog: () => ipcRenderer.invoke('check-changelog'),
  dismissChangelog: (version) => ipcRenderer.invoke('dismiss-changelog', version),

  hasRecursos: () => ipcRenderer.invoke('has-recursos'),
  openRecursosFolder: () => ipcRenderer.invoke('open-recursos-folder'),
  downloadRecursos: () => ipcRenderer.invoke('download-recursos'),
  onDownloadProgress: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  onSettingsChanged: (callback) => {
    const handler = (e, settings) => callback(settings);
    ipcRenderer.on('settings-changed', handler);
    return () => ipcRenderer.removeListener('settings-changed', handler);
  },
  onTeamUpdated: (callback) => {
    const handler = (e, projectId, team, error) => callback(projectId, team, error);
    ipcRenderer.on('team-updated', handler);
    return () => ipcRenderer.removeListener('team-updated', handler);
  }
};
