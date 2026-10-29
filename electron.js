const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

// Keep only one MusPlay process per Windows user. Chromium cache and IndexedDB
// are shared by the app's profile; parallel instances can lock the same files.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const existingWindow = BrowserWindow.getAllWindows()[0];
    if (!existingWindow) return;
    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.show();
    existingWindow.focus();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#100b1b',
    title: 'MusPlay',
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  Menu.setApplicationMenu(null);

  // External web links must open in the user's default browser, never in a
  // second Electron window or by navigating away from the MusPlay interface.
  const isHttpUrl = (value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };
  const openExternalUrl = (value) => {
    if (isHttpUrl(value)) shell.openExternal(value).catch((error) => {
      console.error('MusPlay: could not open external link:', error);
    });
  };

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
    const isInternal = isDev
      ? navigationUrl.startsWith('http://localhost:5173/') || navigationUrl.startsWith('http://127.0.0.1:5173/')
      : navigationUrl.startsWith('file://');
    if (!isInternal && isHttpUrl(navigationUrl)) {
      event.preventDefault();
      openExternalUrl(navigationUrl);
    }
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
  if (isDev) {
    win.loadURL('http://localhost:5173');
    if (process.env.MUSPLAY_OPEN_DEVTOOLS === '1') win.webContents.openDevTools();
  } else {
    // Packaged builds load Vite's compiled files locally; no Vite server is required.
    win.loadFile(path.join(__dirname, 'dist', 'index.html')).catch((error) => {
      console.error('MusPlay: failed to load packaged UI:', error);
    });
  }

  win.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    console.error('MusPlay: page load failed:', { code, description, validatedURL });
  });
}

// Musixmatch's anonymous desktop-client lyric flow. This is an unofficial,
// undocumented endpoint: it can change or rate-limit at any time. The app only
// requests synced lyrics for the local track the user is currently playing.
const MUSIXMATCH_BASE = 'https://apic-desktop.musixmatch.com/ws/1.1/';
const MUSIXMATCH_APP_ID = 'web-desktop-app-v1.0';
const MUSIXMATCH_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
let musixmatchTokenCache = null;
let musixmatchTokenPromise = null;

function deepFind(value, key, depth = 0) {
  if (depth > 12 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = deepFind(entry, key, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  for (const [name, entry] of Object.entries(value)) {
    // Musixmatch macro responses often use endpoint names as object keys,
    // e.g. "matcher.track.get" and "track.subtitle.get".
    if (name === key) return entry;
    const found = deepFind(entry, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function normalizeMusicText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\(feat\.?[^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokenSimilarity(a, b) {
  const left = normalizeMusicText(a);
  const right = normalizeMusicText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.88;
  const aTokens = new Set(left.split(/\s+/));
  const bTokens = new Set(right.split(/\s+/));
  const common = [...aTokens].filter(token => bTokens.has(token)).length;
  return common ? Math.max(common / Math.min(aTokens.size, bTokens.size) * 0.78, common / new Set([...aTokens, ...bTokens]).size) : 0;
}

function findMusixmatchTokenInResponse(json) {
  const token = deepFind(json, 'user_token');
  return typeof token === 'string' && token && !token.startsWith('UpgradeOnly') ? token : null;
}

async function readCachedMusixmatchToken() {
  if (musixmatchTokenCache && Date.now() - musixmatchTokenCache.savedAt < MUSIXMATCH_TOKEN_TTL_MS) {
    return musixmatchTokenCache.token;
  }
  try {
    const tokenPath = path.join(app.getPath('userData'), 'musixmatch-token.json');
    const parsed = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
    if (parsed?.token && Number.isFinite(parsed.savedAt) && Date.now() - parsed.savedAt < MUSIXMATCH_TOKEN_TTL_MS) {
      musixmatchTokenCache = { token: parsed.token, savedAt: parsed.savedAt };
      return parsed.token;
    }
  } catch { /* no usable cached token; request a new anonymous token */ }
  return null;
}

async function musixmatchRequest(endpoint, params = {}) {
  const url = new URL(endpoint, MUSIXMATCH_BASE);
  url.searchParams.set('app_id', MUSIXMATCH_APP_ID);
  url.searchParams.set('format', 'json');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Cookie: 'x-mxm-token-guid=',
      },
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (!text.trim() || text.trimStart().startsWith('<')) return null;
    try { return JSON.parse(text); } catch { return null; }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function containsStatusCode(value, target, depth = 0) {
  if (depth > 12 || value == null) return false;
  if (Array.isArray(value)) return value.some(entry => containsStatusCode(entry, target, depth + 1));
  if (typeof value !== 'object') return false;
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'status_code' && Number(entry) === target) return true;
    if (containsStatusCode(entry, target, depth + 1)) return true;
  }
  return false;
}

async function getMusixmatchToken(force = false) {
  if (musixmatchTokenPromise) return musixmatchTokenPromise;
  musixmatchTokenPromise = (async () => {
    if (force) {
      // An expired/quota-exhausted token must not be reused from disk.
      musixmatchTokenCache = null;
      try { await fs.unlink(path.join(app.getPath('userData'), 'musixmatch-token.json')); } catch { /* ignore missing cache */ }
    } else {
      const cached = await readCachedMusixmatchToken();
      if (cached) return cached;
    }
    const response = await musixmatchRequest('token.get', { t: Date.now() });
    const token = findMusixmatchTokenInResponse(response);
    if (!token) return null;
    const savedAt = Date.now();
    musixmatchTokenCache = { token, savedAt };
    try {
      const tokenPath = path.join(app.getPath('userData'), 'musixmatch-token.json');
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify({ token, savedAt }), 'utf8');
    } catch { /* cache only in memory if storage is unavailable */ }
    return token;
  })();
  try { return await musixmatchTokenPromise; }
  finally { musixmatchTokenPromise = null; }
}

function isMusixmatchTrackMatch(requested, candidate) {
  const titleScore = tokenSimilarity(requested.title, candidate.track_name);
  const artistScore = tokenSimilarity(requested.artist, candidate.artist_name);
  const requestedDuration = Number(requested.duration) || 0;
  const candidateDuration = Number(candidate.track_length) || 0;
  const durationDelta = requestedDuration && candidateDuration ? Math.abs(requestedDuration - candidateDuration) : null;
  if (durationDelta !== null && durationDelta > 18) return false;
  return (titleScore >= 0.68 && artistScore >= 0.45) || (durationDelta !== null && durationDelta <= 4 && (titleScore >= 0.68 || artistScore >= 0.65));
}

async function getMusixmatchLyrics(input = {}) {
  const requested = {
    title: String(input.title || '').trim().slice(0, 300),
    artist: String(input.artist || '').trim().slice(0, 300),
    album: String(input.album || '').trim().slice(0, 300),
    duration: Math.max(0, Number(input.duration) || 0),
  };
  if (!requested.title || !requested.artist || /unknown artist|неизвестн/i.test(requested.artist)) return null;

  let token = await getMusixmatchToken();
  if (!token) return null;
  const buildParams = currentToken => ({
    namespace: 'lyrics_richsynched',
    subtitle_format: 'lrc',
    q_track: requested.title,
    q_artist: requested.artist,
    q_album: requested.album,
    q_duration: requested.duration ? Math.round(requested.duration) : '',
    usertoken: currentToken,
  });

  let macro = await musixmatchRequest('macro.subtitles.get', buildParams(token));
  if (containsStatusCode(macro, 401)) {
    token = await getMusixmatchToken(true);
    if (!token) return null;
    macro = await musixmatchRequest('macro.subtitles.get', buildParams(token));
  }
  if (!macro) return null;

  const matcher = deepFind(macro, 'matcher.track.get');
  const track = deepFind(matcher, 'track');
  if (!track || !isMusixmatchTrackMatch(requested, track) || Number(track.instrumental) === 1) return null;

  let lrc = '';
  let kind = 'line';
  if (Number(track.has_richsync) === 1 && Number(track.commontrack_id) > 0) {
    const richsync = await musixmatchRequest('track.richsync.get', {
      commontrack_id: Number(track.commontrack_id),
      usertoken: token,
    });
    const richsyncBody = deepFind(richsync, 'richsync_body');
    if (typeof richsyncBody === 'string' && richsyncBody) {
      try {
        const entries = JSON.parse(richsyncBody);
        const stamp = seconds => {
          const safe = Math.max(0, Number(seconds) || 0);
          const mins = Math.floor(safe / 60);
          const secs = Math.floor(safe % 60);
          const centis = Math.round((safe - Math.floor(safe)) * 100) % 100;
          return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
        };
        if (Array.isArray(entries)) {
          const converted = entries.map(entry => {
            const ts = Number(entry.ts);
            if (!Number.isFinite(ts)) return '';
            const words = (Array.isArray(entry.l) ? entry.l : [])
              .map(word => ({ time: ts + (Number(word.o) || 0), text: String(word.c || '').trim() }))
              .filter(word => word.text && Number.isFinite(word.time));
            if (words.length) return `[${stamp(ts)}]` + words.map(word => `<${stamp(word.time)}>${word.text}`).join(' ');
            const fallback = String(entry.x || '').trim();
            return fallback ? `[${stamp(ts)}]${fallback}` : '';
          }).filter(Boolean);
          if (converted.length) { lrc = converted.join('\n'); kind = 'word'; }
        }
      } catch { /* fallback to line-synced subtitle below */ }
    }
  }
  if (!lrc) {
    const subtitle = deepFind(macro, 'subtitle_body');
    if (typeof subtitle === 'string' && subtitle.includes('[')) lrc = subtitle.trim();
  }
  if (!lrc) return null;

  const trackUrl = String(track.track_share_url || track.trackShareUrl || '').trim();
  return {
    lrc,
    kind,
    trackName: String(track.track_name || ''),
    artistName: String(track.artist_name || ''),
    sourceUrl: /^https:\/\//i.test(trackUrl) ? trackUrl : 'https://www.musixmatch.com/',
  };
}

ipcMain.handle('lyrics:musixmatch:check', async () => {
  try { return Boolean(await getMusixmatchToken()); }
  catch { return false; }
});

ipcMain.handle('lyrics:musixmatch', async (_event, input) => getMusixmatchLyrics(input));


// Local synced-lyrics collection. Lyrics are stored as .lrc files under
// Documents/MusPlay/Синхронный текст and indexed for quick metadata lookup.
const LYRICS_FOLDER_NAME = 'Синхронный текст';
function lyricsDirectory() {
  return path.join(app.getPath('documents'), 'MusPlay', LYRICS_FOLDER_NAME);
}
function normalizeLyricsKey(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function safeLyricsFilename(value) {
  return String(value || 'Без названия').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 100) || 'Без названия';
}
async function readLyricsIndex() {
  const dir = lyricsDirectory();
  await fs.mkdir(dir, { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
async function writeLyricsIndex(entries) {
  const dir = lyricsDirectory();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify(entries, null, 2), 'utf8');
}
function lyricTrackKey(track) {
  return `${normalizeLyricsKey(track?.title)}::${normalizeLyricsKey(track?.artist)}`;
}
async function getSavedLyrics(track) {
  const key = lyricTrackKey(track);
  if (!normalizeLyricsKey(track?.title) || !normalizeLyricsKey(track?.artist)) return null;
  const entries = await readLyricsIndex();
  const entry = entries.find(item => item.key === key);
  if (!entry) return null;
  try {
    const raw = await fs.readFile(path.join(lyricsDirectory(), entry.fileName), 'utf8');
    return { ...entry, raw, path: path.join(lyricsDirectory(), entry.fileName), folder: lyricsDirectory() };
  } catch { return null; }
}
async function saveSyncedLyrics(payload = {}) {
  const title = String(payload.trackName || payload.title || '').trim().slice(0, 300);
  const artist = String(payload.artistName || payload.artist || '').trim().slice(0, 300);
  const raw = String(payload.syncedLyrics || payload.raw || '').trim();
  if (!title || !artist || !raw || !/\[\d{1,3}:\d{2}/.test(raw)) throw new Error('Нужны название, исполнитель и синхронизированный LRC-текст.');
  const dir = lyricsDirectory();
  await fs.mkdir(dir, { recursive: true });
  const key = lyricTrackKey({ title, artist });
  const fileName = `${safeLyricsFilename(artist)} - ${safeLyricsFilename(title)}.lrc`;
  const filePath = path.join(dir, fileName);
  const header = [
    `[ti:${title.replace(/[\r\n\]]/g, ' ')}]`,
    `[ar:${artist.replace(/[\r\n\]]/g, ' ')}]`,
    payload.albumName ? `[al:${String(payload.albumName).replace(/[\r\n\]]/g, ' ')}]` : '',
    payload.sourceUrl ? `# source: ${String(payload.sourceUrl).replace(/[\r\n]/g, '')}` : '',
    payload.sourceName ? `# provider: ${String(payload.sourceName).replace(/[\r\n]/g, '')}` : '',
    payload.copyright ? `# copyright: ${String(payload.copyright).replace(/[\r\n]/g, '')}` : '',
    '',
  ].filter((line, index) => line || index === 0).join('\n') + '\n';
  await fs.writeFile(filePath, `${header}${raw}\n`, 'utf8');
  const entries = await readLyricsIndex();
  const entry = {
    key, title, artist, albumName: String(payload.albumName || ''), fileName,
    sourceName: String(payload.sourceName || 'Не указан'), sourceUrl: String(payload.sourceUrl || ''),
    copyright: String(payload.copyright || ''), savedAt: new Date().toISOString(),
  };
  const updated = [entry, ...entries.filter(item => item.key !== key)];
  await writeLyricsIndex(updated);
  return { ...entry, path: filePath, folder: dir };
}
async function searchSavedLyrics(query = '') {
  const q = normalizeLyricsKey(query);
  const entries = await readLyricsIndex();
  return entries.filter(item => !q || normalizeLyricsKey(`${item.title} ${item.artist} ${item.albumName}`).includes(q))
    .map(item => ({ ...item, path: path.join(lyricsDirectory(), item.fileName) }));
}
ipcMain.handle('lyrics:saved:get', async (_event, track) => getSavedLyrics(track));
ipcMain.handle('lyrics:saved:search', async (_event, query) => searchSavedLyrics(query));
ipcMain.handle('lyrics:saved:save', async (_event, payload) => saveSyncedLyrics(payload));
ipcMain.handle('lyrics:saved:folder', async () => lyricsDirectory());

// Custom title-bar controls.
ipcMain.on('minimize', () => BrowserWindow.getFocusedWindow()?.minimize());
ipcMain.on('maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.on('close', () => BrowserWindow.getFocusedWindow()?.close());
ipcMain.handle('isMaximized', () => BrowserWindow.getFocusedWindow()?.isMaximized() || false);
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:openExternal', async (_event, url) => {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return false;
    await shell.openExternal(parsed.href);
    return true;
  } catch { return false; }
});
ipcMain.handle('app:checkUpdates', async () => {
  const currentVersion = app.getVersion();
  const releasesUrl = 'https://github.com/musplayteam/musplay_musicplayer/releases';
  try {
    const response = await fetch('https://api.github.com/repos/musplayteam/musplay_musicplayer/releases/latest', {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'MusPlay-Update-Checker' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { currentVersion, updateAvailable: false, releasesUrl, error: `GitHub API: ${response.status}` };
    const release = await response.json();
    const normalize = (value) => String(value || '').trim().replace(/^v/i, '').split(/[+-]/)[0].split('.').map(part => Number.parseInt(part, 10) || 0);
    const current = normalize(currentVersion);
    const latest = normalize(release.tag_name || release.name);
    let comparison = 0;
    for (let i = 0; i < Math.max(current.length, latest.length); i++) {
      if ((latest[i] || 0) > (current[i] || 0)) { comparison = 1; break; }
      if ((latest[i] || 0) < (current[i] || 0)) { comparison = -1; break; }
    }
    return { currentVersion, latestVersion: release.tag_name || release.name || '', updateAvailable: comparison > 0, releasesUrl: release.html_url || releasesUrl, releaseName: release.name || '', publishedAt: release.published_at || null };
  } catch (error) {
    return { currentVersion, updateAvailable: false, releasesUrl, error: error?.message || 'Network error' };
  }
});

if (hasSingleInstanceLock) {
  app.whenReady().then(createWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
