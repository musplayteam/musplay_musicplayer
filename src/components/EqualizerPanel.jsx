import React from 'react';
import { X, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { ft } from '../feature-i18n';
import { t } from '../i18n';

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS = {
  flat: [0,0,0,0,0,0,0,0,0,0],
  pop: [-1,1,3,4,2,-1,-1,1,2,2],
  rock: [4,3,1,-1,-2,1,3,4,4,3],
  jazz: [3,2,1,2,-2,-2,0,1,2,3],
  classical: [4,3,2,1,-1,-1,0,2,3,4],
  bass: [6,5,4,2,0,0,0,0,0,0],
  treble: [0,0,0,0,0,0,2,4,5,5],
  vocals: [-2,-1,0,2,4,4,2,0,-1,-2]
};

export default function EqualizerPanel({ language, gains, onChange, supported, onClose }) {
  const presets = ['flat','pop','rock','jazz','classical','bass','treble','vocals'];
  const applyPreset = name => onChange([...EQ_PRESETS[name]]);
  const isFlat = gains.every(value => Math.abs(value) < 0.01);
  return <div className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#160e20] shadow-2xl p-5 md:p-7">
      <header className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center"><SlidersHorizontal className="text-purple-300" size={20}/></div><div><h2 className="text-xl font-bold">{ft('equalizer', language)}</h2><p className="text-xs text-gray-400">{ft('presets', language)}</p></div></div>
        <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10" aria-label={ft('cancel', language)}><X size={19}/></button>
      </header>
      <div className="flex flex-wrap gap-2 mb-6">
        {presets.map(name => <button key={name} onClick={() => applyPreset(name)} className={`px-3 py-2 rounded-xl text-xs border transition ${JSON.stringify(gains) === JSON.stringify(EQ_PRESETS[name]) ? 'bg-purple-600/40 border-purple-400/40 text-white' : 'bg-white/[0.04] border-white/10 text-gray-300 hover:bg-white/10'}`}>{ft(name, language)}</button>)}
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {EQ_FREQUENCIES.map((frequency, index) => <label key={frequency} className="min-w-0 flex flex-col items-center gap-2">
          <span className="text-[10px] text-gray-400 tabular-nums">{gains[index] > 0 ? '+' : ''}{gains[index].toFixed(1)}</span>
          <input aria-label={`${frequency} Hz`} type="range" min="-12" max="12" step="0.5" value={gains[index]} onChange={event => { const next = [...gains]; next[index] = Number(event.target.value); onChange(next); }} className="h-28 w-2 accent-purple-400" style={{ writingMode: 'vertical-lr', direction: 'rtl' }}/>
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{frequency >= 1000 ? `${frequency / 1000}k` : frequency}</span>
        </label>)}
      </div>
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
        <span className={`text-xs ${supported ? 'text-emerald-300' : 'text-amber-300'}`}>{supported ? t('ready', language) : ft('eqUnavailable', language)}</span>
        <button onClick={() => applyPreset('flat')} disabled={isFlat} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border border-white/10 hover:bg-white/10 disabled:opacity-40"><RotateCcw size={15}/>{ft('reset', language)}</button>
      </div>
    </section>
  </div>;
}
