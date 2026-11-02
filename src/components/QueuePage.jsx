import React from 'react';
import { Play, Pause, Trash2, ArrowUp, ArrowDown, ListMusic, Music } from 'lucide-react';
import usePlayerStore from '../store/playerStore';
import { ft } from '../feature-i18n';
import { t } from '../i18n';

function duration(value) {
  const seconds = Number(value) || 0;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export default function QueuePage({ language = 'ru' }) {
  const queue = usePlayerStore(state => state.queue);
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const playTrack = usePlayerStore(state => state.playTrack);
  const togglePlay = usePlayerStore(state => state.togglePlay);
  const resumePlayback = usePlayerStore(state => state.resumePlayback);
  const removeFromQueue = usePlayerStore(state => state.removeFromQueue);
  const moveInQueue = usePlayerStore(state => state.moveInQueue);
  const clearQueue = usePlayerStore(state => state.clearQueue);

  return (
    <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-7 overflow-x-hidden overflow-y-auto overscroll-contain">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-300/20 flex items-center justify-center"><ListMusic size={22} className="text-purple-300"/></div>
          <div><h1 className="text-3xl font-bold">{ft('queueTitle', language)}</h1><p className="text-sm text-gray-400 mt-1">{ft('queueDescription', language)}</p></div>
        </div>
        <button onClick={clearQueue} disabled={!queue.length} className="px-3 py-2 rounded-xl text-sm border border-white/10 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed">{ft('clearQueue', language)}</button>
      </div>
      {!queue.length ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] py-16 px-6 text-center text-gray-400">
          <Music size={36} className="mx-auto mb-3 text-purple-300/70"/><p>{ft('queueEmpty', language)}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
          {queue.map((track, index) => {
            const active = currentTrack?.id === track.id;
            return <div key={`${track.id}-${index}`} className={`flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] last:border-0 ${active ? 'bg-purple-500/10' : 'hover:bg-white/[0.04]'}`}>
              <button onClick={() => active ? togglePlay() : playTrack(track)} className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/5 flex items-center justify-center" title={active && isPlaying ? t('pause', language) : t('playAction', language)}>
                {track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover"/> : active && isPlaying ? <Pause size={16}/> : <Play size={16} fill="currentColor"/>}
              </button>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => { if (active) { if (!isPlaying) resumePlayback(); } else playTrack(track); }} className={`block max-w-full text-left text-sm font-medium truncate hover:text-purple-300 focus-visible:outline-none focus-visible:text-purple-300 transition-colors ${active ? 'text-purple-200' : 'text-white'}`} title={t('playAction', language)}>{track.title || '—'}</button>
                <p className="text-xs text-gray-400 truncate">{track.artist || '—'}{track.album ? ` · ${track.album}` : ''}</p>
              </div>
              {active && <span className="text-[11px] text-purple-300 mr-1">{ft('nowPlaying', language)}</span>}
              <span className="text-xs text-gray-500 tabular-nums">{duration(track.duration)}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => moveInQueue(track.id, -1)} disabled={index === 0} className="p-2 text-gray-500 hover:text-white disabled:opacity-20" title={ft('moveUp', language)}><ArrowUp size={15}/></button>
                <button onClick={() => moveInQueue(track.id, 1)} disabled={index === queue.length - 1} className="p-2 text-gray-500 hover:text-white disabled:opacity-20" title={ft('moveDown', language)}><ArrowDown size={15}/></button>
                <button onClick={() => removeFromQueue(track.id)} className="p-2 text-gray-500 hover:text-red-300" title={ft('removeTrack', language)}><Trash2 size={15}/></button>
              </div>
            </div>;
          })}
        </div>
      )}
    </main>
  );
}
