import { useEffect, useState } from 'react';
import { Settings, Languages, Palette, Info, Github, RefreshCw, ExternalLink, MonitorCog, FolderPlus, FolderOpen, Trash2 } from 'lucide-react';
import { t } from '../i18n';
import { ft } from '../feature-i18n';
import usePlayerStore from '../store/playerStore';

const RELEASES_URL = 'https://github.com/musplayteam/musplay_musicplayer/releases';

export default function SettingsPage({ language, setLanguage, theme, setTheme, appVersion, onCheckUpdates, updateState }) {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('');
  const [version, setVersion] = useState(appVersion || '1.2.0');
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [trayPreferenceLoaded, setTrayPreferenceLoaded] = useState(false);
  const [savingTrayPreference, setSavingTrayPreference] = useState(false);
  const [mediaShortcutStatus, setMediaShortcutStatus] = useState(null);
  const [musicFolders, setMusicFolders] = useState(() => { try { return JSON.parse(localStorage.getItem('musplay-library-folders') || '[]'); } catch { return []; } });
  const [scanningMusic, setScanningMusic] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  useEffect(() => { if (appVersion) setVersion(appVersion); }, [appVersion]);

  useEffect(() => {
    let active = true;
    window.electronAPI?.getMediaShortcutStatus?.().then(result => {
      if (active) setMediaShortcutStatus(result);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    window.electronAPI?.getMinimizeToTray?.().then(value => {
      if (active) {
        setMinimizeToTray(Boolean(value));
        setTrayPreferenceLoaded(true);
      }
    }).catch(() => {
      if (active) setTrayPreferenceLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const toggleTrayPreference = async (enabled) => {
    const previous = minimizeToTray;
    setMinimizeToTray(enabled);
    setSavingTrayPreference(true);
    try {
      const saved = await window.electronAPI?.setMinimizeToTray?.(enabled);
      if (typeof saved === 'boolean') setMinimizeToTray(saved);
    } catch {
      setMinimizeToTray(previous);
      setStatus(t('traySaveFailed', language));
    } finally {
      setSavingTrayPreference(false);
    }
  };

  const scanFolders = async (folders = musicFolders) => {
    if (!folders.length) return;
    setScanningMusic(true); setScanStatus(ft('scanning', language));
    try {
      const result = await usePlayerStore.getState().scanMusicFolders(folders);
      let statusText = result.added > 0
        ? ft('scanComplete', language, result)
        : (result.found > 0 ? ft('scanComplete', language, result) : ft('noAudioFound', language));
      if (result.truncated) statusText += ` ${ft('scanLimit', language)}`;
      if (result.skippedLarge) statusText += ` ${ft('largeFilesSkipped', language, { count: result.skippedLarge })}`;
      setScanStatus(statusText);
    } catch (error) {
      setScanStatus(ft('scanFailed', language));
    } finally { setScanningMusic(false); }
  };

  const addMusicFolders = async () => {
    try {
      const selected = await window.electronAPI?.chooseMusicFolders?.();
      if (!Array.isArray(selected) || !selected.length) return;
      const updated = [...new Set([...musicFolders, ...selected])].slice(0, 30);
      setMusicFolders(updated);
      localStorage.setItem('musplay-library-folders', JSON.stringify(updated));
      await scanFolders(updated);
    } catch (error) { setScanStatus(ft('scanFailed', language)); }
  };

  const removeMusicFolder = folder => {
    const updated = musicFolders.filter(item => item !== folder);
    setMusicFolders(updated);
    localStorage.setItem('musplay-library-folders', JSON.stringify(updated));
  };

  const check = async () => {
    setChecking(true);
    setStatus(t('checkingReleases', language));
    try {
      const result = await onCheckUpdates();
      if (!result) setStatus(t('updatesCheckFailed', language));
      else if (result.updateAvailable) setStatus(t('updateAvailable', language, { latestVersion: result.latestVersion }));
      else if (result.error) setStatus(t('updatesCheckUnavailable', language));
      else setStatus(t('latestVersion', language, { currentVersion: result.currentVersion }));
    } catch {
      setStatus(t('updatesCheckFailed', language));
    } finally {
      setChecking(false);
    }
  };

  const open = (url) => window.electronAPI?.openExternal
    ? window.electronAPI.openExternal(url)
    : window.open(url, '_blank', 'noopener,noreferrer');

  const panel = 'rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:p-6';
  const select = 'rounded-xl border border-white/10 bg-[#241536] px-3 py-2.5 text-sm text-white outline-none focus:border-purple-400';
  const text = (key, values) => t(key, language, values);

  return (
    <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-6 md:p-8 overflow-x-hidden overflow-y-auto overscroll-contain">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-7">
          <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-300/20 flex items-center justify-center">
            <Settings size={22} className="text-purple-300" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{text('settingsTitle')}</h1>
            <p className="text-sm text-gray-400 mt-1">{text('settingsSubtitle')}</p>
          </div>
        </div>

        <section className={`${panel} mb-4`}>
          <h2 className="font-semibold flex items-center gap-2 mb-5">
            <Languages size={18} className="text-pink-300" />{text('languageSection')}
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{text('interfaceLanguage')}</p>
              <p className="text-xs text-gray-400 mt-1">{text('savedOnDevice')}</p>
            </div>
            <select className={select} value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="ru">Русский</option><option value="en">English</option><option value="es">Español</option>
              <option value="fr">Français</option><option value="de">Deutsch</option><option value="pt">Português</option>
              <option value="it">Italiano</option><option value="pl">Polski</option><option value="uk">Українська</option>
              <option value="tr">Türkçe</option><option value="ar">العربية</option><option value="zh-CN">简体中文</option>
              <option value="ja">日本語</option><option value="ko">한국어</option><option value="hi">हिन्दी</option>
              <option value="id">Bahasa Indonesia</option><option value="vi">Tiếng Việt</option><option value="nl">Nederlands</option>
              <option value="az">Azərbaycanca</option><option value="bn">বাংলা</option><option value="he">עברית</option>
              <option value="kk">Қазақша</option><option value="be">Беларуская</option>
            </select>
          </div>
        </section>

        <section className={`${panel} mb-4`}>
          <h2 className="font-semibold flex items-center gap-2 mb-5">
            <Palette size={18} className="text-pink-300" />{text('appearanceSection')}
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{text('appTheme')}</p>
              <p className="text-xs text-gray-400 mt-1">{text('themeHint')}</p>
            </div>
            <select className={select} value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="purple">{text('themePurple')}</option>
              <option value="dark">{text('themeDark')}</option>
              <option value="black">{text('themeOLED')}</option>
            </select>
          </div>
        </section>

        <section className={`${panel} mb-4`}>
          <h2 className="font-semibold flex items-center gap-2 mb-5">
            <MonitorCog size={18} className="text-pink-300" />{text('controlsSection')}
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-5 border-b border-white/10">
            <div className="max-w-2xl">
              <p className="text-sm font-medium">{text('hardwareKeys')}</p>
              <p className="text-xs text-gray-400 mt-1">{text('hardwareKeysDesc')}</p>
            </div>
            <span className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium ${mediaShortcutStatus && mediaShortcutStatus.unavailable?.length ? 'border-amber-400/20 bg-amber-400/10 text-amber-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>
              {mediaShortcutStatus
                ? `${mediaShortcutStatus.registered?.length || 0}/${mediaShortcutStatus.supported?.length || 4} ${text('ready')}`
                : text('checking')}
            </span>
          </div>
          {mediaShortcutStatus?.unavailable?.length > 0 && (
            <p className="mt-3 text-xs text-amber-200/90">{text('keysUnavailable')}</p>
          )}
          <label className={`flex items-center justify-between gap-4 pt-5 ${trayPreferenceLoaded ? 'cursor-pointer' : 'opacity-60'}`}>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{text('minimizeToTray')}</span>
              <span className="block text-xs text-gray-400 mt-1">{text('trayDesc')}</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-purple-500"
              checked={minimizeToTray}
              disabled={!trayPreferenceLoaded || savingTrayPreference}
              onChange={event => toggleTrayPreference(event.target.checked)}
              aria-label={text('minimizeToTray')}
            />
          </label>
        </section>

        <section className={`${panel} mb-4`}>
          <h2 className="font-semibold flex items-center gap-2 mb-2"><FolderOpen size={18} className="text-pink-300"/>{ft('savedFolders', language)}</h2>
          <p className="text-xs text-gray-400 mb-4">{ft('folderScanDesc', language)}</p>
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={addMusicFolders} disabled={scanningMusic} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm"><FolderPlus size={15}/>{ft('addFolder', language)}</button>
            <button onClick={() => scanFolders()} disabled={scanningMusic || !musicFolders.length} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 hover:bg-white/10 disabled:opacity-40 text-sm"><RefreshCw size={15} className={scanningMusic ? 'animate-spin' : ''}/>{ft('rescanFolders', language)}</button>
          </div>
          {musicFolders.length ? <div className="space-y-2">{musicFolders.map(folder => <div key={folder} className="flex items-center gap-2 rounded-xl bg-black/15 border border-white/5 px-3 py-2"><FolderOpen size={15} className="text-purple-300 shrink-0"/><span className="text-xs text-gray-300 min-w-0 flex-1 break-all">{folder}</span><button onClick={() => removeMusicFolder(folder)} title={ft('removeFolder', language)} className="p-1.5 text-gray-500 hover:text-red-300"><Trash2 size={14}/></button></div>)}</div> : <p className="text-xs text-gray-500">{ft('noFolders', language)}</p>}
          {scanStatus && <p className="text-xs text-purple-200 mt-3">{scanStatus}</p>}
        </section>

        <section className={`${panel} mb-4`}>
          <h2 className="font-semibold flex items-center gap-2 mb-5">
            <RefreshCw size={18} className="text-pink-300" />{text('updatesSection')}
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{text('installedVersion')} <span className="text-purple-300">v{version}</span></p>
              <p className="text-xs text-gray-400 mt-1">{text('releasesPublished')}</p>
            </div>
            <button onClick={check} disabled={checking} className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 px-4 py-2.5 text-sm font-medium transition">
              <RefreshCw size={15} className={checking ? 'animate-spin' : ''}/>{text('checkUpdates')}
            </button>
          </div>
          {(status || updateState?.error) && <p className="mt-4 text-sm text-gray-300">{status}</p>}
          {updateState?.updateAvailable && (
            <button onClick={() => open(updateState.releasesUrl || RELEASES_URL)} className="mt-3 text-sm text-purple-300 hover:text-white inline-flex items-center gap-1">
              {text('downloadVersion', { latestVersion: updateState.latestVersion })} <ExternalLink size={14}/>
            </button>
          )}
        </section>

        <section className={panel}>
          <h2 className="font-semibold flex items-center gap-2 mb-5">
            <Info size={18} className="text-pink-300" />{text('aboutSection')}
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-lg font-bold">MusPlay <span className="text-sm font-normal text-gray-400">v{version}</span></p>
              <p className="text-sm text-gray-400 mt-1">{text('aboutDescription')}</p>
            </div>
            <button onClick={() => open('https://github.com/musplayteam/musplay_musicplayer')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 hover:bg-white/10 px-4 py-2.5 text-sm transition">
              <Github size={16}/>{text('sourceCode')}<ExternalLink size={13}/>
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 text-xs text-gray-500 flex items-center gap-2">
            <MonitorCog size={14}/>{text('preferencesStored')}
          </div>
        </section>
      </div>
    </main>
  );
}
