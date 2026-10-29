const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),
  isMaximized: () => ipcRenderer.invoke('isMaximized'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  checkMusixmatchAvailability: () => ipcRenderer.invoke('lyrics:musixmatch:check'),
  getMusixmatchLyrics: (track) => ipcRenderer.invoke('lyrics:musixmatch', track),
  getSavedLyrics: (track) => ipcRenderer.invoke('lyrics:saved:get', track),
  searchSavedLyrics: (query) => ipcRenderer.invoke('lyrics:saved:search', query),
  saveSyncedLyrics: (payload) => ipcRenderer.invoke('lyrics:saved:save', payload),
  getLyricsFolder: () => ipcRenderer.invoke('lyrics:saved:folder'),
});
