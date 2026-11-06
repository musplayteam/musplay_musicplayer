import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import RightPanel from './components/RightPanel';
import BottomPlayer from './components/BottomPlayer';
import LyricsOverlay from './components/LyricsOverlay';
import CustomTitleBar from './components/CustomTitleBar';
import StartupLoadingScreen from './components/StartupLoadingScreen';
import usePlayerStore from './store/playerStore';
import { t } from './i18n';
import { ft } from './feature-i18n';
import { findLyrics } from './store/lyricsService';

export default function App() {
  const initialize = usePlayerStore((state) => state.initialize);
  const isInitialized = usePlayerStore((state) => state.isInitialized);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const preferences = usePlayerStore((state) => state.preferences);
  const [currentView, setCurrentView] = useState('home');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [showLyricsOverlay, setShowLyricsOverlay] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem('musplay-language');
    if (saved) return saved;
    const browserLocale = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
    const exact = ['ru','en','es','fr','de','pt','it','pl','uk','tr','ar','zh-cn','ja','ko','hi','id','vi','nl','az','bn','he','kk','be'].find(code => code.toLowerCase() === browserLocale);
    const prefix = browserLocale.split('-')[0];
    const supported = new Set(['ru','en','es','fr','de','pt','it','pl','uk','tr','ar','zh-cn','ja','ko','hi','id','vi','nl','az','bn','he','kk','be']);
    const chosen = exact || (supported.has(prefix) ? prefix : (prefix === 'zh' ? 'zh-CN' : 'en'));
    localStorage.setItem('musplay-language', chosen);
    localStorage.setItem('musplay-language-auto-selected', '1');
    return chosen;
  });
  const [theme, setThemeState] = useState(() => localStorage.getItem('musplay-theme') || 'purple');
  const [appVersion, setAppVersion] = useState('1.2.4');
  const [updateState, setUpdateState] = useState(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const initializationPromiseRef = useRef(null);
  const mainStageRef = useRef(null);
  const lastPersistedTrackIdRef = useRef(null);
  const [initializationError, setInitializationError] = useState(null);
  const [skipInitialization, setSkipInitialization] = useState(false);
  const languageRef = useRef(language);
  languageRef.current = language;

  const setLanguage = (value) => { localStorage.setItem('musplay-language', value); setLanguageState(value); };
  const setTheme = (value) => { localStorage.setItem('musplay-theme', value); setThemeState(value); };
  const checkUpdates = async () => {
    try {
      const result = await window.electronAPI?.checkUpdates?.();
      if (result) { setUpdateState(result); setShowUpdateBanner(Boolean(result.updateAvailable)); return result; }
      return null;
    } catch { return null; }
  };

  useEffect(() => {
    document.documentElement.lang = language;
    window.electronAPI?.setTrayLanguage?.(language)?.catch?.(() => {});
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = preferences.accentColor || 'purple';
    root.dataset.motion = preferences.animationsEnabled === false || preferences.reduceMotion ? 'reduced' : 'full';
    root.dataset.compactLists = preferences.compactLists ? 'true' : 'false';
  }, [preferences.accentColor, preferences.animationsEnabled, preferences.reduceMotion, preferences.compactLists]);

  useEffect(() => {
    if (!isInitialized || !currentTrack) return;
    const trackChanged = lastPersistedTrackIdRef.current !== currentTrack.id;
    localStorage.setItem('musplay-last-track-id', currentTrack.id);
    if (trackChanged) {
      if (lastPersistedTrackIdRef.current !== null) localStorage.setItem('musplay-last-position', '0');
      lastPersistedTrackIdRef.current = currentTrack.id;
    } else if (preferences.rememberPosition) {
      localStorage.setItem('musplay-last-position', String(currentTime || 0));
    }
  }, [isInitialized, currentTrack?.id, currentTime, preferences.rememberPosition]);

  useEffect(() => {
    const intervals = { '15m': 15 * 60 * 1000, '1h': 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000 };
    const delay = intervals[preferences.rescanInterval];
    if (!isInitialized || !delay) return undefined;
    let running = false;
    const timer = window.setInterval(async () => {
      if (running || document.hidden) return;
      let folders = [];
      try { folders = JSON.parse(localStorage.getItem('musplay-library-folders') || '[]'); } catch { folders = []; }
      if (!Array.isArray(folders) || !folders.length) return;
      running = true;
      try { await usePlayerStore.getState().scanMusicFolders(folders); }
      catch (error) { console.warn('MusPlay: scheduled library scan failed:', error); }
      finally { running = false; }
    }, delay);
    return () => window.clearInterval(timer);
  }, [isInitialized, preferences.rescanInterval]);

  useEffect(() => {
    if (!isInitialized || !currentTrack) return undefined;
    if (preferences.autoOpenLyrics) setShowLyricsOverlay(true);
    if (!preferences.autoSearchLyrics || preferences.autoOpenLyrics) return undefined;
    const controller = new AbortController();
    findLyrics(currentTrack, controller.signal).catch(error => {
      if (error?.name !== 'AbortError') console.warn('MusPlay: automatic lyrics lookup failed:', error);
    });
    return () => controller.abort();
  }, [isInitialized, currentTrack?.id, preferences.autoSearchLyrics, preferences.autoOpenLyrics]);

  const initializationAttemptRef = useRef(0);
  const startInitialization = () => {
    const attempt = ++initializationAttemptRef.current;
    setInitializationError(null);
    setSkipInitialization(false);
    const watchdog = window.setTimeout(() => {
      if (attempt !== initializationAttemptRef.current || usePlayerStore.getState().isInitialized) return;
      const message = languageRef.current === 'en'
        ? 'Loading saved music is taking too long. You can retry or continue without waiting.'
        : 'Загрузка сохранённой музыки занимает слишком много времени. Можно повторить попытку или продолжить без ожидания.';
      setInitializationError(new Error(message));
    }, 15000);
    const promise = Promise.resolve().then(() => initialize()).catch((error) => {
      console.error('MusPlay: initialization failed:', error);
      if (attempt === initializationAttemptRef.current) setInitializationError(error);
    }).finally(() => {
      window.clearTimeout(watchdog);
    });
    initializationPromiseRef.current = promise;
    return promise;
  };

  useEffect(() => {
    if (isInitialized) {
      setInitializationError(null);
      setSkipInitialization(false);
    }
  }, [isInitialized]);

  useEffect(() => {
    // Reuse the same promise during React StrictMode's development effect replay.
    // This prevents two simultaneous IndexedDB restores and duplicate Blob URLs.
    if (!initializationPromiseRef.current) startInitialization();
    window.electronAPI?.getAppVersion?.().then(setAppVersion).catch(() => {});
    const timer = setTimeout(() => { checkUpdates(); }, 1800);
    return () => clearTimeout(timer);
  }, [initialize]);

  // index.html paints a static boot screen before React can render anything.
  // Reveal the React app only after the persisted user data has been restored.
  useEffect(() => {
    if (!isInitialized && !skipInitialization && !initializationError) return undefined;
    document.documentElement.classList.add('musplay-app-ready');
    const bootScreen = document.getElementById('musplay-boot-screen');
    if (!bootScreen) return undefined;
    // Keep the node available so a failed restore can bring the same screen
    // back immediately when the user chooses Retry.
    bootScreen.classList.add('is-exiting');
    return undefined;
  }, [isInitialized, skipInitialization, initializationError]);

  // Re-trigger a subtle entrance animation whenever the central section changes,
  // without unmounting MainContent and losing its local search/form state.
  useEffect(() => {
    const stage = mainStageRef.current;
    if (!stage) return;
    stage.classList.remove('musplay-view-enter');
    void stage.offsetWidth;
    stage.classList.add('musplay-view-enter');
  }, [currentView, selectedPlaylistId]);

  // Global media keys and Windows "Open with MusPlay" are delivered by the
  // Electron main process, so they continue to work while the window is hidden.
  useEffect(() => {
    const unsubscribeMedia = window.electronAPI?.onMediaAction?.((action) => {
      const player = usePlayerStore.getState();
      if (action === 'toggle' && player.currentTrack) player.togglePlay();
      else if (action === 'play' && player.currentTrack) player.resumePlayback();
      else if (action === 'pause') player.pausePlayback();
      else if (action === 'previous') player.prevTrack();
      else if (action === 'next') player.nextTrack();
      else if (action === 'stop') player.stopPlayback();
    });
    let active = true;
    const unsubscribeFiles = window.electronAPI?.onOpenAudioFiles?.(async (paths) => {
      try {
        // Wait for the saved library/queue to finish restoring before appending
        // files opened from Explorer; otherwise initialize() could overwrite them.
        await initializationPromiseRef.current;
        if (!active) return;
        await usePlayerStore.getState().loadAudioPaths(paths);
      } catch (error) {
        console.error('MusPlay: не удалось открыть аудиофайл из Проводника', error);
        window.alert(languageRef.current === 'en'
          ? (error?.message || 'Could not open the selected audio file.')
          : (error?.message || 'Не удалось открыть выбранный аудиофайл.'));
      }
    });
    return () => {
      active = false;
      unsubscribeMedia?.();
      unsubscribeFiles?.();
    };
  }, []);

  useEffect(() => {
    const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files');
    const onDragEnter = event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragOver(true);
    };
    const onDragOver = event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (!dragDepthRef.current) setIsDragOver(false);
    };
    const onDrop = async event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOver(false);
      const files = Array.from(event.dataTransfer?.files || []).filter(file =>
        file.type.startsWith('audio/') || /\\.(mp3|flac|wav|m4a|aac|ogg|oga|opus|wma|aiff|aif|ape|alac|weba)$/i.test(file.name || '')
      );
      if (!files.length) return;
      try {
        await initializationPromiseRef.current;
        await usePlayerStore.getState().loadLocalFiles(files);
      } catch (error) {
        console.error('MusPlay: drag-and-drop import failed', error);
      }
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    const shortcutFor = event => {
      const parts = [];
      if (event.ctrlKey) parts.push('Ctrl');
      if (event.altKey) parts.push('Alt');
      if (event.shiftKey) parts.push('Shift');
      if (event.metaKey) parts.push('Meta');
      const key = event.code === 'Space' ? 'Space' : event.key.startsWith('Arrow') ? event.key : event.key.length === 1 ? event.key.toUpperCase() : event.key;
      parts.push(key);
      return parts.join('+');
    };
    const handleShortcut = event => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select,button,a,[role=button]'))) return;
      const shortcut = shortcutFor(event);
      if (shortcut === 'Ctrl+F') {
        event.preventDefault();
        document.querySelector('[data-musplay-search="true"]')?.focus();
        return;
      }
      if (shortcut === 'Ctrl+O') {
        event.preventDefault();
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = 'audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus,.wma,.aiff,.ape,.alac';
        picker.multiple = true;
        picker.addEventListener('change', () => {
          if (picker.files?.length) usePlayerStore.getState().loadLocalFiles(picker.files).catch(error => console.error('MusPlay: file import failed', error));
        }, { once: true });
        picker.click();
        return;
      }
      const player = usePlayerStore.getState();
      if (shortcut === preferences.shortcutPlayPause && player.currentTrack) { event.preventDefault(); player.togglePlay(); }
      else if ((shortcut === preferences.shortcutNext || shortcut === 'Ctrl+ArrowRight') && player.currentTrack) { event.preventDefault(); player.nextTrack(); }
      else if ((shortcut === preferences.shortcutPrevious || shortcut === 'Ctrl+ArrowLeft') && player.currentTrack) { event.preventDefault(); player.prevTrack(); }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [preferences.shortcutPlayPause, preferences.shortcutNext, preferences.shortcutPrevious]);

  // Publish the current track to Windows Media Session (system media controls,
  // Bluetooth/headset controls and keyboards supported by Chromium). Commands
  // are sent through the main process so a simultaneous global shortcut is
  // de-duplicated centrally.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined;
    const session = navigator.mediaSession;
    const send = action => () => window.electronAPI?.sendMediaSessionAction?.(action);
    const handlers = {
      play: send('play'),
      pause: send('pause'),
      previoustrack: send('previous'),
      nexttrack: send('next'),
      stop: send('stop')
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { session.setActionHandler(action, handler); } catch { /* unsupported action on this OS */ }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try { session.setActionHandler(action, null); } catch { /* ignore unsupported action */ }
      }
    };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    if (currentTrack && typeof window.MediaMetadata === 'function') {
      const artwork = currentTrack.cover
        ? [{ src: currentTrack.cover, sizes: '512x512' }]
        : [];
      session.metadata = new window.MediaMetadata({
        title: currentTrack.title || 'Unknown title',
        artist: currentTrack.artist || 'Unknown artist',
        album: currentTrack.album || '',
        artwork
      });
    } else {
      session.metadata = null;
    }
    session.playbackState = currentTrack ? (isPlaying ? 'playing' : 'paused') : 'none';
    const total = Number(duration || currentTrack?.duration || 0);
    if (total > 0) {
      try {
        session.setPositionState({
          duration: total,
          playbackRate: 1,
          position: Math.max(0, Math.min(Number(currentTime) || 0, total))
        });
      } catch { /* duration or position may be invalid while changing tracks */ }
    }
  }, [currentTrack, isPlaying, currentTime, duration]);

  // Electron/Chromium can latch a wheel gesture to the first scroll container
  // for the lifetime of a wheel burst. Route wheel deltas to the panel currently
  // underneath the pointer so switching panels works without pausing the wheel.
  useEffect(() => {
    let pointerX = null;
    let pointerY = null;
    const rememberPointer = (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    };

    const canScrollInDirection = (element, deltaY) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
      if (element.scrollHeight <= element.clientHeight + 1) return false;
      const maxScrollTop = element.scrollHeight - element.clientHeight;
      return deltaY < 0
        ? element.scrollTop > 0
        : element.scrollTop < maxScrollTop - 1;
    };

    const handleWheel = (event) => {
      if (event.ctrlKey || event.deltaY === 0) return;

      // The event target can remain latched to the first panel, but its pointer
      // coordinates tell us which panel the cursor is over now.
      // Keep a separate pointer position because Chromium may latch the wheel
      // event target to the panel where the gesture began.
      const x = pointerX ?? event.clientX;
      const y = pointerY ?? event.clientY;
      const hoveredElement = document.elementFromPoint(x, y);
      const region = hoveredElement?.closest?.('[data-wheel-region="true"]');
      if (!region) return;

      // Always cancel native wheel scrolling within these panels. Otherwise a
      // latched native gesture could keep scrolling the previous panel when the
      // pointer has already moved to another one (even at the new panel's edge).
      event.preventDefault();

      let target = hoveredElement;
      while (target && target !== region.parentElement) {
        if (canScrollInDirection(target, event.deltaY)) break;
        if (target === region) {
          target = null;
          break;
        }
        target = target.parentElement;
      }

      if (!target || !region.contains(target) || !canScrollInDirection(target, event.deltaY)) return;

      let delta = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
      else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= target.clientHeight;

      target.scrollTop = Math.max(0, Math.min(
        target.scrollHeight - target.clientHeight,
        target.scrollTop + delta,
      ));
    };

    window.addEventListener('pointermove', rememberPointer, true);
    window.addEventListener('mousemove', rememberPointer, true);
    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('pointermove', rememberPointer, true);
      window.removeEventListener('mousemove', rememberPointer, true);
      window.removeEventListener('wheel', handleWheel, true);
    };
  }, []);

  const backgroundClass = theme === 'black' ? 'bg-gradient-to-br from-black via-[#08060b] to-black' : theme === 'dark' ? 'bg-gradient-to-br from-[#111116] via-[#1c1b24] to-[#09090d]' : 'bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#0f0518]';
  const openReleases = () => window.electronAPI?.openExternal?.(updateState?.releasesUrl || 'https://github.com/musplayteam/musplay_musicplayer/releases');

  return (
    <div aria-busy={!isInitialized && !skipInitialization} className={`musplay-app-shell relative h-screen min-h-0 w-full ${backgroundClass} text-white flex flex-col overflow-hidden transition-colors duration-300`} data-compact-lists={preferences.compactLists ? 'true' : 'false'} style={{ zoom: `${Math.max(85, Math.min(115, Number(preferences.uiScale) || 100))}%` }}>
      {isDragOver && (
        <div className="fixed inset-0 z-[120] pointer-events-none flex items-center justify-center bg-purple-950/70 backdrop-blur-sm border-4 border-dashed border-purple-300/80">
          <div className="rounded-3xl bg-[#170e22] border border-purple-300/30 px-10 py-8 shadow-2xl text-center">
            <div className="text-xl font-semibold">{ft('dropAudioFiles', language)}</div>
          </div>
        </div>
      )}
      {/* Заголовок приклеен к верху окна */}
      <CustomTitleBar language={language} />
      {showUpdateBanner && updateState?.updateAvailable && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-40 mt-2 max-w-[calc(100%-2rem)] rounded-xl border border-purple-300/20 bg-[#241333]/95 shadow-xl shadow-black/30 backdrop-blur px-4 py-2.5 flex items-center gap-3" role="status">
          <span className="w-2 h-2 rounded-full bg-pink-400 shrink-0 animate-pulse" />
          <span className="text-xs sm:text-sm whitespace-nowrap">{t('updateAvailable', language, { latestVersion: updateState.latestVersion })}</span>
          <button onClick={openReleases} className="text-xs sm:text-sm font-semibold text-pink-300 hover:text-white whitespace-nowrap">{t('downloadVersion', language, { latestVersion: updateState.latestVersion })} ↗</button>
          <button onClick={() => setShowUpdateBanner(false)} className="text-gray-400 hover:text-white text-lg leading-none ml-1" aria-label={t('close', language)}>×</button>
        </div>
      )}
      
      {/* Reserve space for the custom title bar and optional update banner. */}
      <div className={`flex flex-1 min-h-0 min-w-0 overflow-hidden ${showUpdateBanner ? 'pt-[88px]' : 'pt-12'} pb-20`}>
        <Sidebar 
          currentView={currentView} 
          setCurrentView={setCurrentView} 
          setSelectedPlaylistId={setSelectedPlaylistId}
          selectedPlaylistId={selectedPlaylistId}
          language={language}
        />
        <div ref={mainStageRef} className="musplay-view-stage flex flex-1 min-w-0 min-h-0 overflow-hidden">
          <MainContent 
            currentView={currentView} 
            selectedPlaylistId={selectedPlaylistId} 
            setCurrentView={setCurrentView}
            language={language}
            setLanguage={setLanguage}
            theme={theme}
            setTheme={setTheme}
            appVersion={appVersion}
            onCheckUpdates={checkUpdates}
            updateState={updateState}
          />
        </div>
        {preferences.showRightPanel !== false && <RightPanel language={language} />}
      </div>
      
      {/* Плеер приклеен к низу окна */}
      <LyricsOverlay language={language} open={showLyricsOverlay} onClose={() => setShowLyricsOverlay(false)} onOpenSearch={() => { setShowLyricsOverlay(false); setCurrentView('lyrics'); }} />
      <BottomPlayer language={language} showLyrics={showLyricsOverlay} onToggleLyrics={() => setShowLyricsOverlay(value => !value)} onOpenQueue={() => setCurrentView('queue')} />
      {initializationError && !skipInitialization && (
        <StartupLoadingScreen
          language={language}
          error
          onRetry={() => {
            document.documentElement.classList.remove('musplay-app-ready');
            const bootScreen = document.getElementById('musplay-boot-screen');
            if (bootScreen) bootScreen.classList.remove('is-exiting');
            initializationPromiseRef.current = null;
            startInitialization();
          }}
          onContinue={() => setSkipInitialization(true)}
        />
      )}
    </div>
  );
}