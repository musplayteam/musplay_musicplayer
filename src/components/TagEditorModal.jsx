import React, { useEffect, useState } from 'react';
import { X, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import usePlayerStore from '../store/playerStore';
import { ft } from '../feature-i18n';

export default function TagEditorModal({ track, language = 'ru', onClose }) {
  const updateTrackMetadata = usePlayerStore(state => state.updateTrackMetadata);
  const [fields, setFields] = useState({ title: '', artist: '', album: '', year: '', genre: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const canWrite = Boolean(track?.sourcePath && /\.mp3$/i.test(track.sourcePath) && typeof window.electronAPI?.writeAudioTags === 'function');

  useEffect(() => {
    if (track) setFields({ title: track.title || '', artist: track.artist || '', album: track.album || '', year: track.year || '', genre: track.genre || '' });
  }, [track]);
  if (!track) return null;
  const update = (key, value) => setFields(current => ({ ...current, [key]: value }));
  const save = async event => {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true); setMessage(''); setError(false);
    try {
      const result = await window.electronAPI.writeAudioTags(track.sourcePath, fields);
      updateTrackMetadata(track.id, fields);
      setMessage(`${ft('backupSaved', language)} ${result.backupPath || ''}`);
    } catch (err) {
      console.warn('MusPlay: failed to write MP3 tags', err);
      setError(true); setMessage(ft('tagWriteFailed', language));
    } finally { setSaving(false); }
  };
  const labels = [['title','title'],['artist','artist'],['album','album'],['year','year'],['genre','genre']];
  return <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={ft('tagEditor', language)}>
    <form onSubmit={save} className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#170e22] shadow-2xl p-5 md:p-6">
      <header className="flex items-center justify-between mb-5"><div><h2 className="text-xl font-bold">{ft('tagEditor', language)}</h2><p className="text-xs text-gray-400 mt-1 truncate max-w-[330px]">{track.fileName || track.title}</p></div><button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"><X size={19}/></button></header>
      {!canWrite && <div className="flex gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-400/20 text-amber-200 text-xs mb-4"><AlertTriangle size={16} className="shrink-0"/><span>{!track.sourcePath ? ft('tagNeedsPath', language) : ft('mp3Only', language)}</span></div>}
      <div className="space-y-3">
        {labels.map(([key,label]) => <label key={key} className="block"><span className="block text-xs text-gray-400 mb-1.5">{ft(label, language)}</span><input value={fields[key]} onChange={event => update(key, event.target.value)} maxLength={500} className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-purple-400/60"/></label>)}
      </div>
      {message && <p className={`mt-4 flex gap-2 text-xs break-all ${error ? 'text-red-300' : 'text-emerald-300'}`}>{!error && <CheckCircle2 size={15} className="shrink-0"/>}{message}</p>}
      <footer className="flex justify-end gap-2 mt-6"><button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:bg-white/5">{ft('cancel', language)}</button><button type="submit" disabled={!canWrite || saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-sm font-medium"><Save size={15}/>{ft('saveChanges', language)}</button></footer>
    </form>
  </div>;
}
