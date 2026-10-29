import React, { useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle, Upload, Heart, FileMusic } from 'lucide-react';
import usePlayerStore from '../store/playerStore';

export default function BottomPlayer({ showLyrics = false, onToggleLyrics = () => {} }) {
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const fileInputRef = useRef(null);

  const {
    currentTrack, isPlaying, currentTime, duration, volume, isMuted,
    isShuffle, repeatMode,
    togglePlay, nextTrack, prevTrack,
    setCurrentTime, setDuration,
    setVolume, toggleMute, toggleShuffle, toggleRepeat, loadLocalFiles, favorites, toggleFavorite
  } = usePlayerStore();

  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.play().catch(e => console.error('Autoplay:', e));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    if (repeatMode === 'one' && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } else {
      nextTrack();
    }
  };

  const handleProgressClick = (e) => {
    if (!progressRef.current || !audioRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFileUpload = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      loadLocalFiles(files);
    }
  };

  // Если треков нет
  if (!currentTrack) {
    return (
      <div className="fixed bottom-0 left-0 right-0 h-20 bg-[#0f0518]/90 backdrop-blur-xl border-t border-white/10 px-6 flex items-center justify-center gap-4 z-50">
        <p className="text-gray-400 text-sm">Очередь пуста. Добавь музыку!</p>
        <button 
          onClick={() => fileInputRef.current?.click()} 
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition text-sm"
        >
          <Upload size={16} />
          Загрузить музыку
        </button>
        <input 
          ref={fileInputRef} 
          type="file" 
          accept="audio/*" 
          multiple 
          onChange={handleFileUpload} 
          className="hidden" 
        />
      </div>
    );
  }

  // Если трек играет
  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-[#0f0518]/90 backdrop-blur-xl border-t border-white/10 px-6 flex items-center justify-between z-50">
      <audio 
        ref={audioRef} 
        src={currentTrack.url} 
        onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata} 
        onEnded={handleEnded}
      />
      <input 
        ref={fileInputRef} 
        type="file" 
        accept="audio/*" 
        multiple 
        onChange={handleFileUpload} 
        className="hidden" 
      />

      <div className="flex items-center gap-3 w-1/4">
        <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center overflow-hidden">
          {currentTrack.cover ? (
            <img src={currentTrack.cover} alt="cover" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl">🎵</span>
          )}
        </div>
        <div className="overflow-hidden min-w-0">
          <p className="font-semibold text-sm truncate">{currentTrack.title}</p>
          <p className="text-xs text-gray-400 truncate">{currentTrack.artist}</p>
        </div>
        <button onClick={() => toggleFavorite(currentTrack)} className={`p-2 transition ${favorites.some(track => track.id === currentTrack.id) ? 'text-pink-400' : 'text-gray-500 hover:text-pink-300'}`} title="Мне нравится">
          <Heart size={17} fill={favorites.some(track => track.id === currentTrack.id) ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 w-1/2">
        <div className="flex items-center gap-4">
          <button onClick={toggleShuffle} className={`transition ${isShuffle ? 'text-pink-500' : 'text-gray-400 hover:text-white'}`}>
            <Shuffle size={16} />
          </button>
          <button onClick={prevTrack} className="text-gray-400 hover:text-white transition">
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button onClick={togglePlay} className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center hover:scale-110 transition">
            {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" className="ml-0.5" />}
          </button>
          <button onClick={nextTrack} className="text-gray-400 hover:text-white transition">
            <SkipForward size={18} fill="currentColor" />
          </button>
          <button onClick={toggleRepeat} className={`transition ${repeatMode !== 'none' ? 'text-pink-500' : 'text-gray-400 hover:text-white'}`}>
            {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>
        </div>

        <div className="w-full flex items-center gap-2 text-xs text-gray-400">
          <span className="w-10 text-right">{formatTime(currentTime)}</span>
          <div 
            ref={progressRef} 
            onClick={handleProgressClick} 
            className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer group"
          >
            <div 
              className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full relative" 
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition" />
            </div>
          </div>
          <span className="w-10">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 w-1/4 justify-end">
        <button onClick={onToggleLyrics} className={`p-2 rounded-full transition ${showLyrics ? 'text-pink-300 bg-white/10' : 'text-gray-400 hover:text-white'}`} title="Открыть текст песни" aria-label="Открыть текст песни">
          <FileMusic size={18} />
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-white transition" title="Загрузить музыку">
          <Upload size={16} />
        </button>
        <button onClick={toggleMute} className="text-gray-400 hover:text-white transition">
          {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer relative group">
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={isMuted ? 0 : volume} 
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div 
            className="h-full bg-white/50 rounded-full transition-all"
            style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}