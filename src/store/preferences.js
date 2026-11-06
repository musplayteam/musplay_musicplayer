export const DEFAULT_PREFERENCES = Object.freeze({
  autoResumeLastTrack: false,
  autoPlayNext: true,
  shortcutPlayPause: 'Space',
  shortcutNext: 'Alt+ArrowRight',
  shortcutPrevious: 'Alt+ArrowLeft',
  rememberPosition: true,
  smoothTransitions: false,
  transitionDuration: 1200,
  accentColor: 'purple',
  uiScale: 100,
  compactLists: false,
  showRightPanel: true,
  showUnavailableTracks: true,
  animationsEnabled: true,
  reduceMotion: false,
  autoScanAtStartup: true,
  rescanInterval: 'never',
  excludedFolders: [],
  autoSearchLyrics: false,
  autoOpenLyrics: false,
  cacheLyricsOffline: true,
  lyricsTextSize: 'normal',
  lyricsScrollSpeed: 'normal',
  startupWithWindows: false,
  trackNotifications: false,
});

export function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('musplay-preferences') || '{}');
    return { ...DEFAULT_PREFERENCES, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function writePreferences(preferences) {
  const safe = { ...DEFAULT_PREFERENCES, ...(preferences || {}) };
  localStorage.setItem('musplay-preferences', JSON.stringify(safe));
  return safe;
}
