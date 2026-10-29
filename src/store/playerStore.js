import { create } from 'zustand';
import { readAudioMetadata, fallbackTitleFromFileName, DEFAULT_ARTIST, DEFAULT_ALBUM } from './audioMetadata';
import localforage from 'localforage';

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

let activeOnlineSearchController = null;
let activeFreeMusicSearchController = null;

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

  playTrack: (track) => {
    if (!track) return;
    set((state) => {
      const history = [track, ...state.history.filter(item => item.id !== track.id)].slice(0, 100);
      localforage.setItem('history', history.map(track => serializeTrack(track)));
      return { currentTrack: track, isPlaying: true, currentTime: 0, history };
    });
  },

  playOnlinePreview: (track) => {
    if (!track?.url || !/^https?:\/\//i.test(track.url)) return;
    set((state) => {
      const queue = state.queue.some(item => item.id === track.id)
        ? state.queue
        : [...state.queue, track];
      const history = [track, ...state.history.filter(item => item.id !== track.id)].slice(0, 100);
      localforage.setItem('queue', queue.map(item => serializeTrack(item, { keepFileData: true })));
      localforage.setItem('history', history.map(item => serializeTrack(item)));
      return { queue, currentTrack: track, isPlaying: true, currentTime: 0, history };
    });
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
  clearQueue: () => set({ queue: [] }),
  setQueueAndPlay: (tracks, startIndex = 0) => {
    const playable = tracks.filter(track => track.url);
    if (!playable.length) return;
    set({ queue: playable, currentTrack: playable[Math.min(startIndex, playable.length - 1)], isPlaying: true, currentTime: 0 });
  },
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
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

  setQueue: (tracks) => set({ queue: tracks }),

  removeFromQueue: async (trackId) => {
    set((state) => {
      const updatedQueue = state.queue.filter(t => t.id !== trackId);
      const tracksToSave = updatedQueue.map(track => serializeTrack(track, { keepFileData: true }));
      localforage.setItem('queue', tracksToSave);
      let newCurrentTrack = state.currentTrack;
      if (state.currentTrack?.id === trackId) {
        newCurrentTrack = updatedQueue[0] || null;
      }
      return { queue: updatedQueue, currentTrack: newCurrentTrack };
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

  loadLocalFiles: async (files) => {
    const newTracks = [];
    const fileArray = Array.from(files || []);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const fileName = file.name || `audio-${i + 1}`;
      const metadata = await readAudioMetadata(file, fileName);
      const titleFallback = fallbackTitleFromFileName(fileName);
      newTracks.push({
        id: `local-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        title: metadata.title || titleFallback,
        artist: metadata.artist || DEFAULT_ARTIST,
        album: metadata.album || DEFAULT_ALBUM,
        duration: metadata.duration || 0,
        url: URL.createObjectURL(file),
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
      const updatedQueue = [...state.queue, ...newTracks];
      const knownIds = new Set(state.library.map(track => track.id));
      const library = [...state.library, ...newTracks.filter(track => !knownIds.has(track.id))];
      // Keep fileData in IndexedDB so metadata and playback URLs can be rebuilt after restart.
      localforage.setItem('queue', updatedQueue.map(track => serializeTrack(track, { keepFileData: true })));
      localforage.setItem('library', library.map(track => serializeTrack(track, { keepFileData: true })));
      return {
        queue: updatedQueue,
        library,
        currentTrack: state.currentTrack || newTracks[0] || null
      };
    });
  },

  initialize: async () => {
    const savedVolume = localStorage.getItem('music-player-volume');
    if (savedVolume) set({ volume: parseFloat(savedVolume) });

    const savedLibrary = (await localforage.getItem('library')) || [];
    const savedQueue = (await localforage.getItem('queue')) || [];
    const libraryIds = new Set(savedLibrary.map(track => track.id));
    const allSavedTracks = [
      ...savedLibrary,
      ...savedQueue.filter(track => !libraryIds.has(track.id))
    ];

    // Important: re-read metadata of tracks from older app versions. Otherwise
    // stale filename-based titles remain in IndexedDB even after upgrading code.
    const restoredTracks = [];
    // Limit concurrent metadata reads to keep memory usage reasonable for large queues.
    for (let start = 0; start < allSavedTracks.length; start += 4) {
      const batch = allSavedTracks.slice(start, start + 4);
      const restoredBatch = await Promise.all(batch.map(async (track) => {
      const fileData = track.fileData || null;
      const fileName = track.fileName || fileData?.name || track.title || '';
      let refreshed = {};
      if (fileData && track.isLocal !== false) {
        try {
          refreshed = await readAudioMetadata(fileData, fileName);
        } catch (error) {
          console.warn(`MusPlay: обновление метаданных не удалось для «${fileName}»`, error);
        }
      }
      const filenameTitle = fallbackTitleFromFileName(fileName);
      const oldTitleLooksLikeFilename = !track.title || track.title === filenameTitle;
      return {
        ...track,
        ...((refreshed.title && oldTitleLooksLikeFilename) ? { title: refreshed.title } : {}),
        ...(refreshed.artist && (!track.artist || track.artist === DEFAULT_ARTIST || track.artist === 'Unknown Artist') ? { artist: refreshed.artist } : {}),
        ...(refreshed.album && (!track.album || track.album === DEFAULT_ALBUM) ? { album: refreshed.album } : {}),
        ...(refreshed.duration > 0 && !(track.duration > 0) ? { duration: refreshed.duration } : {}),
        ...(refreshed.cover && !track.cover ? { cover: refreshed.cover } : {}),
        fileName,
        url: fileData ? URL.createObjectURL(fileData) : track.url || null
      };
      }));
      restoredTracks.push(...restoredBatch);
    }

    const byId = new Map(restoredTracks.map(track => [track.id, track]));
    const restoredLibrary = savedLibrary.length
      ? restoredTracks.filter(track => libraryIds.has(track.id))
      : restoredTracks.filter(track => track.isLocal);
    const restoredQueue = savedQueue.map(track => byId.get(track.id) || {
      ...track,
      url: track.fileData ? URL.createObjectURL(track.fileData) : track.url || null
    }).filter(track => track.url);

    set({
      library: restoredLibrary,
      queue: restoredQueue,
      currentTrack: restoredQueue[0] || null
    });

    // Persist refreshed tags so the next startup does not have to rediscover them.
    await localforage.setItem('library', restoredLibrary.map(track => serializeTrack(track, { keepFileData: true })));
    await localforage.setItem('queue', restoredQueue.map(track => serializeTrack(track, { keepFileData: true })));

    const savedFavorites = (await localforage.getItem('favorites')) || [];
    const savedHistory = (await localforage.getItem('history')) || [];
    set({
      favorites: savedFavorites.map(track => ({ ...track, ...(byId.get(track.id) || {}) })),
      history: savedHistory.map(track => ({ ...track, ...(byId.get(track.id) || {}) }))
    });

    const savedPlaylists = (await localforage.getItem('playlists')) || [];
    const restoredPlaylists = savedPlaylists.map(playlist => ({
      ...playlist,
      tracks: (playlist.tracks || []).map(track => ({ ...track, ...(byId.get(track.id) || {}) }))
    }));
    set({ playlists: restoredPlaylists });
    await localforage.setItem('playlists', restoredPlaylists.map(playlist => ({
      ...playlist, tracks: playlist.tracks.map(track => serializeTrack(track))
    }))); 

    set({ isInitialized: true });
  }
}));

export default usePlayerStore;