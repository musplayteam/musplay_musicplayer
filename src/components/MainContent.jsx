import { useEffect, useMemo, useState } from 'react';
import { Play, Trash2, Music, Search, Heart, Library, Clock3, Disc3, Users, ListMusic, ArrowLeft, FileMusic, Loader2, FolderOpen, CheckCircle2 } from 'lucide-react';
import usePlayerStore from '../store/playerStore';
import { searchLyricsOnline } from '../store/lyricsService';
import SettingsPage from './SettingsPage';
import { t, trackCount, translateLyricsServiceMessage } from '../i18n';

export default function MainContent({ currentView, selectedPlaylistId, setCurrentView, language, setLanguage, theme, setTheme, appVersion, onCheckUpdates, updateState }) {
  const [query, setQuery] = useState('');
  const [lyricsSearchTitle, setLyricsSearchTitle] = useState('');
  const [lyricsSearchArtist, setLyricsSearchArtist] = useState('');
  const [lyricsSearchResults, setLyricsSearchResults] = useState([]);
  const [lyricsSearchLoading, setLyricsSearchLoading] = useState(false);
  const [lyricsSearchError, setLyricsSearchError] = useState('');
  const [lyricsSaveMessage, setLyricsSaveMessage] = useState(null);
  const [lyricsFolder, setLyricsFolder] = useState('Documents/MusPlay/Синхронный текст');
  const { currentTrack, playlists, library, queue, favorites, history, playTrack, toggleFavorite, setQueueAndPlay, removeTrackFromPlaylist, deletePlaylist } = usePlayerStore();
  const playlist = playlists.find(item => item.id === selectedPlaylistId);

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
    setLyricsSearchLoading(true); setLyricsSearchError(''); setLyricsSaveMessage(null); setLyricsSearchResults([]);
    const controller = new AbortController();
    try {
      const results = await searchLyricsOnline(lyricsSearchTitle, lyricsSearchArtist, controller.signal);
      setLyricsSearchResults(results);
      if (!results.length) setLyricsSearchError('noSyncedLyricsSearch');
    } catch (error) {
      setLyricsSearchError(error?.name === 'AbortError' ? '' : 'lyricsSearchFailed');
    } finally { setLyricsSearchLoading(false); }
  };

  const saveLyricsResult = async (result) => {
    const bridge = window.electronAPI;
    if (typeof bridge?.saveSyncedLyrics !== 'function') { setLyricsSaveMessage({ key: 'lyricsSaveDesktopOnly' }); return; }
    setLyricsSaveMessage({ key: 'savingLyrics' });
    try {
      const saved = await bridge.saveSyncedLyrics({
        trackName: result.trackName, artistName: result.artistName, albumName: result.albumName,
        syncedLyrics: result.syncedLyrics, sourceName: result.sourceName, sourceUrl: result.sourceUrl, copyright: result.copyright || '',
      });
      setLyricsSaveMessage({ key: 'lyricsSavedOffline', values: { path: saved.path } });
    } catch (error) { setLyricsSaveMessage(error?.message ? { text: error.message } : { key: 'lyricsSaveFailed' }); }
  };

  const allLocalTracks = useMemo(() => {
    const seen = new Set();
    return [...library, ...queue].filter(track => {
      if (!track?.isLocal || seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }, [library, queue]);

  if (currentView === 'settings') return <SettingsPage language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme} appVersion={appVersion} onCheckUpdates={onCheckUpdates} updateState={updateState} />;

  if (currentView === 'playlist') {
    if (!playlist) return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain"><EmptyState text={t('playlistNotFound', language)}/><button onClick={() => setCurrentView('home')} className="mt-3 text-purple-300">{t('goHome', language)}</button></main>;
    const tracks = playlist.tracks.map(track => ({ ...track, ...(library.find(item => item.id === track.id) || {}) }));
    return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain"><button onClick={() => setCurrentView('home')} className="mb-6 flex items-center gap-2 text-gray-400 hover:text-white"><ArrowLeft size={17}/> {t('back', language)}</button><div className="flex items-center gap-4 mb-6"><div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center"><ListMusic size={34}/></div><div><p className="text-xs uppercase text-gray-400">{t('localPlaylist', language)}</p><h1 className="text-3xl font-bold">{playlist.name}</h1><p className="text-sm text-gray-400">{trackCount(tracks.length, language)}</p></div></div><div className="flex gap-2 mb-5"><button onClick={() => setQueueAndPlay(tracks.filter(t => t.url), 0)} disabled={!tracks.some(t => t.url)} className="px-5 py-2 rounded-full bg-pink-500 disabled:opacity-40 flex items-center gap-2"><Play size={16} fill="currentColor"/>{t('play', language)}</button><button onClick={() => { if (window.confirm(t('deletePlaylistConfirm', language))) { deletePlaylist(playlist.id); setCurrentView('home'); } }} className="px-4 py-2 rounded-full bg-white/5 hover:bg-red-500/20"><Trash2 size={16}/></button></div><TrackList tracks={tracks} favorites={favorites} onPlay={playTrack} onFavorite={toggleFavorite} onRemove={track => removeTrackFromPlaylist(playlist.id, track.id)} language={language}/></main>;
  }

  if (currentView === 'lyrics') {
    return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500/25 to-pink-500/20 border border-white/10 flex items-center justify-center">
            <FileMusic size={23} className="text-pink-300" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{t('lyricsSearchTitle', language)}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('lyricsSearchDesc', language)}</p>
          </div>
        </div>

        <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.035] p-5 md:p-6 shadow-xl shadow-black/10">
          <div className="flex items-center gap-2 mb-4">
            <Search size={18} className="text-pink-300" />
            <h2 className="font-semibold">{t('findSyncedLyrics', language)}</h2>
          </div>
          <form onSubmit={runLyricsSearch} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2.5">
            <input
              value={lyricsSearchTitle}
              onChange={e => setLyricsSearchTitle(e.target.value)}
              placeholder={t('songTitle', language)}
              aria-label={t('songTitle', language)}
              className="min-w-0 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder:text-gray-500 focus:outline-none focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/10 transition"
            />
            <input
              value={lyricsSearchArtist}
              onChange={e => setLyricsSearchArtist(e.target.value)}
              placeholder={t('artistOptional', language)}
              aria-label={t('artistOptional', language)}
              className="min-w-0 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder:text-gray-500 focus:outline-none focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/10 transition"
            />
            <button
              type="submit"
              disabled={lyricsSearchLoading || !lyricsSearchTitle.trim()}
              className="px-5 py-3 rounded-xl bg-purple-500 hover:bg-purple-400 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold flex items-center justify-center gap-2 transition"
            >
              {lyricsSearchLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {lyricsSearchLoading ? t('searchingEllipsis', language) : t('search', language)}
            </button>
          </form>
          <div className="mt-4 flex items-start gap-2.5 text-xs leading-relaxed text-gray-400">
            <FolderOpen size={15} className="mt-0.5 shrink-0 text-purple-300" />
            <span>{t('lyricsSaveHint', language)} <span className="text-gray-200 break-all">{lyricsFolder}</span>.</span>
          </div>
          {lyricsSaveMessage && <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-3.5 py-3 text-sm text-emerald-200"><CheckCircle2 size={17} className="mt-0.5 shrink-0"/><span className="break-all">{lyricsSaveMessage.key ? t(lyricsSaveMessage.key, language, lyricsSaveMessage.values || {}) : translateLyricsServiceMessage(lyricsSaveMessage.text, language)}</span></div>}
        </section>

        <section className="mt-5 rounded-2xl border border-white/[0.08] bg-black/10 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07]">
            <div>
              <h2 className="font-semibold">{t('lyricsResults', language)}</h2>
              <p className="text-xs text-gray-500 mt-1">{t('lyricsClickSaves', language)}</p>
            </div>
            {lyricsSearchResults.length > 0 && <span className="text-xs text-gray-400 bg-white/[0.06] rounded-full px-2.5 py-1">{lyricsSearchResults.length}</span>}
          </div>

          {lyricsSearchLoading ? (
            <div className="py-14 text-center text-gray-400">
              <Loader2 size={25} className="animate-spin mx-auto mb-3 text-purple-300" />
              <p className="text-sm text-gray-200">{t('searchingEllipsis', language)}</p>
              <p className="text-xs text-gray-500 mt-1">{t('checkingSources', language)}</p>
            </div>
          ) : lyricsSearchError ? (
            <div className="py-12 px-5 text-center">
              <div className="w-11 h-11 rounded-full bg-amber-400/10 text-amber-300 flex items-center justify-center mx-auto mb-3"><Search size={20}/></div>
              <p className="text-sm text-gray-200">{['noSyncedLyricsSearch', 'lyricsSearchFailed'].includes(lyricsSearchError) ? t(lyricsSearchError, language) : lyricsSearchError}</p>
              <p className="text-xs text-gray-500 mt-2">{t('tryOtherSearch', language)}</p>
            </div>
          ) : lyricsSearchResults.length > 0 ? (
            <div>
              {lyricsSearchResults.map((result, index) => (
                <button
                  type="button"
                  key={`${result.sourceName}-${result.trackName}-${result.artistName}-${index}`}
                  onClick={() => saveLyricsResult(result)}
                  className="w-full text-left flex items-center gap-3.5 px-5 py-4 border-b border-white/[0.06] last:border-0 hover:bg-purple-500/[0.12] focus:outline-none focus:bg-purple-500/[0.12] transition-colors group"
                  title={t('saveSyncedLyrics', language)}
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/25 border border-white/10 flex items-center justify-center shrink-0 group-hover:from-purple-500/45 group-hover:to-pink-500/35 transition">
                    <FileMusic size={19} className="text-purple-200" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{result.trackName}</p>
                    <p className="text-xs text-gray-400 truncate mt-1">{result.artistName || t('unknownArtist', language)}{result.albumName ? ` · ${result.albumName}` : ''}</p>
                    <p className="text-[11px] text-purple-300/80 mt-1.5">{result.sourceName || t('syncedCatalog', language)} · {t('timecodedLyrics', language)}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-gray-400 group-hover:text-white transition">
                    <FolderOpen size={15}/><span className="hidden sm:inline">{t('save', language)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 px-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
                <Music size={25} className="text-purple-200" />
              </div>
              <h3 className="font-semibold text-gray-200">{t('discoverAnySong', language)}</h3>
              <p className="max-w-md mx-auto text-sm text-gray-500 mt-2 leading-relaxed">{t('discoverAnySongDesc', language)}</p>
            </div>
          )}
        </section>
      </div>
    </main>;
  }

  if (currentView === 'home') {
    return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain"><div className="mb-8"><p className="text-sm text-purple-300 mb-2">{t('homeEyebrow', language)}</p><h1 className="text-3xl md:text-4xl font-bold mb-2">{t('homeTitle', language)}</h1><p className="text-gray-400">{t('homeDesc', language)}</p></div><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8"><DashboardCard title={t('myMusic', language)} subtitle={trackCount(library.length, language)} icon={Library} onClick={() => setCurrentView('library')}/><DashboardCard title={t('playlists', language)} subtitle={t('collections', language, { count: playlists.length })} icon={ListMusic} onClick={() => setCurrentView('playlists')}/><DashboardCard title={t('searchLyrics', language)} subtitle={t('findAndSaveLyrics', language)} icon={FileMusic} onClick={() => setCurrentView('lyrics')}/></div><div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold">{t('recentlyAdded', language)}</h2><button onClick={() => setCurrentView('library')} className="text-sm text-purple-300 hover:text-white">{t('entireLibrary', language)}</button></div><TrackList tracks={[...library].slice(-8).reverse()} favorites={favorites} onPlay={playTrack} onFavorite={toggleFavorite} language={language}/>{!library.length && <EmptyState text={t('addLocalFilesEmpty', language)}/>}</main>;
  }

  if (currentView === 'playlists') return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain"><h1 className="text-3xl font-bold mb-2">{t('myPlaylists', language)}</h1><p className="text-sm text-gray-400 mb-6">{t('playlistsDesc', language)}</p>{playlists.length ? <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{playlists.map(pl => <button key={pl.id} onClick={() => { /* playlist is opened by sidebar selection */ }} className="text-left p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10"><ListMusic className="text-purple-300 mb-4" size={25}/><p className="font-semibold">{pl.name}</p><p className="text-sm text-gray-400">{trackCount(pl.tracks.length, language)}</p></button>)}</div> : <EmptyState text={t('createFirstPlaylist', language)}/>}</main>;

  const sourceTracks = currentView === 'favorites' ? favorites : currentView === 'history' ? history : allLocalTracks;
  const filtered = sourceTracks.filter(track => `${track.title || ''} ${track.artist || ''} ${track.album || ''} ${track.fileName || ''}`.toLowerCase().includes(query.toLowerCase().trim()));
  const titles = { library: t('myMusic', language), favorites: t('likedSongs', language), history: t('history', language), artists: t('artists', language), albums: t('albums', language), search: t('searchLibrary', language) };
  const groups = currentView === 'artists' ? [...new Set(filtered.map(track => track.artist || t('unknownArtist', language)))].map(name => ({ name, tracks: filtered.filter(track => (track.artist || t('unknownArtist', language)) === name) })) : currentView === 'albums' ? [...new Set(filtered.map(track => track.album || t('noAlbum', language)))].map(name => ({ name, tracks: filtered.filter(track => (track.album || t('noAlbum', language)) === name) })) : [];
  const playList = tracks => { const playable = tracks.filter(track => track.url); if (playable.length) setQueueAndPlay(playable, 0); };
  return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain"><div className="flex items-center gap-3 mb-2"><Search size={24} className="text-purple-300"/><h1 className="text-3xl font-bold">{titles[currentView] || t('myMusic', language)}</h1></div><p className="text-sm text-gray-400 mb-6">{t('libraryTracksSummary', language, { count: sourceTracks.length })}</p><div className="relative mb-6 max-w-2xl"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('searchLibraryPlaceholder', language)} className="w-full bg-white/[0.045] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-purple-400/60 text-white"/></div>{currentView === 'artists' || currentView === 'albums' ? groups.length ? <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{groups.map(group => <button key={group.name} onClick={() => playList(group.tracks)} className="text-left rounded-2xl p-4 bg-white/[0.045] hover:bg-white/[0.08] border border-white/5"><div className="w-full aspect-square rounded-xl bg-gradient-to-br from-violet-600/60 to-fuchsia-500/30 flex items-center justify-center mb-4 overflow-hidden">{group.tracks[0]?.cover ? <img src={group.tracks[0].cover} alt="" className="w-full h-full object-cover"/> : currentView === 'artists' ? <Users size={40}/> : <Disc3 size={40}/>}</div><p className="font-semibold truncate">{group.name}</p><p className="text-xs text-gray-400 mt-1">{t('tracksShort', language, { count: group.tracks.length })}</p></button>)}</div> : <EmptyState text={t('noGroupingData', language)}/> : <><button onClick={() => playList(filtered)} disabled={!filtered.some(track => track.url)} className="mb-4 px-5 py-2.5 rounded-full bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-sm font-semibold flex items-center gap-2"><Play size={16} fill="currentColor"/>{t('playAll', language)}</button><TrackList tracks={filtered} favorites={favorites} onPlay={playTrack} onFavorite={toggleFavorite} language={language}/>{!filtered.length && <EmptyState text={query ? t('noLocalSearchResults', language) : t('addMusicViaUpload', language)}/>}</>}</main>;
}

function TrackList({ tracks, favorites = [], onPlay, onFavorite, onRemove, language = 'ru' }) {
  return <div className="rounded-2xl border border-white/[0.07] overflow-hidden">{tracks.map((track, index) => <div key={`${track.id}-${index}`} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.045] group"><button onClick={() => track.url && onPlay(track)} disabled={!track.url} title={t('playTrack', language)} className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600/70 to-pink-500/50 overflow-hidden flex items-center justify-center shrink-0 disabled:opacity-40">{track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover"/> : <Play size={15} fill="currentColor"/>}</button><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{track.title || t('noTitle', language)}</p><p className="text-xs text-gray-400 truncate">{track.artist || t('unknownArtist', language)}{track.album ? ` · ${track.album}` : ''}</p></div>{onFavorite && <button onClick={() => onFavorite(track)} title={t('likeTrack', language)} className={`p-2 ${favorites.some(item => item.id === track.id) ? 'text-pink-400' : 'text-gray-500 opacity-0 group-hover:opacity-100 hover:text-pink-300'}`}><Heart size={17} fill={favorites.some(item => item.id === track.id) ? 'currentColor' : 'none'}/></button>}{onRemove && <button onClick={() => onRemove(track)} title={t('removeFromPlaylist', language)} className="p-2 text-gray-500 hover:text-red-400"><Trash2 size={16}/></button>}<span className="text-xs text-gray-500 w-8 text-right">{track.duration ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}` : ''}</span></div>)}</div>;
}
function DashboardCard({ title, subtitle, icon: Icon, onClick }) { return <button onClick={onClick} className="text-left rounded-2xl p-5 bg-white/[0.045] hover:bg-white/[0.08] border border-white/5 transition"><Icon size={24} className="text-purple-300 mb-5"/><p className="font-semibold">{title}</p><p className="text-sm text-gray-400 truncate mt-1">{subtitle}</p></button>; }
function EmptyState({ text }) { return <div className="py-16 px-6 text-center text-gray-400"><Music size={34} className="mx-auto mb-3 text-purple-300/70"/><p className="text-sm">{text}</p></div>; }
