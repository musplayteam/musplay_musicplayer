import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Trash2, Music, Search, Heart, Library, Clock3, Disc3, Users, ListMusic, ArrowLeft, FileMusic, RefreshCw, Loader2, FolderOpen, CheckCircle2 } from 'lucide-react';
import usePlayerStore from '../store/playerStore';
import { findLyrics, searchLyricsOnline } from '../store/lyricsService';

export default function MainContent({ currentView, selectedPlaylistId, setCurrentView }) {
  const [query, setQuery] = useState('');
  const [lyrics, setLyrics] = useState(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState('');
  const [lyricsRetry, setLyricsRetry] = useState(0);
  const [lyricsSearchTitle, setLyricsSearchTitle] = useState('');
  const [lyricsSearchArtist, setLyricsSearchArtist] = useState('');
  const [lyricsSearchResults, setLyricsSearchResults] = useState([]);
  const [lyricsSearchLoading, setLyricsSearchLoading] = useState(false);
  const [lyricsSearchError, setLyricsSearchError] = useState('');
  const [lyricsSaveMessage, setLyricsSaveMessage] = useState('');
  const [lyricsFolder, setLyricsFolder] = useState('Documents/MusPlay/Синхронный текст');
  const activeLineRef = useRef(null);
  const { currentTrack, currentTime, playlists, library, queue, favorites, history, playTrack, toggleFavorite, setQueueAndPlay, removeTrackFromPlaylist, deletePlaylist } = usePlayerStore();
  const playlist = playlists.find(item => item.id === selectedPlaylistId);

  useEffect(() => {
    if (currentView !== 'lyrics' || !currentTrack) return undefined;
    const controller = new AbortController();
    setLyrics(null);
    setLyricsError('');
    setLyricsLoading(true);
    findLyrics(currentTrack, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setLyrics(result);
      if (result.status !== 'ok') setLyricsError(result.message || 'Текст не найден.');
    }).catch(error => {
      if (error?.name !== 'AbortError') setLyricsError('Не удалось загрузить текст песни.');
    }).finally(() => { if (!controller.signal.aborted) setLyricsLoading(false); });
    return () => controller.abort();
  }, [currentView, currentTrack?.id, lyricsRetry]);

  useEffect(() => {
    if (currentView !== 'lyrics') return;
    if (currentTrack) {
      setLyricsSearchTitle(currentTrack.title || '');
      setLyricsSearchArtist(currentTrack.artist || '');
    }
    window.electronAPI?.getLyricsFolder?.().then(path => { if (path) setLyricsFolder(path); }).catch(() => {});
  }, [currentView, currentTrack?.id]);

  const runLyricsSearch = async (event) => {
    event?.preventDefault?.();
    setLyricsSearchLoading(true); setLyricsSearchError(''); setLyricsSaveMessage(''); setLyricsSearchResults([]);
    const controller = new AbortController();
    try {
      const results = await searchLyricsOnline(lyricsSearchTitle, lyricsSearchArtist, controller.signal);
      setLyricsSearchResults(results);
      if (!results.length) setLyricsSearchError('Синхронизированный текст не найден. Попробуй уточнить название или исполнителя.');
    } catch (error) {
      setLyricsSearchError(error?.name === 'AbortError' ? '' : 'Не удалось выполнить поиск. Проверь подключение к интернету.');
    } finally { setLyricsSearchLoading(false); }
  };

  const saveLyricsResult = async (result) => {
    const bridge = window.electronAPI;
    if (typeof bridge?.saveSyncedLyrics !== 'function') { setLyricsSaveMessage('Сохранение доступно только в установленном приложении MusPlay.'); return; }
    setLyricsSaveMessage('Сохраняю текст…');
    try {
      const saved = await bridge.saveSyncedLyrics({
        trackName: result.trackName, artistName: result.artistName, albumName: result.albumName,
        syncedLyrics: result.syncedLyrics, sourceName: result.sourceName, sourceUrl: result.sourceUrl, copyright: result.copyright || '',
      });
      const norm = value => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const isCurrentTrack = currentTrack && norm(currentTrack.title) === norm(result.trackName) && norm(currentTrack.artist) === norm(result.artistName);
      if (isCurrentTrack) {
        setLyrics({ ...result, sourceName: 'MusPlay · локально сохранено', sourceUrl: result.sourceUrl, localPath: saved.path, savedAt: saved.savedAt });
      }
      setLyricsSaveMessage(`Сохранено: ${saved.path}`);
    } catch (error) { setLyricsSaveMessage(error?.message || 'Не удалось сохранить текст.'); }
  };

  const allLocalTracks = useMemo(() => {
    const seen = new Set();
    return [...library, ...queue].filter(track => {
      if (!track?.isLocal || seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }, [library, queue]);

  const activeLineIndex = lyrics?.lines?.reduce((active, line, index) => line.time <= currentTime ? index : active, -1) ?? -1;
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeLineIndex, currentView]);

  if (currentView === 'playlist') {
    if (!playlist) return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain"><EmptyState text="Плейлист не найден."/><button onClick={() => setCurrentView('home')} className="mt-3 text-purple-300">На главную</button></main>;
    const tracks = playlist.tracks.map(track => ({ ...track, ...(library.find(item => item.id === track.id) || {}) }));
    return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain"><button onClick={() => setCurrentView('home')} className="mb-6 flex items-center gap-2 text-gray-400 hover:text-white"><ArrowLeft size={17}/> Назад</button><div className="flex items-center gap-4 mb-6"><div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center"><ListMusic size={34}/></div><div><p className="text-xs uppercase text-gray-400">Локальный плейлист</p><h1 className="text-3xl font-bold">{playlist.name}</h1><p className="text-sm text-gray-400">{tracks.length} треков</p></div></div><div className="flex gap-2 mb-5"><button onClick={() => setQueueAndPlay(tracks.filter(t => t.url), 0)} disabled={!tracks.some(t => t.url)} className="px-5 py-2 rounded-full bg-pink-500 disabled:opacity-40 flex items-center gap-2"><Play size={16} fill="currentColor"/>Слушать</button><button onClick={() => { if (window.confirm('Удалить плейлист?')) { deletePlaylist(playlist.id); setCurrentView('home'); } }} className="px-4 py-2 rounded-full bg-white/5 hover:bg-red-500/20"><Trash2 size={16}/></button></div><TrackList tracks={tracks} favorites={favorites} onPlay={playTrack} onFavorite={toggleFavorite} onRemove={track => removeTrackFromPlaylist(playlist.id, track.id)}/></main>;
  }

  if (currentView === 'lyrics') {
    return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain">
      <div className="flex items-center gap-3 mb-2"><FileMusic size={24} className="text-pink-300"/><h1 className="text-3xl font-bold">Текст песни</h1></div>
      <p className="text-sm text-gray-400 mb-6">Текст ищется автоматически, а найденные синхронизации можно сохранить в локальную папку и использовать без интернета.</p>

      <section className="max-w-3xl mx-auto mb-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="flex items-center gap-2 mb-3"><Search size={18} className="text-pink-300"/><h2 className="font-semibold">Найти синхронизированный текст</h2></div>
        <form onSubmit={runLyricsSearch} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
          <input value={lyricsSearchTitle} onChange={e => setLyricsSearchTitle(e.target.value)} placeholder="Название песни" className="min-w-0 bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400/60" />
          <input value={lyricsSearchArtist} onChange={e => setLyricsSearchArtist(e.target.value)} placeholder="Исполнитель" className="min-w-0 bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400/60" />
          <button type="submit" disabled={lyricsSearchLoading || !lyricsSearchTitle.trim()} className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-sm font-semibold flex items-center justify-center gap-2">{lyricsSearchLoading ? <Loader2 size={16} className="animate-spin"/> : <Search size={16}/>}Найти</button>
        </form>
        <div className="mt-3 flex items-start gap-2 text-xs text-gray-500"><FolderOpen size={14} className="mt-0.5 shrink-0"/><span>Выбранный текст сохраняется в <span className="text-gray-300 break-all">{lyricsFolder}</span>. Нажми на всю строку результата, чтобы сохранить.</span></div>
        {lyricsSearchError && <p className="mt-3 text-sm text-amber-300">{lyricsSearchError}</p>}
        {lyricsSaveMessage && <p className="mt-3 text-sm text-emerald-300 break-all">{lyricsSaveMessage}</p>}
        {lyricsSearchResults.length > 0 && <div className="mt-4 rounded-xl border border-white/10 overflow-hidden">{lyricsSearchResults.map((result, index) => <button type="button" key={`${result.sourceName}-${result.trackName}-${result.artistName}-${index}`} onClick={() => saveLyricsResult(result)} className="w-full text-left flex items-center gap-3 p-3 border-b border-white/5 last:border-0 hover:bg-purple-500/15 focus:outline-none focus:bg-purple-500/15 transition-colors"><div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600/70 to-pink-500/50 flex items-center justify-center shrink-0"><FileMusic size={18}/></div><div className="min-w-0 flex-1"><p className="font-medium text-sm truncate">{result.trackName}</p><p className="text-xs text-gray-400 truncate">{result.artistName}{result.albumName ? ` · ${result.albumName}` : ''}</p><p className="text-[11px] text-purple-300 mt-1">{result.sourceName} · синхронизированный текст</p></div><span className="text-xs text-gray-500 shrink-0">Сохранить</span></button>)}</div>}
      </section>

      {!currentTrack ? <EmptyState text="Сначала включи локальный трек."/> : <div className="max-w-3xl mx-auto rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-10">
        <div className="flex items-center gap-4 mb-8">
          {currentTrack.cover ? <img src={currentTrack.cover} alt="Обложка" className="w-16 h-16 rounded-xl object-cover"/> : <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center"><Music size={25}/></div>}
          <div className="min-w-0"><h2 className="font-bold text-xl truncate">{currentTrack.title}</h2><p className="text-gray-400 truncate">{currentTrack.artist}</p></div>
          <button onClick={() => { setLyrics(null); setLyricsError(''); setLyricsRetry(value => value + 1); }} className="p-2 text-gray-400 hover:text-white" title="Обновить текст"><RefreshCw size={17}/></button>
        </div>
        {lyricsLoading ? <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto mb-3"/>Ищем синхронизированный текст в Musixmatch…</div>
          : lyricsError ? <div className="py-12 text-center"><p className="text-gray-300 mb-2">{lyricsError}</p><p className="text-xs text-gray-500">Сначала проверяется Musixmatch, затем дополнительные источники синхронизации.</p><button onClick={() => { setLyrics(null); setLyricsError(''); setLyricsRetry(value => value + 1); }} className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm">Повторить поиск</button></div>
          : lyrics?.lines?.length ? <div className="max-h-[52vh] overflow-y-auto space-y-3 text-center py-2">{lyrics.lines.map((line, index) => <p key={`${line.time}-${index}`} ref={index === activeLineIndex ? activeLineRef : null} className={`text-lg md:text-xl font-semibold transition-all duration-300 ${index === activeLineIndex ? 'text-white scale-[1.02]' : 'text-white/35'}`}>{line.words?.length ? line.words.map((word, wordIndex) => { const nextWord = line.words[wordIndex + 1]; const isActiveWord = index === activeLineIndex && currentTime >= word.time && (!nextWord || currentTime < nextWord.time); return <React.Fragment key={`${word.time}-${wordIndex}`}><span className={isActiveWord ? 'text-pink-300' : ''}>{word.text}</span>{wordIndex < line.words.length - 1 ? ' ' : ''}</React.Fragment>; }) : (line.text || '♪')}</p>)}</div>
          : <div className="py-10 text-center"><EmptyState text="Синхронизированный текст не найден в доступных источниках."/><button onClick={() => { setLyrics(null); setLyricsError(''); setLyricsRetry(value => value + 1); }} className="mt-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm">Повторить поиск</button></div>}
        {lyrics?.copyright && <p className="mt-5 text-xs text-gray-500">Авторские права: {lyrics.copyright}</p>}
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-col gap-2 text-xs text-gray-500"><div className="flex items-center justify-between gap-3"><span>{lyrics?.syncType === 'richsync' ? 'Расширенная синхронизация' : 'Построчная синхронизация'}</span>{lyrics?.localPath ? <span className="text-emerald-300 flex items-center gap-1"><CheckCircle2 size={13}/>Сохранено локально</span> : <a href={lyrics?.sourceUrl || 'https://www.musixmatch.com/'} target="_blank" rel="noreferrer" className="text-purple-300 hover:text-purple-200">Источник: {lyrics?.sourceName || 'каталог текстов'} ↗</a>}</div>{lyrics?.localPath && <p className="break-all text-gray-400">Файл: {lyrics.localPath}{lyrics?.sourceUrl ? <> · <a href={lyrics.sourceUrl} target="_blank" rel="noreferrer" className="text-purple-300 hover:text-purple-200">Источник оригинала ↗</a></> : null}</p>}</div>
      </div>}
    </main>;
  }

  if (currentView === 'home') {
    return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain"><div className="mb-8"><p className="text-sm text-purple-300 mb-2">MUSPLAY · ЛОКАЛЬНЫЙ ПЛЕЕР</p><h1 className="text-3xl md:text-4xl font-bold mb-2">Твоя музыка. Без лишнего.</h1><p className="text-gray-400">Вся коллекция, плейлисты и синхронизированный текст — в одном месте.</p></div><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8"><DashboardCard title="Моя музыка" subtitle={`${library.length} треков`} icon={Library} onClick={() => setCurrentView('library')}/><DashboardCard title="Плейлисты" subtitle={`${playlists.length} подборок`} icon={ListMusic} onClick={() => setCurrentView('playlists')}/><DashboardCard title="Текст песни" subtitle={currentTrack?.title || 'Включи трек'} icon={FileMusic} onClick={() => setCurrentView('lyrics')}/></div><div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold">Недавно добавленные</h2><button onClick={() => setCurrentView('library')} className="text-sm text-purple-300 hover:text-white">Вся библиотека →</button></div><TrackList tracks={[...library].slice(-8).reverse()} favorites={favorites} onPlay={playTrack} onFavorite={toggleFavorite}/>{!library.length && <EmptyState text="Добавь локальные аудиофайлы кнопкой «Добавить музыку» в очереди."/>}</main>;
  }

  if (currentView === 'playlists') return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain"><h1 className="text-3xl font-bold mb-2">Мои плейлисты</h1><p className="text-sm text-gray-400 mb-6">Создавай собственные подборки из локальных треков через боковую панель.</p>{playlists.length ? <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{playlists.map(pl => <button key={pl.id} onClick={() => { /* playlist is opened by sidebar selection */ }} className="text-left p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10"><ListMusic className="text-purple-300 mb-4" size={25}/><p className="font-semibold">{pl.name}</p><p className="text-sm text-gray-400">{pl.tracks.length} треков</p></button>)}</div> : <EmptyState text="Создай первый плейлист кнопкой + рядом с заголовком «Плейлисты»."/>}</main>;

  const sourceTracks = currentView === 'favorites' ? favorites : currentView === 'history' ? history : allLocalTracks;
  const filtered = sourceTracks.filter(track => `${track.title || ''} ${track.artist || ''} ${track.album || ''} ${track.fileName || ''}`.toLowerCase().includes(query.toLowerCase().trim()));
  const titles = { library: 'Моя музыка', favorites: 'Мне нравится', history: 'История', artists: 'Исполнители', albums: 'Альбомы', search: 'Поиск по библиотеке' };
  const groups = currentView === 'artists' ? [...new Set(filtered.map(track => track.artist || 'Неизвестный исполнитель'))].map(name => ({ name, tracks: filtered.filter(track => (track.artist || 'Неизвестный исполнитель') === name) })) : currentView === 'albums' ? [...new Set(filtered.map(track => track.album || 'Без альбома'))].map(name => ({ name, tracks: filtered.filter(track => (track.album || 'Без альбома') === name) })) : [];
  const playList = tracks => { const playable = tracks.filter(track => track.url); if (playable.length) setQueueAndPlay(playable, 0); };
  return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain"><div className="flex items-center gap-3 mb-2"><Search size={24} className="text-purple-300"/><h1 className="text-3xl font-bold">{titles[currentView] || 'Моя музыка'}</h1></div><p className="text-sm text-gray-400 mb-6">{sourceTracks.length} композиций · поиск работает по локальной коллекции</p><div className="relative mb-6 max-w-2xl"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти трек, исполнителя, альбом или имя файла" className="w-full bg-white/[0.045] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-purple-400/60 text-white"/></div>{currentView === 'artists' || currentView === 'albums' ? groups.length ? <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{groups.map(group => <button key={group.name} onClick={() => playList(group.tracks)} className="text-left rounded-2xl p-4 bg-white/[0.045] hover:bg-white/[0.08] border border-white/5"><div className="w-full aspect-square rounded-xl bg-gradient-to-br from-violet-600/60 to-fuchsia-500/30 flex items-center justify-center mb-4 overflow-hidden">{group.tracks[0]?.cover ? <img src={group.tracks[0].cover} alt="" className="w-full h-full object-cover"/> : currentView === 'artists' ? <Users size={40}/> : <Disc3 size={40}/>}</div><p className="font-semibold truncate">{group.name}</p><p className="text-xs text-gray-400 mt-1">{group.tracks.length} тр.</p></button>)}</div> : <EmptyState text="Пока нет данных для группировки. Добавь музыку с тегами исполнителя и альбома."/> : <><button onClick={() => playList(filtered)} disabled={!filtered.some(track => track.url)} className="mb-4 px-5 py-2.5 rounded-full bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-sm font-semibold flex items-center gap-2"><Play size={16} fill="currentColor"/>Слушать всё</button><TrackList tracks={filtered} favorites={favorites} onPlay={playTrack} onFavorite={toggleFavorite}/>{!filtered.length && <EmptyState text={query ? 'Ничего не найдено в локальной библиотеке.' : 'Добавь музыкальные файлы через кнопку загрузки.'}/>}</>}</main>;
}

function TrackList({ tracks, favorites = [], onPlay, onFavorite, onRemove }) {
  return <div className="rounded-2xl border border-white/[0.07] overflow-hidden">{tracks.map((track, index) => <div key={`${track.id}-${index}`} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.045] group"><button onClick={() => track.url && onPlay(track)} disabled={!track.url} title="Воспроизвести" className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600/70 to-pink-500/50 overflow-hidden flex items-center justify-center shrink-0 disabled:opacity-40">{track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover"/> : <Play size={15} fill="currentColor"/>}</button><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{track.title || 'Без названия'}</p><p className="text-xs text-gray-400 truncate">{track.artist || 'Неизвестный исполнитель'}{track.album ? ` · ${track.album}` : ''}</p></div>{onFavorite && <button onClick={() => onFavorite(track)} title="Мне нравится" className={`p-2 ${favorites.some(item => item.id === track.id) ? 'text-pink-400' : 'text-gray-500 opacity-0 group-hover:opacity-100 hover:text-pink-300'}`}><Heart size={17} fill={favorites.some(item => item.id === track.id) ? 'currentColor' : 'none'}/></button>}{onRemove && <button onClick={() => onRemove(track)} title="Убрать из плейлиста" className="p-2 text-gray-500 hover:text-red-400"><Trash2 size={16}/></button>}<span className="text-xs text-gray-500 w-8 text-right">{track.duration ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}` : ''}</span></div>)}</div>;
}
function DashboardCard({ title, subtitle, icon: Icon, onClick }) { return <button onClick={onClick} className="text-left rounded-2xl p-5 bg-white/[0.045] hover:bg-white/[0.08] border border-white/5 transition"><Icon size={24} className="text-purple-300 mb-5"/><p className="font-semibold">{title}</p><p className="text-sm text-gray-400 truncate mt-1">{subtitle}</p></button>; }
function EmptyState({ text }) { return <div className="py-16 px-6 text-center text-gray-400"><Music size={34} className="mx-auto mb-3 text-purple-300/70"/><p className="text-sm">{text}</p></div>; }
