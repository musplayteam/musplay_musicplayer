import React from 'react';
import { X, Play, Pause, SkipBack, SkipForward, Heart, FileMusic } from 'lucide-react';
import usePlayerStore from '../store/playerStore';
import { ft } from '../feature-i18n';
import { t } from '../i18n';

export default function NowPlayingModal({ language = 'ru', onClose, onLyrics, onSeek = () => {} }) {
  const { currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, favorites, toggleFavorite, currentTime, duration } = usePlayerStore();
  if (!currentTrack) return null;
  const progress = duration > 0 ? Math.min(100, currentTime / duration * 100) : 0;
  const format = n => `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, '0')}`;
  const liked = favorites.some(item => item.id === currentTrack.id);
  return <div className="fixed inset-0 z-[75] bg-[#09050f]/95 backdrop-blur-2xl flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-label={ft('nowPlaying', language)}>
    <button onClick={onClose} className="absolute top-6 right-6 p-3 rounded-full bg-white/5 hover:bg-white/10 text-gray-300" aria-label={ft('cancel', language)}><X size={20}/></button>
    <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8 items-center">
      <div className="aspect-square w-full max-w-[430px] mx-auto rounded-3xl overflow-hidden bg-gradient-to-br from-purple-600/40 to-pink-500/20 border border-white/10 shadow-2xl shadow-purple-950/40 flex items-center justify-center">
        {currentTrack.cover ? <img src={currentTrack.cover} alt={t('coverAlt', language)} className="w-full h-full object-cover"/> : <span className="text-8xl">🎵</span>}
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[.22em] text-purple-300 mb-3">{ft('nowPlaying', language)}</p>
        <h1 className="text-3xl md:text-4xl font-bold leading-tight break-words">{currentTrack.title || t('noTitle', language)}</h1>
        <p className="text-lg text-gray-400 mt-3">{currentTrack.artist || t('unknownArtist', language)}</p>
        {currentTrack.album && <p className="text-sm text-gray-500 mt-1">{currentTrack.album}</p>}
        <div className="mt-9">
          <input aria-label={ft('seek', language)} type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={event => onSeek(Number(event.target.value))} className="w-full h-1.5 mt-1 accent-purple-400 cursor-pointer" style={{ background: `linear-gradient(to right, #d946ef ${progress}%, rgba(255,255,255,.12) ${progress}%)` }}/>
          <div className="flex justify-between text-xs text-gray-500 mt-2 tabular-nums"><span>{format(currentTime)}</span><span>{format(duration)}</span></div>
        </div>
        <div className="flex items-center justify-center gap-7 mt-8">
          <button onClick={prevTrack} className="text-gray-300 hover:text-white"><SkipBack size={25} fill="currentColor"/></button>
          <button onClick={togglePlay} className="w-16 h-16 rounded-full bg-pink-500 hover:bg-pink-400 text-white flex items-center justify-center shadow-lg shadow-pink-900/30">{isPlaying ? <Pause size={26} fill="currentColor"/> : <Play size={26} fill="currentColor"/>}</button>
          <button onClick={nextTrack} className="text-gray-300 hover:text-white"><SkipForward size={25} fill="currentColor"/></button>
        </div>
        <div className="flex justify-center gap-3 mt-7">
          <button onClick={() => toggleFavorite(currentTrack)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 ${liked ? 'text-pink-300 bg-pink-500/10' : 'text-gray-300 hover:bg-white/5'}`}><Heart size={16} fill={liked ? 'currentColor' : 'none'}/>{t('likeTrack', language)}</button>
          <button onClick={onLyrics} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5"><FileMusic size={16}/>{t('openLyrics', language)}</button>
        </div>
      </div>
    </div>
  </div>;
}
