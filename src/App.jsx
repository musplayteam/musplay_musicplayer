import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import RightPanel from './components/RightPanel';
import BottomPlayer from './components/BottomPlayer';
import LyricsOverlay from './components/LyricsOverlay';
import CustomTitleBar from './components/CustomTitleBar';
import usePlayerStore from './store/playerStore';

export default function App() {
  const initialize = usePlayerStore((state) => state.initialize);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const [currentView, setCurrentView] = useState('home');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [showLyricsOverlay, setShowLyricsOverlay] = useState(false);
  const [language, setLanguageState] = useState(() => localStorage.getItem('musplay-language') || 'ru');
  const [theme, setThemeState] = useState(() => localStorage.getItem('musplay-theme') || 'purple');
  const [appVersion, setAppVersion] = useState('1.1.0');
  const [updateState, setUpdateState] = useState(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const initializationPromiseRef = useRef(null);
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
    initializationPromiseRef.current = Promise.resolve(initialize()).catch((error) => {
      console.error('MusPlay: initialization failed:', error);
    });
    window.electronAPI?.getAppVersion?.().then(setAppVersion).catch(() => {});
    const timer = setTimeout(() => { checkUpdates(); }, 1800);
    return () => clearTimeout(timer);
  }, [initialize]);

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
    <div className={`h-screen min-h-0 w-full ${backgroundClass} text-white flex flex-col overflow-hidden transition-colors duration-300`}>
      {/* Заголовок приклеен к верху окна */}
      <CustomTitleBar language={language} />
      {showUpdateBanner && updateState?.updateAvailable && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-40 mt-2 max-w-[calc(100%-2rem)] rounded-xl border border-purple-300/20 bg-[#241333]/95 shadow-xl shadow-black/30 backdrop-blur px-4 py-2.5 flex items-center gap-3" role="status">
          <span className="w-2 h-2 rounded-full bg-pink-400 shrink-0 animate-pulse" />
          <span className="text-xs sm:text-sm whitespace-nowrap">{language === 'en' ? `MusPlay ${updateState.latestVersion} is available` : `Доступно обновление MusPlay ${updateState.latestVersion}`}</span>
          <button onClick={openReleases} className="text-xs sm:text-sm font-semibold text-pink-300 hover:text-white whitespace-nowrap">{language === 'en' ? 'View update' : 'Скачать'} ↗</button>
          <button onClick={() => setShowUpdateBanner(false)} className="text-gray-400 hover:text-white text-lg leading-none ml-1" aria-label={language === 'en' ? 'Dismiss' : 'Закрыть'}>×</button>
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
        <RightPanel language={language} />
      </div>
      
      {/* Плеер приклеен к низу окна */}
      <LyricsOverlay language={language} open={showLyricsOverlay} onClose={() => setShowLyricsOverlay(false)} onOpenSearch={() => { setShowLyricsOverlay(false); setCurrentView('lyrics'); }} />
      <BottomPlayer language={language} showLyrics={showLyricsOverlay} onToggleLyrics={() => setShowLyricsOverlay(value => !value)} />
    </div>
  );
}