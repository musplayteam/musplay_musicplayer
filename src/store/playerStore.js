import { create } from 'zustand';
import { readAudioMetadata, fallbackTitleFromFileName, DEFAULT_ARTIST, DEFAULT_ALBUM } from './audioMetadata';
import localforage from 'localforage';
import { DEFAULT_PREFERENCES, readPreferences, writePreferences } from './preferences';

localforage.config({ name: 'MusPlayDB', storeName: 'data' });

// Blob URLs are temporary and cannot survive restart. Remote HTTPS preview URLs can.
function serializeTrack(track, { keepFileData = false } = {}) {
  const { url, fileData, ...rest } = track || {};
  return {
    ...rest,
    ...(keepFileData && fileData ? { fileData } : {}),
    ...(typeof url === 'string' && /^https?:\/\//i.test(url) ? { url } : {}),
  };
}

function trackDuplicateKey(track) {
  const path = String(track?.sourcePath || '').replace(/\\/g, '/').toLocaleLowerCase();
  if (path) return `path:${path}`;
  const name = String(track?.fileName || '').trim().toLocaleLowerCase();
  const size = Number(track?.fileSize) || 0;
  const modified = Number(track?.lastModified) || 0;
  if (name && size) return `file:${name}|${size}|${modified}`;
  return '';
}

let activeOnlineSearchController = null;
let activeFreeMusicSearchController = null;
let initializationRunId = 0;

const usePlayerStore = create((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  queue: [],
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  isMuted: false,
  isShuffle: false,
  repeatMode: 'none',
  playlists: [],
  library: [],
  favorites: [],
  history: [],
  isInitialized: false,
  preferences: { ...DEFAULT_PREFERENCES },
  setPreference: (key, value) => set(state => {
    const preferences = writePreferences({ ...state.preferences, [key]: value });
    return { preferences };
  }),
  setPreferences: (values) => set(state => ({ preferences: writePreferences({ ...state.preferences, ...(values || {}) }) })),
  clearArtworkCache: async () => {
    const state = get();
    const clear = track => track ? { ...track, cover: track.customCover || null } : track;
    const library = state.library.map(clear);
    const queue = state.queue.map(clear);
    const favorites = state.favorites.map(clear);
    const history = state.history.map(clear);
    const playlists = state.playlists.map(playlist => ({ ...playlist, tracks: (playlist.tracks || []).map(clear) }));
    const currentTrack = clear(state.currentTrack);
    await Promise.all([
      localforage.setItem('library', library.map(track => serializeTrack(track, { keepFileData: true }))),
      localforage.setItem('queue', queue.map(track => serializeTrack(track, { keepFileData: true }))),
      localforage.setItem('favorites', favorites.map(track => serializeTrack(track))),
      localforage.setItem('history', history.map(track => serializeTrack(track))),
      localforage.setItem('playlists', playlists.map(playlist => ({ ...playlist, tracks: playlist.tracks.map(track => serializeTrack(track)) }))),
    ]);
    set({ library, queue, favorites, history, playlists, currentTrack });
  },

  playTrack: (track) => {
    if (!track) return;
    set((state) => {
      const history = [{ ...track, playedAt: Date.now() }, ...state.history.filter(item => item.id !== track.id)].slice(0, 100);
      const queue = state.queue.some(item => item.id === track.id)
        ? state.queue
        : [track, ...state.queue];
      localforage.setItem('history', history.map(item => serializeTrack(item)));
      localforage.setItem('queue', queue.map(item => serializeTrack(item, { keepFileData: true })));
      return { queue, currentTrack: track, isPlaying: true, currentTime: 0, history };
    });
  },

  playOnlinePreview: (track) => {
    if (!track?.url || !/^https?:\/\//i.test(track.url)) return;
    set((state) => {
      const queue = state.queue.some(item => item.id === track.id)
        ? state.queue
        : [...state.queue, track];
      const history = [{ ...track, playedAt: Date.now() }, ...state.history.filter(item => item.id !== track.id)].slice(0, 100);
      localforage.setItem('queue', queue.map(item => serializeTrack(item, { keepFileData: true })));
      localforage.setItem('history', history.map(item => serializeTrack(item)));
      return { queue, currentTrack: track, isPlaying: true, currentTime: 0, history };
    });
  },
  clearHistory: async () => {
    await localforage.setItem('history', []);
    set({ history: [] });
  },

  toggleFavorite: (track) => {
    if (!track) return;
    set((state) => {
      const exists = state.favorites.some(item => item.id === track.id);
      const favorites = exists ? state.favorites.filter(item => item.id !== track.id) : [...state.favorites, track];
      localforage.setItem('favorites', favorites.map(track => serializeTrack(track)));
      return { favorites };
    });
  },
  isFavorite: (trackId) => get().favorites.some(item => item.id === trackId),
  clearQueue: () => {
    localforage.setItem('queue', []);
    set({ queue: [], currentTrack: null, isPlaying: false, currentTime: 0, duration: 0 });
  },
  addToQueue: (track) => {
    if (!track?.url) return;
    set((state) => {
      if (state.queue.some(item => item.id === track.id)) return state;
      const queue = [...state.queue, track];
      localforage.setItem('queue', queue.map(item => serializeTrack(item, { keepFileData: true })));
      return { queue };
    });
  },
  moveInQueue: (trackId, direction) => {
    set((state) => {
      const index = state.queue.findIndex(item => item.id === trackId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= state.queue.length) return state;
      const queue = [...state.queue];
      [queue[index], queue[target]] = [queue[target], queue[index]];
      localforage.setItem('queue', queue.map(item => serializeTrack(item, { keepFileData: true })));
      return { queue };
    });
  },
  setQueueAndPlay: (tracks, startIndex = 0) => {
    const playable = tracks.filter(track => track.url);
    if (!playable.length) return;
    const index = Math.max(0, Math.min(startIndex, playable.length - 1));
    localforage.setItem('queue', playable.map(item => serializeTrack(item, { keepFileData: true })));
    set({ queue: playable, currentTrack: playable[index], isPlaying: true, currentTime: 0 });
  },
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  resumePlayback: () => { if (get().currentTrack) set({ isPlaying: true }); },
  pausePlayback: () => set({ isPlaying: false }),
  stopPlayback: () => set({ isPlaying: false, currentTime: 0 }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),

  nextTrack: () => {
    const { queue, currentTrack, isShuffle, repeatMode } = get();
    if (!queue.length) { set({ isPlaying: false }); return; }
    const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
    if (!isShuffle && repeatMode === 'none' && currentIndex >= queue.length - 1) {
      set({ isPlaying: false, currentTime: 0 });
      return;
    }
    let nextIndex = isShuffle
      ? (queue.length === 1 ? 0 : (() => { let n; do { n = Math.floor(Math.random() * queue.length); } while (n === currentIndex); return n; })())
      : (currentIndex + 1 + queue.length) % queue.length;
    set({ currentTrack: queue[nextIndex], isPlaying: true, currentTime: 0 });
  },

  prevTrack: () => {
    const { queue, currentTrack } = get();
    if (queue.length === 0) return;
    const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
    const prevIndex = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
    set({ currentTrack: queue[prevIndex], isPlaying: true, currentTime: 0 });
  },

  setQueue: (tracks) => {
    const queue = Array.isArray(tracks) ? tracks.filter(track => track?.url) : [];
    localforage.setItem('queue', queue.map(item => serializeTrack(item, { keepFileData: true })));
    set({ queue });
  },

  removeFromQueue: async (trackId) => {
    set((state) => {
      const currentIndex = state.queue.findIndex(track => track.id === state.currentTrack?.id);
      const updatedQueue = state.queue.filter(track => track.id !== trackId);
      const tracksToSave = updatedQueue.map(track => serializeTrack(track, { keepFileData: true }));
      localforage.setItem('queue', tracksToSave);
      let newCurrentTrack = state.currentTrack;
      const removedCurrentTrack = state.currentTrack?.id === trackId;
      if (removedCurrentTrack) {
        const nextIndex = Math.min(Math.max(0, currentIndex), updatedQueue.length - 1);
        newCurrentTrack = updatedQueue[nextIndex] || null;
      }
      return {
        queue: updatedQueue,
        currentTrack: newCurrentTrack,
        ...(removedCurrentTrack ? { isPlaying: Boolean(newCurrentTrack), currentTime: 0 } : {})
      };
    });
  },

  setVolume: (volume) => {
    localStorage.setItem('music-player-volume', volume.toString());
    set({ volume, isMuted: false });
  },

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),
  toggleRepeat: () => {
    const modes = ['none', 'all', 'one'];
    const currentIndex = modes.indexOf(get().repeatMode);
    set({ repeatMode: modes[(currentIndex + 1) % modes.length] });
  },

  createPlaylist: (name) => {
    const newPlaylist = { id: `pl-${Date.now()}`, name, tracks: [] };
    set((state) => {
      const updated = [...state.playlists, newPlaylist];
      localforage.setItem('playlists', updated.map(pl => ({ ...pl, tracks: pl.tracks.map(track => serializeTrack(track)) }))); 
      return { playlists: updated };
    });
  },

  addTrackToPlaylist: (playlistId, track) => {
    set((state) => {
      const updated = state.playlists.map(p => {
        if (p.id === playlistId) {
          if (p.tracks.some(t => t.id === track.id)) return p;
          const { fileData, ...trackData } = track;
          return { ...p, tracks: [...p.tracks, trackData] };
        }
        return p;
      });
      localforage.setItem('playlists', updated.map(pl => ({ ...pl, tracks: pl.tracks.map(track => serializeTrack(track)) })));
      return { playlists: updated };
    });
  },

  removeTrackFromPlaylist: (playlistId, trackId) => {
    set((state) => {
      const updated = state.playlists.map(p => {
        if (p.id === playlistId) {
          return { ...p, tracks: p.tracks.filter(t => t.id !== trackId) };
        }
        return p;
      });
      localforage.setItem('playlists', updated.map(pl => ({ ...pl, tracks: pl.tracks.map(track => serializeTrack(track)) })));
      return { playlists: updated };
    });
  },

  deletePlaylist: (playlistId) => {
    set((state) => {
      const updated = state.playlists.filter(p => p.id !== playlistId);
      localforage.setItem('playlists', updated.map(pl => ({ ...pl, tracks: pl.tracks.map(track => serializeTrack(track)) })));
      return { playlists: updated };
    });
  },

  loadAudioPaths: async (paths) => {
    const resolver = window.electronAPI?.resolveAudioPaths;
    if (typeof resolver !== 'function') throw new Error('Открытие файлов через Проводник доступно в установленной версии MusPlay.');
    const resolvedFiles = await resolver(Array.from(paths || []));
    if (!resolvedFiles.length) throw new Error('Не удалось открыть аудиофайлы. Возможно, формат не поддерживается или файл перемещён.');

    const newTracks = [];
    for (const info of resolvedFiles) {
      try {
        const response = await fetch(info.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const file = new File([blob], info.name, { type: info.mime || 'application/octet-stream', lastModified: info.lastModified || Date.now() });
        const metadata = await readAudioMetadata(file, info.name);
        newTracks.push({
          id: `external-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          title: metadata.title || fallbackTitleFromFileName(info.name),
          artist: metadata.artist || DEFAULT_ARTIST,
          album: metadata.album || DEFAULT_ALBUM,
          year: metadata.year || '',
          genre: metadata.genre || '',
          duration: metadata.duration || 0,
          bitrate: metadata.bitrate || 0, sampleRate: metadata.sampleRate || 0, codec: metadata.codec || '', container: metadata.container || '',
          url: info.url,
          sourcePath: info.path,
          cover: metadata.cover,
          isLocal: true,
          fileName: info.name,
          fileSize: info.size || blob.size,
          fileType: info.mime || '',
          lastModified: info.lastModified || 0
        });
      } catch (error) {
        console.warn(`MusPlay: не удалось прочитать «${info.name}»`, error);
      }
    }

    if (!newTracks.length) throw new Error('MusPlay не смог прочитать выбранные аудиофайлы.');
    let addedCount = 0;
    set((state) => {
      const existingByKey = new Map([...state.library, ...state.queue].map(track => [trackDuplicateKey(track), track]).filter(([key]) => key));
      const queueKeys = new Set(state.queue.map(trackDuplicateKey).filter(Boolean));
      const queueAdditions = [];
      const libraryAdditions = [];
      for (const incoming of newTracks) {
        const key = trackDuplicateKey(incoming);
        const existing = key ? existingByKey.get(key) : null;
        if (existing) {
          if (!queueKeys.has(key)) {
            queueAdditions.push(existing);
            queueKeys.add(key);
          }
          continue;
        }
        queueAdditions.push(incoming);
        libraryAdditions.push(incoming);
        if (key) { existingByKey.set(key, incoming); queueKeys.add(key); }
      }
      if (!queueAdditions.length) return state;
      addedCount = queueAdditions.length;
      const queue = [...state.queue, ...queueAdditions];
      const library = [...state.library, ...libraryAdditions];
      localforage.setItem('queue', queue.map(track => serializeTrack(track, { keepFileData: true })));
      localforage.setItem('library', library.map(track => serializeTrack(track, { keepFileData: true })));
      return { queue, library, currentTrack: state.currentTrack || queueAdditions[0], isPlaying: state.isPlaying || !state.currentTrack, currentTime: state.currentTrack ? state.currentTime : 0 };
    });
    return addedCount;
  },

  loadLocalFiles: async (files) => {
    const newTracks = [];
    const fileArray = Array.from(files || []);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const fileName = file.name || `audio-${i + 1}`;
      const metadata = await readAudioMetadata(file, fileName);
      const titleFallback = fallbackTitleFromFileName(fileName);
      let sourcePath = '';
      try {
        sourcePath = window.electronAPI?.getPathForFile?.(file) || '';
      } catch { /* browser preview / path unavailable */ }
      let resolvedPath = null;
      if (sourcePath && window.electronAPI?.resolveAudioPaths) {
        try { resolvedPath = (await window.electronAPI.resolveAudioPaths([sourcePath]))[0] || null; } catch { /* keep blob playback */ }
      }
      newTracks.push({
        id: `local-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        title: metadata.title || titleFallback,
        artist: metadata.artist || DEFAULT_ARTIST,
        album: metadata.album || DEFAULT_ALBUM,
        year: metadata.year || '',
        genre: metadata.genre || '',
        duration: metadata.duration || 0,
        bitrate: metadata.bitrate || 0, sampleRate: metadata.sampleRate || 0, codec: metadata.codec || '', container: metadata.container || '',
        url: resolvedPath?.url || URL.createObjectURL(file),
        sourcePath: resolvedPath?.path || '',
        cover: metadata.cover,
        isLocal: true,
        fileName,
        fileSize: file.size,
        fileType: file.type || '',
        lastModified: file.lastModified || 0,
        fileData: file,
      });
    }

    set((state) => {
      const existingByKey = new Map([...state.library, ...state.queue].map(track => [trackDuplicateKey(track), track]).filter(([key]) => key));
      const queueKeys = new Set(state.queue.map(trackDuplicateKey).filter(Boolean));
      const queueAdditions = [];
      const libraryAdditions = [];
      for (const incoming of newTracks) {
        const key = trackDuplicateKey(incoming);
        const existing = key ? existingByKey.get(key) : null;
        if (existing) {
          if (!queueKeys.has(key)) { queueAdditions.push(existing); queueKeys.add(key); }
          continue;
        }
        queueAdditions.push(incoming);
        libraryAdditions.push(incoming);
        if (key) { existingByKey.set(key, incoming); queueKeys.add(key); }
      }
      if (!queueAdditions.length) return state;
      const updatedQueue = [...state.queue, ...queueAdditions];
      const library = [...state.library, ...libraryAdditions];
      // Keep fileData in IndexedDB so metadata and playback URLs can be rebuilt after restart.
      localforage.setItem('queue', updatedQueue.map(track => serializeTrack(track, { keepFileData: true })));
      localforage.setItem('library', library.map(track => serializeTrack(track, { keepFileData: true })));
      return { queue: updatedQueue, library, currentTrack: state.currentTrack || queueAdditions[0] || null };
    });
  },

  updateTrackMetadata: (trackId, fields) => {
    set((state) => {
      const update = (track) => track?.id === trackId ? { ...track, ...fields } : track;
      const library = state.library.map(update);
      const queue = state.queue.map(update);
      const favorites = state.favorites.map(update);
      const history = state.history.map(update);
      const playlists = state.playlists.map(pl => ({ ...pl, tracks: (pl.tracks || []).map(update) }));
      const currentTrack = update(state.currentTrack);
      localforage.setItem('library', library.map(item => serializeTrack(item, { keepFileData: true })));
      localforage.setItem('queue', queue.map(item => serializeTrack(item, { keepFileData: true })));
      localforage.setItem('favorites', favorites.map(item => serializeTrack(item)));
      localforage.setItem('history', history.map(item => serializeTrack(item)));
      localforage.setItem('playlists', playlists.map(pl => ({ ...pl, tracks: pl.tracks.map(item => serializeTrack(item)) })));
      return { library, queue, favorites, history, playlists, currentTrack };
    });
  },

  scanMusicFolders: async (folders) => {
    const scanner = window.electronAPI?.scanAudioFolders;
    if (typeof scanner !== 'function') throw new Error('Автоматическое сканирование доступно в установленной версии MusPlay.');
    const scanResult = await scanner(folders);
    const files = Array.isArray(scanResult) ? scanResult : (Array.isArray(scanResult?.files) ? scanResult.files : []);
    const truncated = Boolean(scanResult?.truncated);
    const skippedLarge = Number(scanResult?.skippedLarge) || 0;
    if (!files.length) return { added: 0, found: 0, truncated, skippedLarge };
    const normalize = value => String(value || '').replace(/\\/g, '/').toLowerCase();
    const existingPaths = new Set([...get().library, ...get().queue].map(track => normalize(track.sourcePath)).filter(Boolean));
    const excludedRoots = (get().preferences?.excludedFolders || []).map(normalize).filter(Boolean).map(root => root.endsWith('/') ? root : `${root}/`);
    const candidates = files.filter(file => {
      const candidatePath = normalize(file.path);
      const excluded = excludedRoots.some(root => candidatePath === root.slice(0, -1) || candidatePath.startsWith(root));
      if (excluded || !candidatePath || existingPaths.has(candidatePath)) return false;
      existingPaths.add(candidatePath);
      return true;
    });
    const newTracks = [];
    for (let start = 0; start < candidates.length; start += 2) {
      const batch = candidates.slice(start, start + 2);
      const items = await Promise.all(batch.map(async (info) => {
        try {
          const response = await fetch(info.url);
          if (!response.ok) return null;
          const blob = await response.blob();
          const file = new File([blob], info.name, { type: info.mime || 'application/octet-stream', lastModified: info.lastModified || Date.now() });
          const metadata = await readAudioMetadata(file, info.name, { includeCover: false });
          return {
            id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            title: metadata.title || fallbackTitleFromFileName(info.name),
            artist: metadata.artist || DEFAULT_ARTIST,
            album: metadata.album || DEFAULT_ALBUM,
            year: metadata.year || '',
            genre: metadata.genre || '',
            duration: metadata.duration || 0,
            url: info.url,
            sourcePath: info.path,
            cover: metadata.cover,
            isLocal: true,
            fileName: info.name,
            fileSize: info.size || blob.size,
            fileType: info.mime || '',
            lastModified: info.lastModified || 0
          };
        } catch (error) {
          console.warn(`MusPlay: scan failed for ${info.name}`, error);
          return null;
        }
      }));
      newTracks.push(...items.filter(Boolean));
    }
    if (newTracks.length) {
      set((state) => {
        const library = [...state.library, ...newTracks];
        localforage.setItem('library', library.map(item => serializeTrack(item, { keepFileData: true })));
        return { library };
      });
    }
    return { added: newTracks.length, found: files.length, truncated, skippedLarge };
  },

  initialize: async () => {
    const runId = ++initializationRunId;
    const isCurrentRun = () => runId === initializationRunId;
    const preferences = readPreferences();
    set({ preferences });

    const savedVolume = Number(localStorage.getItem('music-player-volume'));
    if (Number.isFinite(savedVolume)) set({ volume: Math.max(0, Math.min(1, savedVolume)) });

    // Read the persisted collections together. Startup must not parse every audio
    // file again: the metadata was already stored when the track entered the library.
    const [libraryValue, queueValue, favoritesValue, historyValue, playlistsValue] = await Promise.all([
      localforage.getItem('library'),
      localforage.getItem('queue'),
      localforage.getItem('favorites'),
      localforage.getItem('history'),
      localforage.getItem('playlists')
    ]);
    if (!isCurrentRun()) return;

    const savedLibrary = Array.isArray(libraryValue) ? libraryValue : [];
    const savedQueue = Array.isArray(queueValue) ? queueValue : [];
    const savedFavorites = Array.isArray(favoritesValue) ? favoritesValue : [];
    const savedHistory = Array.isArray(historyValue) ? historyValue : [];
    const savedPlaylists = Array.isArray(playlistsValue) ? playlistsValue : [];
    const libraryIds = new Set(savedLibrary.map(track => track?.id).filter(Boolean));
    const allSavedTracks = [
      ...savedLibrary,
      ...savedQueue.filter(track => track && !libraryIds.has(track.id))
    ];

    const isBlobLike = value => value && typeof value === 'object'
      && typeof value.size === 'number' && typeof value.slice === 'function';
    const restoreTrackFast = track => {
      const fileData = isBlobLike(track?.fileData) ? track.fileData : null;
      const fileName = track?.fileName || fileData?.name || track?.title || '';
      let url = null;
      if (fileData) {
        try { url = URL.createObjectURL(fileData); } catch (error) {
          console.warn('MusPlay: не удалось восстановить локальный аудиофайл:', error);
        }
      } else if (typeof track?.url === 'string' && /^https?:\/\//i.test(track.url)) {
        url = track.url;
      }
      return { ...track, fileName, url };
    };

    const restoredTracks = allSavedTracks.map(restoreTrackFast);
    const byId = new Map(restoredTracks.map(track => [track.id, track]).filter(([id]) => id));
    const restoredLibrary = savedLibrary.length
      ? savedLibrary.map(track => byId.get(track.id) || restoreTrackFast(track))
      : restoredTracks.filter(track => track.isLocal);
    // Keep unavailable queue entries too. Their file paths are resolved in the
    // background; dropping them here would silently alter a user's saved queue.
    const restoredQueue = savedQueue.map(track => byId.get(track.id) || restoreTrackFast(track));

    const savedCurrentTrackId = localStorage.getItem('musplay-last-track-id');
    const restoredCurrentTrack = restoredQueue.find(track => track.id === savedCurrentTrackId)
      || restoredLibrary.find(track => track.id === savedCurrentTrackId)
      || restoredQueue.find(track => track.url)
      || restoredQueue[0]
      || null;
    const savedPosition = preferences.rememberPosition
      ? Math.max(0, Number(localStorage.getItem('musplay-last-position')) || 0)
      : 0;

    const mergeSavedTrack = track => ({ ...track, ...(byId.get(track.id) || {}) });
    const restoredFavorites = savedFavorites.map(mergeSavedTrack);
    const restoredHistory = savedHistory.map(mergeSavedTrack);
    const restoredPlaylists = savedPlaylists.map(playlist => ({
      ...playlist,
      tracks: (Array.isArray(playlist.tracks) ? playlist.tracks : []).map(mergeSavedTrack)
    }));

    set({
      library: restoredLibrary,
      queue: restoredQueue,
      currentTrack: restoredCurrentTrack,
      currentTime: savedPosition,
      duration: Number(restoredCurrentTrack?.duration) || 0,
      isPlaying: Boolean(preferences.autoResumeLastTrack && restoredCurrentTrack?.url),
      favorites: restoredFavorites,
      history: restoredHistory,
      playlists: restoredPlaylists,
      isInitialized: true
    });

    // The UI can now open. Disk-path recovery and migration of old metadata happen
    // below, without keeping the startup screen visible or blocking interaction.
    const backgroundTasks = async () => {
      await new Promise(resolve => setTimeout(resolve, 250));
      if (!isCurrentRun()) return;

      const normalizePath = value => String(value || '').replace(/\\/g, '/').toLowerCase();
      const externalPaths = [...new Set(allSavedTracks.map(track => track?.sourcePath).filter(Boolean))];
      const externalUrlByPath = new Map();
      if (externalPaths.length && window.electronAPI?.resolveAudioPaths) {
        try {
          for (let index = 0; index < externalPaths.length; index += 100) {
            if (!isCurrentRun()) return;
            const resolved = await window.electronAPI.resolveAudioPaths(externalPaths.slice(index, index + 100));
            for (const item of (Array.isArray(resolved) ? resolved : [])) {
              if (item?.path && item?.url) externalUrlByPath.set(normalizePath(item.path), item.url);
            }
          }
        } catch (error) {
          console.warn('MusPlay: восстановление путей к аудиофайлам не удалось:', error);
        }
      }

      if (!isCurrentRun()) return;
      if (externalUrlByPath.size) {
        const attachUrl = track => {
          const resolvedUrl = externalUrlByPath.get(normalizePath(track?.sourcePath));
          return resolvedUrl ? { ...track, url: resolvedUrl } : track;
        };
        const state = get();
        const library = state.library.map(attachUrl);
        const queue = state.queue.map(attachUrl);
        const currentTrack = state.currentTrack ? attachUrl(state.currentTrack) : null;
        const favorites = state.favorites.map(attachUrl);
        const history = state.history.map(attachUrl);
        const playlists = state.playlists.map(playlist => ({ ...playlist, tracks: playlist.tracks.map(attachUrl) }));
        const shouldResume = Boolean(preferences.autoResumeLastTrack && currentTrack?.url && !state.isPlaying);
        set({ library, queue, currentTrack, favorites, history, playlists, ...(shouldResume ? { isPlaying: true } : {}) });
      }

      // Only re-read metadata for older/incomplete records. Healthy tracks are
      // never re-parsed on every launch, and cover art is excluded from this pass.
      const metadataCandidates = get().library.filter(track => {
        if (!isBlobLike(track.fileData) || track.isLocal === false) return false;
        const fileTitle = fallbackTitleFromFileName(track.fileName || track.title || '');
        const titleNeedsRefresh = !track.title || track.title === fileTitle;
        const artistNeedsRefresh = !track.artist || track.artist === DEFAULT_ARTIST || track.artist === 'Unknown Artist';
        const albumNeedsRefresh = !track.album || track.album === DEFAULT_ALBUM;
        const durationNeedsRefresh = !(Number(track.duration) > 0);
        return titleNeedsRefresh || artistNeedsRefresh || albumNeedsRefresh || durationNeedsRefresh;
      });
      const refreshedById = new Map();
      for (let index = 0; index < metadataCandidates.length; index += 2) {
        if (!isCurrentRun()) return;
        const batch = metadataCandidates.slice(index, index + 2);
        const results = await Promise.all(batch.map(async track => {
          try {
            const metadata = await readAudioMetadata(track.fileData, track.fileName, { includeCover: false });
            const filenameTitle = fallbackTitleFromFileName(track.fileName || track.title || '');
            return {
              ...track,
              ...(metadata.title && (!track.title || track.title === filenameTitle) ? { title: metadata.title } : {}),
              ...(metadata.artist && (!track.artist || track.artist === DEFAULT_ARTIST || track.artist === 'Unknown Artist') ? { artist: metadata.artist } : {}),
              ...(metadata.album && (!track.album || track.album === DEFAULT_ALBUM) ? { album: metadata.album } : {}),
              ...(metadata.year && !track.year ? { year: metadata.year } : {}),
              ...(metadata.genre && !track.genre ? { genre: metadata.genre } : {}),
              ...(metadata.duration > 0 && !(Number(track.duration) > 0) ? { duration: metadata.duration } : {})
            };
          } catch (error) {
            console.warn(`MusPlay: фоновое обновление метаданных не удалось для «${track.fileName || track.title}»`, error);
            return track;
          }
        }));
        for (const track of results) if (track?.id) refreshedById.set(track.id, track);
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      if (!isCurrentRun()) return;
      if (refreshedById.size) {
        const mergeRefresh = track => refreshedById.get(track.id) || track;
        const state = get();
        const library = state.library.map(mergeRefresh);
        const queue = state.queue.map(mergeRefresh);
        const currentTrack = state.currentTrack ? mergeRefresh(state.currentTrack) : null;
        const favorites = state.favorites.map(mergeRefresh);
        const history = state.history.map(mergeRefresh);
        const playlists = state.playlists.map(playlist => ({ ...playlist, tracks: playlist.tracks.map(mergeRefresh) }));
        set({ library, queue, currentTrack, favorites, history, playlists });
        try {
          await Promise.all([
            localforage.setItem('library', library.map(track => serializeTrack(track, { keepFileData: true }))),
            localforage.setItem('queue', queue.map(track => serializeTrack(track, { keepFileData: true }))),
            localforage.setItem('favorites', favorites.map(track => serializeTrack(track))),
            localforage.setItem('history', history.map(track => serializeTrack(track))),
            localforage.setItem('playlists', playlists.map(playlist => ({ ...playlist, tracks: playlist.tracks.map(track => serializeTrack(track)) })))
          ]);
        } catch (error) {
          console.warn('MusPlay: не удалось сохранить обновлённые метаданные:', error);
        }
      }

      let savedFolders = [];
      try { savedFolders = JSON.parse(localStorage.getItem('musplay-library-folders') || '[]'); }
      catch (error) { console.warn('MusPlay: сохранённые папки библиотеки повреждены:', error); }
      if (preferences.autoScanAtStartup && Array.isArray(savedFolders) && savedFolders.length && isCurrentRun()) {
        try { await get().scanMusicFolders(savedFolders); }
        catch (error) { console.warn('MusPlay: фоновое сканирование библиотеки не удалось:', error); }
      }
    };

    backgroundTasks().catch(error => console.warn('MusPlay: фоновая инициализация завершилась с ошибкой:', error));
  }
}));

export default usePlayerStore;