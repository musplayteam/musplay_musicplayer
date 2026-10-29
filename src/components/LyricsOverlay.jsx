import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, RefreshCw, Loader2, FileMusic, SkipBack, SkipForward, Play, Pause, Shuffle, Repeat, Repeat1, Heart, ExternalLink, Music } from 'lucide-react';
import usePlayerStore from '../store/playerStore';
import { findLyrics } from '../store/lyricsService';
import { t, translateLyricsServiceMessage, translateLyricsSourceName } from '../i18n';

export default function LyricsOverlay({ open, onClose, onOpenSearch, language = 'ru' }) {
  const [lyrics, setLyrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const activeLineRef = useRef(null);
  const { currentTrack, currentTime, isPlaying, togglePlay, nextTrack, prevTrack, toggleShuffle, toggleRepeat, repeatMode, isShuffle, favorites, toggleFavorite } = usePlayerStore();

  useEffect(() => {
    if (!open || !currentTrack) {
      setLyrics(null);
      setError('');
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLyrics(null);
    setError('');
    setLoading(true);
    findLyrics(currentTrack, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setLyrics(result);
        if (result.status !== 'ok') setError(result.message || t('lyricsNotFoundGeneric', 'ru'));
      })
      .catch(err => {
        if (!controller.signal.aborted && err?.name !== 'AbortError') setError('Не удалось загрузить текст песни.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, currentTrack?.id, currentTrack?.title, currentTrack?.artist, currentTrack?.album, currentTrack?.duration, retry]);

  const activeLineIndex = useMemo(() => lyrics?.lines?.reduce((active, line, index) => line.time <= currentTime ? index : active, -1) ?? -1, [lyrics, currentTime]);

  useEffect(() => {
    if (!open || activeLineIndex < 0) return;
    activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [open, activeLineIndex]);

  if (!open) return null;
  const isFavorite = currentTrack && favorites.some(track => track.id === currentTrack.id);

  return (
    <section className="fixed inset-x-0 top-12 bottom-20 z-40 overflow-hidden bg-[#180b1a]/[0.97] text-white backdrop-blur-2xl animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_20%,rgba(128,30,40,0.32),transparent_48%),radial-gradient(ellipse_at_80%_75%,rgba(90,42,115,0.24),transparent_48%)] pointer-events-none" />
      <div className="relative h-full min-h-0 flex flex-col">
        <header className="shrink-0 h-14 flex items-center justify-between px-6 md:px-10 border-b border-white/[0.07]">
          <div className="flex items-center gap-3"><FileMusic size={19} className="text-pink-300"/><span className="text-sm font-semibold tracking-wide">{t('lyricsOverlayTitle', language)}</span><span className="hidden sm:inline text-xs text-white/35">{t('syncedToPlayback', language)}</span></div>
          <div className="flex items-center gap-2">
            <button onClick={() => setRetry(value => value + 1)} title={t('refreshLyrics', language)} className="rounded-full p-2 text-white/55 hover:bg-white/10 hover:text-white transition"><RefreshCw size={17}/></button>
            <button onClick={onClose} title={t('closeLyrics', language)} className="rounded-full p-2 text-white/65 hover:bg-white/10 hover:text-white transition"><X size={19}/></button>
          </div>
        </header>

        {!currentTrack ? <div className="flex-1 grid place-items-center text-white/50"><div className="text-center"><Music size={36} className="mx-auto mb-3"/><p>{t('playTrackToSeeLyrics', language)}</p></div></div> : (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.2fr)] gap-6 lg:gap-12 px-6 py-6 md:px-10 md:py-8 overflow-y-auto">
            <div className="flex flex-col items-center justify-center min-w-0">
              <div className="relative group w-[min(58vw,330px)] lg:w-full lg:max-w-[340px] aspect-square rounded-2xl overflow-hidden bg-[#3d1218] shadow-[0_24px_80px_rgba(0,0,0,0.38)] ring-1 ring-white/10">
                {currentTrack.cover ? <img src={currentTrack.cover} alt={t('coverAlt', language)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.035]"/> : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#7f1520] to-[#27112d]"><Music size={70} className="text-white/45"/></div>}
                <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-5">
                  <div className="flex items-center gap-3">
                    <button onClick={toggleShuffle} title={t('shuffle', language)} className={`w-10 h-10 rounded-full bg-black/55 flex items-center justify-center transition hover:bg-black/80 ${isShuffle ? 'text-pink-300' : 'text-white/75'}`}><Shuffle size={18}/></button>
                    <button onClick={prevTrack} title={t('previousTrack', language)} className="w-10 h-10 rounded-full bg-black/55 text-white/85 flex items-center justify-center transition hover:bg-black/80"><SkipBack size={18} fill="currentColor"/></button>
                    <button onClick={togglePlay} title={isPlaying ? t('pause', language) : t('playAction', language)} className="w-14 h-14 rounded-full bg-yellow-300 text-black flex items-center justify-center shadow-xl transition-transform hover:scale-105">{isPlaying ? <Pause size={23} fill="currentColor"/> : <Play size={23} fill="currentColor" className="ml-0.5"/>}</button>
                    <button onClick={nextTrack} title={t('nextTrack', language)} className="w-10 h-10 rounded-full bg-black/55 text-white/85 flex items-center justify-center transition hover:bg-black/80"><SkipForward size={18} fill="currentColor"/></button>
                    <button onClick={toggleRepeat} title={t('repeat', language)} className={`w-10 h-10 rounded-full bg-black/55 flex items-center justify-center transition hover:bg-black/80 ${repeatMode !== 'none' ? 'text-pink-300' : 'text-white/75'}`}>{repeatMode === 'one' ? <Repeat1 size={18}/> : <Repeat size={18}/>}</button>
                  </div>
                  <button onClick={() => toggleFavorite(currentTrack)} title={isFavorite ? t('removeFromLiked', language) : t('likeTrack', language)} className={`flex items-center gap-2 rounded-full px-4 py-2 bg-black/55 hover:bg-black/80 transition ${isFavorite ? 'text-pink-300' : 'text-white/80'}`}><Heart size={18} fill={isFavorite ? 'currentColor' : 'none'}/><span className="text-sm">{isFavorite ? t('inLikedSongs', language) : t('likeTrack', language)}</span></button>
                </div>
                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/65 to-transparent opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none"><p className="text-xs uppercase tracking-[0.2em] text-white/60">{t('currentlyPlaying', language)}</p></div>
              </div>
              <div className="w-full max-w-[340px] mt-5 text-center lg:text-left">
                <h2 className="text-xl md:text-2xl font-bold tracking-tight truncate">{currentTrack.title || t('noTitleFallback', language)}</h2>
                <p className="mt-1 text-sm md:text-base text-white/55 truncate">{currentTrack.artist || t('unknownArtist', language)}</p>
                <p className="mt-4 text-xs text-white/35">{translateLyricsSourceName(lyrics?.sourceName, language) || (loading ? t('lyricsSourceLoading', language) : t('songLyrics', language))}</p>
                {lyrics?.sourceUrl && <a href={lyrics.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs text-pink-200/70 hover:text-pink-100 transition">{t('openSource', language)} <ExternalLink size={12}/></a>}
                {lyrics?.localPath && <p className="mt-2 text-[11px] text-white/30 break-all">{t('localCopy', language)} {lyrics.localPath}</p>}
              </div>
            </div>

            <div className="min-h-[320px] min-w-0 flex flex-col justify-center lg:pl-3">
              {loading ? <div className="py-16 text-center text-white/55"><Loader2 size={26} className="animate-spin mx-auto mb-4 text-pink-200"/><p>{t('searchingLyricsInMusixmatch', language)}</p></div>
                : error ? <div className="py-16 text-center lg:text-left"><p className="text-2xl md:text-3xl font-bold leading-snug text-white/75">{translateLyricsServiceMessage(error, language)}</p><button onClick={() => setRetry(value => value + 1)} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm hover:bg-white/15 transition"><RefreshCw size={15}/>{t('retrySearch', language)}</button></div>
                : lyrics?.lines?.length ? <div className="max-h-full overflow-y-auto py-10 pr-3 space-y-5 text-left scroll-smooth">
                    {lyrics.lines.map((line, index) => <p key={`${line.time}-${index}`} ref={index === activeLineIndex ? activeLineRef : null} className={`origin-left text-2xl md:text-3xl xl:text-[2.5rem] font-extrabold leading-[1.18] tracking-tight transition-all duration-300 ${index === activeLineIndex ? 'text-white opacity-100 scale-[1.015]' : index < activeLineIndex ? 'text-white/38' : 'text-white/55 hover:text-white/75'}`}>
                      {line.words?.length ? line.words.map((word, wordIndex) => { const nextWord = line.words[wordIndex + 1]; const activeWord = index === activeLineIndex && currentTime >= word.time && (!nextWord || currentTime < nextWord.time); return <React.Fragment key={`${word.time}-${wordIndex}`}><span className={activeWord ? 'text-pink-200' : ''}>{word.text}</span>{wordIndex < line.words.length - 1 ? ' ' : ''}</React.Fragment>; }) : (line.text || '♪')}
                    </p>)}
                  </div>
                : <div className="py-16 text-center lg:text-left"><p className="text-2xl md:text-3xl font-bold leading-snug text-white/60">{t('noLyricsForSong', language)}</p><p className="mt-3 text-sm text-white/35">{t('searchLyricsInstruction', language)}</p><button onClick={onOpenSearch || onClose} className="mt-5 rounded-full bg-white/10 px-4 py-2.5 text-sm hover:bg-white/15 transition">{t('goToLyricsSearch', language)}</button></div>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
