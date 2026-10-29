import { useState } from 'react';
import { Home, Heart, ListMusic, Plus, Library, Clock3, Disc3, Users, FileMusic, Settings } from 'lucide-react';
import usePlayerStore from '../store/playerStore';

export default function Sidebar({ currentView, setCurrentView, setSelectedPlaylistId, selectedPlaylistId, language = 'ru' }) {
  const { playlists, createPlaylist, library, favorites, history } = usePlayerStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const labels = language === 'en' ? { home: 'Home', search: 'Search library', lyrics: 'Search lyrics', playlists: 'Playlists', library: 'My music', favorites: 'Liked songs', artists: 'Artists', albums: 'Albums', history: 'History', settings: 'Settings', playlistHeading: 'PLAYLISTS', empty: 'Nothing here yet', playlistPlaceholder: 'Playlist name...' } : { home: 'Главная', search: 'Поиск по библиотеке', lyrics: 'Поиск текста', playlists: 'Все плейлисты', library: 'Моя музыка', favorites: 'Мне нравится', artists: 'Исполнители', albums: 'Альбомы', history: 'История', settings: 'Настройки', playlistHeading: 'ПЛЕЙЛИСТЫ', empty: 'Пока пусто', playlistPlaceholder: 'Название...' };

  const handleCreate = (e) => {
    e.preventDefault();
    if (newPlaylistName.trim()) {
      createPlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
      setIsCreating(false);
    }
  };

  const openPlaylist = (id) => {
    setSelectedPlaylistId(id);
    setCurrentView('playlist');
  };

  return (
    <aside data-wheel-region="true" className="w-64 min-h-0 h-full shrink-0 p-6 flex flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain border-r border-white/5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center">
          <ListMusic size={18} />
        </div>
        <span className="font-bold text-lg">MusPlay</span>
      </div>

      <div>
        <nav className="flex flex-col gap-1">
          {[
            { id: 'home', label: labels.home, Icon: Home },
            { id: 'search', label: labels.search, Icon: Library },
            { id: 'lyrics', label: labels.lyrics, Icon: FileMusic },
            { id: 'playlists', label: labels.playlists, Icon: ListMusic },
            { id: 'library', label: labels.library, Icon: Library, count: library.length },
            { id: 'favorites', label: labels.favorites, Icon: Heart, count: favorites.length },
            { id: 'artists', label: labels.artists, Icon: Users },
            { id: 'albums', label: labels.albums, Icon: Disc3 },
            { id: 'history', label: labels.history, Icon: Clock3, count: history.length },
            { id: 'settings', label: labels.settings, Icon: Settings },
          ].map(({ id, label, Icon, count }) => (
            <button key={id} onClick={() => setCurrentView(id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${currentView === id ? 'bg-purple-600/30 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              <Icon size={18} />
              <span className="text-sm flex-1 text-left">{label}</span>
              {typeof count === 'number' && <span className="text-xs text-gray-500">{count}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase text-gray-400 tracking-wider">{labels.playlistHeading}</h3>
          <button onClick={() => setIsCreating(true)} className="text-gray-400 hover:text-white transition">
            <Plus size={16} />
          </button>
        </div>

        {isCreating && (
          <form onSubmit={handleCreate} className="mb-3">
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder={labels.playlistPlaceholder}
              className="w-full bg-white/5 border border-purple-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none"
              autoFocus
              onBlur={() => !newPlaylistName && setIsCreating(false)}
            />
          </form>
        )}

        <nav className="flex flex-col gap-1">
          {playlists.length === 0 && !isCreating && (
            <p className="text-xs text-gray-500 px-3">{labels.empty}</p>
          )}
          {playlists.map((pl) => (
            <button 
              key={pl.id} 
              onClick={() => openPlaylist(pl.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition text-left ${
                currentView === 'playlist' && pl.id === selectedPlaylistId 
                  ? 'bg-purple-600/30 text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <ListMusic size={16} className="text-purple-400" />
              <span className="text-sm truncate flex-1">{pl.name}</span>
              <span className="text-xs text-gray-600">{pl.tracks.length}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}