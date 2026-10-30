const { contextBridge, ipcRenderer } = require('electron');

// The main process can deliver files immediately after did-finish-load, while
// React may not have mounted its listeners yet. Buffer those paths in preload.
let pendingAudioFiles = [];
const audioFileListeners = new Set();
ipcRenderer.on('audio:open-files', (_event, paths) => {
  const safePaths = Array.isArray(paths) ? paths.filter(value => typeof value === 'string') : [];
  if (!safePaths.length) return;
  if (audioFileListeners.size) {
    for (const callback of audioFileListeners) callback(safePaths);
  } else {
    pendingAudioFiles.push(...safePaths);
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),
  getMinimizeToTray: () => ipcRenderer.invoke('app:getMinimizeToTray'),
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('app:setMinimizeToTray', Boolean(enabled)),
  setTrayLanguage: (language) => ipcRenderer.invoke('app:setTrayLanguage', language),
  getMediaShortcutStatus: () => ipcRenderer.invoke('app:getMediaShortcutStatus'),
  resolveAudioPaths: (paths) => ipcRenderer.invoke('audio:resolve-paths', paths),
  sendMediaSessionAction: (action) => {
    const allowed = new Set(['play', 'pause', 'previous', 'next', 'stop']);
    if (allowed.has(action)) ipcRenderer.send('media:session-action', action);
  },
  onMediaAction: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('media:action', listener);
    return () => ipcRenderer.removeListener('media:action', listener);
  },
  onOpenAudioFiles: (callback) => {
    if (typeof callback !== 'function') return () => {};
    audioFileListeners.add(callback);
    if (pendingAudioFiles.length) {
      const queued = [...new Set(pendingAudioFiles)];
      pendingAudioFiles = [];
      queueMicrotask(() => { if (audioFileListeners.has(callback)) callback(queued); });
    }
    return () => audioFileListeners.delete(callback);
  },
  isMaximized: () => ipcRenderer.invoke('isMaximized'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  checkMusixmatchAvailability: () => ipcRenderer.invoke('lyrics:musixmatch:check'),
  getMusixmatchLyrics: (track) => ipcRenderer.invoke('lyrics:musixmatch', track),
  getSavedLyrics: (track) => ipcRenderer.invoke('lyrics:saved:get', track),
  importLocalLyrics: (track) => ipcRenderer.invoke('lyrics:saved:import-file', track),
  searchSavedLyrics: (query) => ipcRenderer.invoke('lyrics:saved:search', query),
  saveSyncedLyrics: (payload) => ipcRenderer.invoke('lyrics:saved:save', payload),
  getLyricsFolder: () => ipcRenderer.invoke('lyrics:saved:folder'),
});
