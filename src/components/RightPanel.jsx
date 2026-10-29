import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Trash2, Upload, PlusCircle } from 'lucide-react';
import usePlayerStore from '../store/playerStore';

export default function RightPanel() {
  const fileInputRef = useRef(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null); // Ссылка на выпадающее меню
  
  const { 
    currentTrack, isPlaying, queue, playlists,
    playTrack, togglePlay, removeFromQueue, loadLocalFiles, addTrackToPlaylist 
  } = usePlayerStore();

  // ЗАКРЫТИЕ МЕНЮ ПРИ КЛИКЕ СНАРУЖИ
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileUpload = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) loadLocalFiles(files);
  };

  const handleTrackClick = (track) => {
    setOpenMenuId(null); // Закрываем меню при клике на трек
    if (currentTrack?.id === track.id) togglePlay();
    else playTrack(track);
  };

  const handleAddToPlaylist = (playlistId, track) => {
    addTrackToPlaylist(playlistId, track);
    setOpenMenuId(null); // Закрываем меню после добавления
  };

  return (
    <aside data-wheel-region="true" className="w-80 min-h-0 h-full shrink-0 p-6 flex flex-col gap-8 border-l border-white/5 overflow-x-hidden overflow-y-auto overscroll-contain">
      <div>
        <h3 className="text-sm font-semibold mb-4">Сейчас играет</h3>
        {currentTrack ? (
          <div className="bg-gradient-to-br from-purple-600/40 to-pink-600/40 backdrop-blur-md rounded-2xl p-4 border border-white/10">
            <div className="flex items-end justify-center gap-1 h-16 mb-3">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 bg-pink-400 rounded-full ${isPlaying ? 'animate-pulse' : ''}`}
                  style={{
                    height: isPlaying ? `${Math.random() * 100}%` : '20%',
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>
            <p className="font-bold">{currentTrack.title}</p>
            <p className="text-xs text-gray-400">{currentTrack.artist}</p>
          </div>
        ) : (
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-center">
            <p className="text-sm text-gray-400">Ничего не играет</p>
          </div>
        )}
      </div>

      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Очередь ({queue.length})</h3>
          <button onClick={() => fileInputRef.current?.click()} className="text-xs text-purple-400 hover:text-purple-300 transition flex items-center gap-1">
            <Upload size={12} />
            Добавить
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFileUpload} className="hidden" />
        </div>

        <div className="flex flex-col gap-2 relative">
          {queue.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Очередь пуста</p>
          ) : (
            queue.map((track) => (
              <div
                key={track.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition group cursor-pointer relative ${
                  currentTrack?.id === track.id ? 'bg-pink-500/30 border border-pink-500/50' : 'bg-white/5 hover:bg-white/10'
                }`}
                onClick={() => handleTrackClick(track)}
              >
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  {currentTrack?.id === track.id && isPlaying ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" className="ml-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{track.title}</p>
                  <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                </div>
                
                <div className="flex items-center gap-1 relative" ref={openMenuId === track.id ? menuRef : null}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === track.id ? null : track.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-purple-400 transition p-1"
                    title="Добавить в плейлист"
                  >
                    <PlusCircle size={16} />
                  </button>
                  
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFromQueue(track.id); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition p-1"
                  >
                    <Trash2 size={14} />
                  </button>

                  {/* Выпадающее меню плейлистов */}
                  {openMenuId === track.id && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a0b2e] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden">
                      {playlists.length === 0 ? (
                        <p className="p-3 text-xs text-gray-500 text-center">Сначала создай плейлист в меню слева</p>
                      ) : (
                        playlists.map(pl => (
                          <button
                            key={pl.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToPlaylist(pl.id, track);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-purple-600/50 transition flex items-center gap-2"
                          >
                            <PlusCircle size={12} />
                            {pl.name} <span className="text-gray-600 ml-auto text-xs">{pl.tracks.length}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}