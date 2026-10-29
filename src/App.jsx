import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import RightPanel from './components/RightPanel';
import BottomPlayer from './components/BottomPlayer';
import LyricsOverlay from './components/LyricsOverlay';
import CustomTitleBar from './components/CustomTitleBar';
import usePlayerStore from './store/playerStore';

export default function App() {
  const initialize = usePlayerStore((state) => state.initialize);
  const [currentView, setCurrentView] = useState('home');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [showLyricsOverlay, setShowLyricsOverlay] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

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

  return (
    <div className="h-screen min-h-0 w-full bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#0f0518] text-white flex flex-col overflow-hidden">
      {/* Заголовок приклеен к верху окна */}
      <CustomTitleBar />
      
      {/* pt-12 = отступ сверху на высоту заголовка (48px) */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden pt-12 pb-20">
        <Sidebar 
          currentView={currentView} 
          setCurrentView={setCurrentView} 
          setSelectedPlaylistId={setSelectedPlaylistId}
          selectedPlaylistId={selectedPlaylistId}
        />
        <MainContent 
          currentView={currentView} 
          selectedPlaylistId={selectedPlaylistId} 
          setCurrentView={setCurrentView}
        />
        <RightPanel />
      </div>
      
      {/* Плеер приклеен к низу окна */}
      <LyricsOverlay open={showLyricsOverlay} onClose={() => setShowLyricsOverlay(false)} onOpenSearch={() => { setShowLyricsOverlay(false); setCurrentView('lyrics'); }} />
      <BottomPlayer showLyrics={showLyricsOverlay} onToggleLyrics={() => setShowLyricsOverlay(value => !value)} />
    </div>
  );
}
