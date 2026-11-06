import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle, Upload, Heart, FileMusic, SlidersHorizontal, ListMusic } from 'lucide-react';
import usePlayerStore from '../store/playerStore';
import { t } from '../i18n';
import { ft } from '../feature-i18n';
import EqualizerPanel, { EQ_FREQUENCIES } from './EqualizerPanel';
import NowPlayingModal from './NowPlayingModal';

function readSavedEq() {
  try {
    const value = JSON.parse(localStorage.getItem('musplay-equalizer') || 'null');
    return Array.isArray(value) && value.length === EQ_FREQUENCIES.length
      ? value.map(item => Math.max(-12, Math.min(12, Number(item) || 0)))
      : Array(EQ_FREQUENCIES.length).fill(0);
  } catch { return Array(EQ_FREQUENCIES.length).fill(0); }
}

export default function BottomPlayer({ showLyrics = false, onToggleLyrics = () => {}, onOpenQueue = () => {}, language = 'ru' }) {
  const audioRef = useRef(null); // unprocessed channel for online previews
  const eqAudioRef = useRef(null); // local-file channel routed through Web Audio
  const progressRef = useRef(null);
  const fileInputRef = useRef(null);
  const eqGraphRef = useRef(null);
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [eqGains, setEqGains] = useState(readSavedEq);
  const [eqSupported, setEqSupported] = useState(false);

  const {
    currentTrack, isPlaying, currentTime, duration, volume, isMuted,
    isShuffle, repeatMode, togglePlay, nextTrack, prevTrack,
    setCurrentTime, setDuration, setVolume, toggleMute, toggleShuffle, toggleRepeat, loadLocalFiles, favorites, toggleFavorite
  } = usePlayerStore();

  const ensureAudioGraph = () => {
    if (!currentTrack?.isLocal) { setEqSupported(false); return false; }
    if (eqGraphRef.current) {
      if (eqGraphRef.current.context.state === 'suspended') eqGraphRef.current.context.resume().catch(() => {});
      return true;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !eqAudioRef.current) { setEqSupported(false); return false; }
    let context = null;
    let source = null;
    try {
      context = new AudioContextClass();
      const filters = EQ_FREQUENCIES.map(frequency => {
        const filter = context.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return filter;
      });
      source = context.createMediaElementSource(eqAudioRef.current);
      let previous = source;
      filters.forEach(filter => { previous.connect(filter); previous = filter; });
      previous.connect(context.destination);
      eqGraphRef.current = { context, source, filters };
      filters.forEach((filter, index) => { filter.gain.value = eqGains[index] || 0; });
      setEqSupported(true);
      context.resume().catch(() => {});
      return true;
    } catch (error) {
      // Once createMediaElementSource succeeds, the media element is routed
      // through Web Audio. Keep a direct path to the speakers if filter setup fails.
      try { if (source && context) source.connect(context.destination); } catch { /* best effort fallback */ }
      console.warn('MusPlay: equalizer initialization failed', error);
      setEqSupported(false);
      return false;
    }
  };

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
  }, [currentTrack?.id, setCurrentTime, setDuration]);

  useEffect(() => {
    const normalAudio = audioRef.current;
    const localAudio = eqAudioRef.current;
    if (!normalAudio || !localAudio) return;
    const activeAudio = currentTrack?.isLocal ? localAudio : normalAudio;
    const inactiveAudio = currentTrack?.isLocal ? normalAudio : localAudio;

    inactiveAudio.pause();
    inactiveAudio.removeAttribute('src');
    inactiveAudio.load();

    if (!currentTrack) {
      activeAudio.pause();
      activeAudio.removeAttribute('src');
      activeAudio.load();
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    if (isPlaying) {
      // Do not create a Web Audio graph from an effect: Chromium may suspend
      // it without a user gesture. The EQ button creates it directly on click.
      if (!currentTrack.isLocal) setEqSupported(false);
      const context = currentTrack.isLocal ? eqGraphRef.current?.context : null;
      if (context?.state === 'suspended') context.resume().catch(() => {});
      activeAudio.play().catch(error => console.error('Autoplay:', error));
    } else {
      activeAudio.pause();
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
    if (eqAudioRef.current) eqAudioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  useEffect(() => {
    localStorage.setItem('musplay-equalizer', JSON.stringify(eqGains));
    const filters = eqGraphRef.current?.filters;
    if (filters) filters.forEach((filter, index) => { filter.gain.setTargetAtTime(eqGains[index] || 0, eqGraphRef.current.context.currentTime, 0.015); });
  }, [eqGains]);

  useEffect(() => () => {
    const graph = eqGraphRef.current;
    if (graph) {
      try { graph.source.disconnect(); graph.filters.forEach(filter => filter.disconnect()); } catch { /* already disconnected */ }
      graph.context.close().catch(() => {});
    }
  }, []);

  const handleTimeUpdate = event => { setCurrentTime(event.currentTarget.currentTime); };
  const handleLoadedMetadata = event => { setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0); };
  const handleEnded = event => {
    if (repeatMode === 'one' && event.currentTarget) {
      event.currentTarget.currentTime = 0;
      event.currentTarget.play().catch(() => {});
    } else nextTrack();
  };
  const getActiveAudio = () => currentTrack?.isLocal ? eqAudioRef.current : audioRef.current;
  const handleProgressClick = event => {
    const audio = getActiveAudio();
    if (!progressRef.current || !audio || !(duration > 0)) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const nextTime = percent * duration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };
  const formatTime = seconds => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  };
  const handleFileUpload = event => {
    const files = event.target.files;
    if (files?.length) loadLocalFiles(files);
    event.target.value = '';
  };

  const audioElements = <>
    <audio ref={audioRef} src={!currentTrack?.isLocal ? (currentTrack?.url || undefined) : undefined} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={handleEnded} className="hidden"/>
    <audio ref={eqAudioRef} src={currentTrack?.isLocal ? (currentTrack?.url || undefined) : undefined} crossOrigin="anonymous" onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={handleEnded} className="hidden"/>
  </>;

  if (!currentTrack) {
    return <>
      {audioElements}
      <div className={`musplay-bottom-player fixed bottom-0 left-0 right-0 h-20 bg-[#0f0518]/90 backdrop-blur-xl border-t border-white/10 px-6 flex items-center justify-center gap-4 z-50 ${showLyrics ? 'is-hidden' : ''}`} aria-hidden={showLyrics}>
        <p className="text-gray-400 text-sm">{t('queueEmptyPrompt', language)}</p>
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition text-sm"><Upload size={16}/>{t('uploadMusic', language)}</button>
        <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFileUpload} className="hidden"/>
      </div>
    </>;
  }

  return <>
    {audioElements}
    <div className={`musplay-bottom-player fixed bottom-0 left-0 right-0 h-20 bg-[#0f0518]/90 backdrop-blur-xl border-t border-white/10 px-4 md:px-6 flex items-center justify-between gap-3 z-50 ${showLyrics ? 'is-hidden' : ''}`} aria-hidden={showLyrics}>
      <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFileUpload} className="hidden"/>

      <div className="flex items-center gap-3 w-[30%] min-w-0">
        <button onClick={() => setShowNowPlaying(true)} className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center overflow-hidden shrink-0" title={ft('expandPlayer', language)}>
          {currentTrack.cover ? <img src={currentTrack.cover} alt={t('coverAlt', language)} className="w-full h-full object-cover"/> : <span className="text-2xl">🎵</span>}
        </button>
        <button onClick={() => setShowNowPlaying(true)} className="overflow-hidden min-w-0 text-left">
          <p className="font-semibold text-sm truncate">{currentTrack.title || t('noTitle', language)}</p>
          <p className="text-xs text-gray-400 truncate">{currentTrack.artist || t('unknownArtist', language)}</p>
        </button>
        <button onClick={() => toggleFavorite(currentTrack)} className={`p-2 transition shrink-0 ${favorites.some(track => track.id === currentTrack.id) ? 'text-pink-400' : 'text-gray-500 hover:text-pink-300'}`} title={t('likeTrack', language)}><Heart size={17} fill={favorites.some(track => track.id === currentTrack.id) ? 'currentColor' : 'none'}/></button>
      </div>

      <div className="flex flex-col items-center gap-2 w-[44%] min-w-0">
        <div className="flex items-center gap-4">
          <button onClick={toggleShuffle} title={t('shuffle', language)} aria-label={t('shuffle', language)} className={`transition ${isShuffle ? 'text-pink-500' : 'text-gray-400 hover:text-white'}`}><Shuffle size={16}/></button>
          <button onClick={prevTrack} title={t('previousTrack', language)} aria-label={t('previousTrack', language)} className="text-gray-400 hover:text-white transition"><SkipBack size={18} fill="currentColor"/></button>
          <button onClick={togglePlay} title={isPlaying ? t('pause', language) : t('playAction', language)} aria-label={isPlaying ? t('pause', language) : t('playAction', language)} className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center hover:scale-110 transition">{isPlaying ? <Pause size={18} fill="white"/> : <Play size={18} fill="white" className="ml-0.5"/>}</button>
          <button onClick={nextTrack} title={t('nextTrack', language)} aria-label={t('nextTrack', language)} className="text-gray-400 hover:text-white transition"><SkipForward size={18} fill="currentColor"/></button>
          <button onClick={toggleRepeat} title={t('repeat', language)} aria-label={t('repeat', language)} className={`transition ${repeatMode !== 'none' ? 'text-pink-500' : 'text-gray-400 hover:text-white'}`}>{repeatMode === 'one' ? <Repeat1 size={16}/> : <Repeat size={16}/>}</button>
        </div>
        <div className="w-full flex items-center gap-2 text-xs text-gray-400">
          <span className="w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
          <div ref={progressRef} onClick={handleProgressClick} className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer group"><div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full relative" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}><div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition"/></div></div>
          <span className="w-10 tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 w-[26%] justify-end">
        <button onClick={onToggleLyrics} className={`p-2 rounded-full transition ${showLyrics ? 'text-pink-300 bg-white/10' : 'text-gray-400 hover:text-white'}`} title={t('openLyrics', language)} aria-label={t('openLyrics', language)}><FileMusic size={18}/></button>
        <button onClick={onOpenQueue} className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10" title={ft('queueTitle', language)} aria-label={ft('queueTitle', language)}><ListMusic size={18}/></button>
        <button onClick={() => { ensureAudioGraph(); setShowEqualizer(true); }} className={`p-2 rounded-full hover:bg-white/10 ${eqGains.some(gain => gain !== 0) ? 'text-purple-300' : 'text-gray-400 hover:text-white'}`} title={ft('equalizer', language)} aria-label={ft('equalizer', language)}><SlidersHorizontal size={18}/></button>
        <button onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-white transition p-2" title={t('uploadMusic', language)}><Upload size={16}/></button>
        <button onClick={toggleMute} title={isMuted || volume === 0 ? t('unmuteVolume', language) : t('muteVolume', language)} aria-label={isMuted || volume === 0 ? t('unmuteVolume', language) : t('muteVolume', language)} className="text-gray-400 hover:text-white transition p-1">{isMuted || volume === 0 ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button>
        <div className="hidden sm:block w-20 h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer relative group"><input type="range" aria-label={t('volume', language)} min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={event => setVolume(parseFloat(event.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/><div className="h-full bg-white/50 rounded-full transition-all" style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}/></div>
      </div>
    </div>
    {showEqualizer && <EqualizerPanel language={language} gains={eqGains} onChange={setEqGains} supported={eqSupported} onClose={() => setShowEqualizer(false)}/>}
    {showNowPlaying && <NowPlayingModal language={language} onClose={() => setShowNowPlaying(false)} onSeek={time => { const audio = getActiveAudio(); if (audio) audio.currentTime = time; setCurrentTime(time); }} onLyrics={() => { setShowNowPlaying(false); onToggleLyrics(); }}/>} 
  </>;
}
