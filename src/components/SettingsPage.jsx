import { useEffect, useRef, useState } from 'react';
import {
  Settings, Languages, Palette, Info, Github, RefreshCw, ExternalLink, MonitorCog,
  FolderPlus, FolderOpen, Trash2, Music2, SlidersHorizontal, Library, FileMusic,
  Monitor, Download, Upload, RotateCcw, ChevronRight, Bell, Keyboard, Database,
  PlayCircle, Sparkles, Search, Clock3, ShieldCheck, Send, HardDrive, PanelRight
} from 'lucide-react';
import { t } from '../i18n';
import { translateSettingsPageCopy } from '../settings-page-i18n';
import { ft } from '../feature-i18n';
import usePlayerStore from '../store/playerStore';
import localforage from 'localforage';
import { DEFAULT_PREFERENCES } from '../store/preferences';

const GITHUB_URL = 'https://github.com/musplayteam/musplay_musicplayer';
const RELEASES_URL = `${GITHUB_URL}/releases`;
const TELEGRAM_URL = 'https://t.me/MusPlay_Team';

function Toggle({ checked, onChange, disabled = false }) {
  return <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${checked ? 'bg-purple-500' : 'bg-white/15'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}><span className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}/></button>;
}

function SectionPanel({ title, description, children }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.035] px-5 md:px-6 mb-4"><div className="py-5 border-b border-white/[0.07]"><h2 className="font-semibold text-base">{title}</h2>{description && <p className="text-xs text-gray-400 mt-1">{description}</p>}</div>{children}</section>;
}

function SettingRow({ title, description, control, last = false }) {
  return <div className={`flex items-center justify-between gap-6 py-4 ${last ? '' : 'border-b border-white/[0.07]'}`}>
    <div className="min-w-0"><p className="text-sm font-medium text-white">{title}</p>{description && <p className="text-xs leading-relaxed text-gray-400 mt-1 max-w-2xl">{description}</p>}</div>
    <div className="shrink-0">{control}</div>
  </div>;
}

function SelectControl({ value, onChange, options, width = 'min-w-[154px]' }) {
  return <select value={value} onChange={event => onChange(event.target.value)} className={`${width} max-w-[220px] rounded-xl border border-white/10 bg-[#241536] px-3 py-2.5 text-sm text-white outline-none focus:border-purple-400`}>
    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
}

export default function SettingsPage({ language, setLanguage, theme, setTheme, appVersion, onCheckUpdates, updateState }) {
  const ru = language === 'ru';
  const copy = (russian, english = russian) => ru ? russian : translateSettingsPageCopy(english, language);
  const [activeSection, setActiveSection] = useState('playback');
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('');
  const [version, setVersion] = useState(appVersion || '1.2.1');
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [trayLoaded, setTrayLoaded] = useState(false);
  const [startupWithWindows, setStartupWithWindows] = useState(false);
  const [startupLoaded, setStartupLoaded] = useState(false);
  const [savingSystemSetting, setSavingSystemSetting] = useState(false);
  const [mediaShortcutStatus, setMediaShortcutStatus] = useState(null);
  const [musicFolders, setMusicFolders] = useState(() => { try { return JSON.parse(localStorage.getItem('musplay-library-folders') || '[]'); } catch { return []; } });
  const [scanningMusic, setScanningMusic] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [importingBackup, setImportingBackup] = useState(false);
  const [capturingShortcut, setCapturingShortcut] = useState(null);
  const importRef = useRef(null);
  const preferences = usePlayerStore(state => state.preferences);
  const setPreference = usePlayerStore(state => state.setPreference);
  const volume = usePlayerStore(state => state.volume);
  const setVolume = usePlayerStore(state => state.setVolume);

  useEffect(() => { if (appVersion) setVersion(appVersion); }, [appVersion]);
  useEffect(() => {
    let active = true;
    Promise.all([
      window.electronAPI?.getMediaShortcutStatus?.().catch(() => null),
      window.electronAPI?.getMinimizeToTray?.().catch(() => false),
      window.electronAPI?.getStartupWithWindows?.().catch(() => false),
    ]).then(([shortcuts, tray, startup]) => {
      if (!active) return;
      setMediaShortcutStatus(shortcuts);
      setMinimizeToTray(Boolean(tray)); setTrayLoaded(true);
      setStartupWithWindows(Boolean(startup)); setPreference('startupWithWindows', Boolean(startup)); setStartupLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const scanFolders = async (folders = musicFolders) => {
    if (!folders.length) return;
    setScanningMusic(true); setScanStatus(copy('Сканирую музыкальные папки…', 'Scanning music folders…'));
    try {
      const result = await usePlayerStore.getState().scanMusicFolders(folders);
      let message = result.added > 0
        ? copy(`Добавлено треков: ${result.added}. Найдено файлов: ${result.found}.`, `Added ${result.added} tracks. Found ${result.found} files.`)
        : (result.found > 0 ? copy(`Новых треков нет. Найдено файлов: ${result.found}.`, `No new tracks. Found ${result.found} files.`) : copy('Аудиофайлы не найдены.', 'No audio files found.'));
      if (result.truncated) message += copy(' Достигнут лимит сканирования.', ' Scan limit reached.');
      if (result.skippedLarge) message += copy(` Пропущено больших файлов: ${result.skippedLarge}.`, ` Skipped large files: ${result.skippedLarge}.`);
      setScanStatus(message);
    } catch { setScanStatus(copy('Не удалось просканировать папки.', 'Could not scan the selected folders.')); }
    finally { setScanningMusic(false); }
  };

  const addMusicFolders = async () => {
    try {
      const selected = await window.electronAPI?.chooseMusicFolders?.();
      if (!Array.isArray(selected) || !selected.length) return;
      const updated = [...new Set([...musicFolders, ...selected])].slice(0, 30);
      setMusicFolders(updated); localStorage.setItem('musplay-library-folders', JSON.stringify(updated));
      await scanFolders(updated);
    } catch { setScanStatus(copy('Не удалось добавить папку.', 'Could not add the folder.')); }
  };
  const removeMusicFolder = folder => {
    const updated = musicFolders.filter(item => item !== folder);
    setMusicFolders(updated); localStorage.setItem('musplay-library-folders', JSON.stringify(updated));
    setPreference('excludedFolders', (preferences.excludedFolders || []).filter(item => item !== folder));
  };

  const check = async () => {
    setChecking(true); setStatus(t('checkingReleases', language));
    try {
      const result = await onCheckUpdates();
      if (!result) setStatus(t('updatesCheckFailed', language));
      else if (result.updateAvailable) setStatus(t('updateAvailable', language, { latestVersion: result.latestVersion }));
      else if (result.error) setStatus(t('updatesCheckUnavailable', language));
      else setStatus(t('latestVersion', language, { currentVersion: result.currentVersion }));
    } catch { setStatus(t('updatesCheckFailed', language)); }
    finally { setChecking(false); }
  };
  const open = url => window.electronAPI?.openExternal ? window.electronAPI.openExternal(url) : window.open(url, '_blank', 'noopener,noreferrer');
  useEffect(() => {
    if (!capturingShortcut) return undefined;
    const capture = event => {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { setCapturingShortcut(null); return; }
      if (['Control','Alt','Shift','Meta'].includes(event.key)) return;
      const key = event.code === 'Space' ? 'Space' : event.key.startsWith('Arrow') ? event.key : event.key.length === 1 ? event.key.toUpperCase() : event.key;
      const parts = []; if (event.ctrlKey) parts.push('Ctrl'); if (event.altKey) parts.push('Alt'); if (event.shiftKey) parts.push('Shift'); if (event.metaKey) parts.push('Meta'); parts.push(key);
      setPreference(capturingShortcut, parts.join('+')); setCapturingShortcut(null);
    };
    window.addEventListener('keydown', capture, true);
    return () => window.removeEventListener('keydown', capture, true);
  }, [capturingShortcut, setPreference]);

  const toggleTray = async enabled => {
    setSavingSystemSetting(true);
    try { const saved = await window.electronAPI?.setMinimizeToTray?.(enabled); setMinimizeToTray(typeof saved === 'boolean' ? saved : enabled); }
    catch { setStatus(copy('Не удалось сохранить настройку системного трея.', 'Could not save the tray preference.')); }
    finally { setSavingSystemSetting(false); }
  };
  const toggleStartup = async enabled => {
    setSavingSystemSetting(true);
    try { const saved = await window.electronAPI?.setStartupWithWindows?.(enabled); setStartupWithWindows(typeof saved === 'boolean' ? saved : enabled); setPreference('startupWithWindows', typeof saved === 'boolean' ? saved : enabled); }
    catch { setStatus(copy('Не удалось изменить автозапуск Windows.', 'Could not change the Windows startup setting.')); }
    finally { setSavingSystemSetting(false); }
  };

  const exportBackup = () => {
    const backup = {
      product: 'MusPlay', schemaVersion: 1, exportedAt: new Date().toISOString(),
      preferences, language, theme, musicFolders,
      equalizer: (() => { try { return JSON.parse(localStorage.getItem('musplay-equalizer') || '[]'); } catch { return []; } })(),
      volume, minimizeToTray, startupWithWindows,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `MusPlay-settings-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    URL.revokeObjectURL(url);
    setStatus(copy('Резервная копия настроек сохранена.', 'Settings backup exported.'));
  };
  const importBackup = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setImportingBackup(true);
    try {
      const backup = JSON.parse(await file.text());
      if (backup.product !== 'MusPlay' || backup.schemaVersion !== 1 || !backup.preferences || typeof backup.preferences !== 'object') throw new Error('invalid');
      usePlayerStore.getState().setPreferences({ ...DEFAULT_PREFERENCES, ...backup.preferences });
      if (typeof backup.language === 'string') setLanguage(backup.language);
      if (['purple', 'dark', 'black'].includes(backup.theme)) setTheme(backup.theme);
      if (Array.isArray(backup.musicFolders)) { setMusicFolders(backup.musicFolders); localStorage.setItem('musplay-library-folders', JSON.stringify(backup.musicFolders)); }
      if (Array.isArray(backup.equalizer)) localStorage.setItem('musplay-equalizer', JSON.stringify(backup.equalizer));
      if (Number.isFinite(backup.volume)) setVolume(Math.max(0, Math.min(1, backup.volume)));
      if (typeof backup.minimizeToTray === 'boolean') { const tray = await window.electronAPI?.setMinimizeToTray?.(backup.minimizeToTray); setMinimizeToTray(typeof tray === 'boolean' ? tray : backup.minimizeToTray); }
      if (typeof backup.startupWithWindows === 'boolean') { const startup = await window.electronAPI?.setStartupWithWindows?.(backup.startupWithWindows); const enabled = typeof startup === 'boolean' ? startup : backup.startupWithWindows; setStartupWithWindows(enabled); setPreference('startupWithWindows', enabled); }
      setStatus(copy('Настройки восстановлены. Некоторые системные параметры применятся после перезапуска.', 'Settings restored. Some system preferences take effect after restart.'));
    } catch { setStatus(copy('Файл резервной копии MusPlay не распознан.', 'This is not a valid MusPlay settings backup.')); }
    finally { setImportingBackup(false); }
  };
  const resetPreferences = async () => {
    const confirmed = window.confirm(copy('Вернуть стандартные настройки MusPlay? Музыкальная библиотека и плейлисты не будут удалены.', 'Reset MusPlay settings to defaults? Your music library and playlists will not be deleted.'));
    if (!confirmed) return;
    usePlayerStore.getState().setPreferences(DEFAULT_PREFERENCES);
    setTheme('purple'); setLanguage('ru'); setVolume(0.7);
    localStorage.removeItem('musplay-equalizer');
    try { await window.electronAPI?.setMinimizeToTray?.(false); } catch { /* reset local preference even if IPC fails */ }
    try { await window.electronAPI?.setStartupWithWindows?.(false); } catch { /* reset local preference even if IPC fails */ }
    setMinimizeToTray(false); setStartupWithWindows(false);
    setStatus(copy('Стандартные настройки восстановлены.', 'Default settings restored.'));
  };
  const clearLyricsCache = async () => {
    if (!window.confirm(copy('Удалить сохранённый кэш автоматически найденных текстов? Импортированные вручную LRC-файлы останутся.', 'Delete the cache of automatically found lyrics? Manually imported LRC files will remain.'))) return;
    try {
      const keys = await localforage.keys();
      const lyricsKeys = keys.filter(key => key.startsWith('autoLyrics:'));
      await Promise.all(lyricsKeys.map(key => localforage.removeItem(key)));
      setStatus(copy(`Удалено записей кэша: ${lyricsKeys.length}.`, `Removed ${lyricsKeys.length} cached lyrics entries.`));
    } catch { setStatus(copy('Не удалось очистить кэш текстов.', 'Could not clear the lyrics cache.')); }
  };

  const sections = [
    { id: 'playback', label: copy('Воспроизведение', 'Playback'), Icon: PlayCircle },
    { id: 'appearance', label: copy('Внешний вид', 'Appearance'), Icon: Palette },
    { id: 'library', label: copy('Медиатека', 'Library'), Icon: Library },
    { id: 'lyrics', label: copy('Текст песен', 'Lyrics'), Icon: FileMusic },
    { id: 'system', label: copy('Система', 'System'), Icon: Monitor },
    { id: 'about', label: copy('О приложении', 'About'), Icon: Info },
  ];
  const row = (title, description, control, last = false) => <SettingRow key={title} title={title} description={description} control={control} last={last}/>;
  const toggle = (key, title, description, last = false) => row(title, description, <Toggle checked={Boolean(preferences[key])} onChange={value => setPreference(key, value)}/>, last);
  const select = (key, title, description, options, last = false) => row(title, description, <SelectControl value={preferences[key]} onChange={value => setPreference(key, value)} options={options}/>, last);
  const range = (title, description, value, onChange, min, max, step = 1, suffix = '') => row(title, description, <div className="flex items-center gap-3 min-w-[170px]"><input aria-label={title} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className="w-28 accent-purple-400"/><span className="text-xs text-gray-300 tabular-nums w-10 text-right">{value}{suffix}</span></div>, true);

  return (
    <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full overflow-hidden p-5 md:p-7">
      <div className="h-full max-w-6xl mx-auto flex flex-col min-h-0">
        <header className="flex items-center gap-3 mb-5 shrink-0"><div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-300/20 flex items-center justify-center"><Settings size={22} className="text-purple-300"/></div><div><h1 className="text-2xl md:text-3xl font-bold">{t('settingsTitle', language)}</h1><p className="text-sm text-gray-400 mt-1">{copy('Персонализируй MusPlay под себя.', 'Make MusPlay work the way you like.')}</p></div></header>
        <div className="flex flex-1 min-h-0 gap-5 md:gap-7">
          <nav className="w-44 md:w-52 shrink-0 flex flex-col gap-1 overflow-y-auto pr-1">
            {sections.map(({ id, label, Icon }) => <button key={id} onClick={() => setActiveSection(id)} className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-left transition ${activeSection === id ? 'bg-purple-600/25 text-white shadow-[inset_2px_0_0_rgba(216,180,254,.8)]' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}><Icon size={17}/><span className="flex-1">{label}</span>{activeSection === id && <ChevronRight size={14}/>}</button>)}
            <div className="mt-auto pt-4 border-t border-white/[0.07] text-[11px] text-gray-600 px-2">MusPlay v{version}</div>
          </nav>
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain pr-1">
            {activeSection === 'playback' && <>
              <SectionPanel title={copy('Поведение плеера', 'Player behavior')} description={copy('Управляй запуском музыки и переходами между композициями.', 'Choose how playback starts and moves between tracks.')}>
                {range(copy('Громкость', 'Volume'), copy('Текущий и стартовый уровень громкости.', 'Current and startup playback volume.'), Math.round(volume * 100), value => setVolume(value / 100), 0, 100, 1, '%')}
                {toggle('autoResumeLastTrack', copy('Продолжать последнюю композицию при запуске', 'Resume last track on startup'), copy('Включает воспроизведение последнего выбранного трека после запуска MusPlay.', 'Resume the last selected track when MusPlay starts.'))}
                {toggle('rememberPosition', copy('Запоминать позицию воспроизведения', 'Remember playback position'), copy('При следующем запуске трек откроется с того места, где ты остановился.', 'The next time you open MusPlay, the track resumes from where you stopped.'))}
                {toggle('autoPlayNext', copy('Автоматически включать следующий трек', 'Automatically play the next track'), copy('После окончания композиции плеер перейдёт к следующей в очереди.', 'Move to the next queued track when the current song ends.'), true)}
              </SectionPanel>
              <SectionPanel title={copy('Плавность переключения', 'Track transitions')} description={copy('Мягкое затухание и появление звука вместо резкого переключения.', 'Fade audio out and back in instead of abrupt track changes.')}>
                {toggle('smoothTransitions', copy('Плавные переходы', 'Smooth transitions'), copy('При ручном переключении звук плавно затухает; новая композиция постепенно набирает громкость.', 'When you switch tracks manually, the current audio fades out and the next track fades in.'))}
                {range(copy('Длительность перехода', 'Transition duration'), copy('Чем выше значение, тем мягче переход.', 'Higher values create a slower fade.'), preferences.transitionDuration || 1200, value => setPreference('transitionDuration', value), 300, 3000, 100, ['ru', 'kk'].includes(language) ? ' мс' : ' ms')}
              </SectionPanel>
            </>}

            {activeSection === 'appearance' && <>
              <SectionPanel title={copy('Язык и тема', 'Language and theme')}>
                {row(t('interfaceLanguage', language), t('savedOnDevice', language), <SelectControl value={language} onChange={setLanguage} options={[
                  ['ru','Русский'],['en','English'],['es','Español'],['fr','Français'],['de','Deutsch'],['pt','Português'],['it','Italiano'],['pl','Polski'],['uk','Українська'],['tr','Türkçe'],['ar','العربية'],['zh-CN','简体中文'],['ja','日本語'],['ko','한국어'],['hi','हिन्दी'],['id','Bahasa Indonesia'],['vi','Tiếng Việt'],['nl','Nederlands'],['az','Azərbaycanca'],['bn','বাংলা'],['he','עברית'],['kk','Қазақша'],['be','Беларуская']
                ].map(([value,label]) => ({ value, label }))}/>)}
                {row(t('appTheme', language), t('themeHint', language), <SelectControl value={theme} onChange={setTheme} options={[{value:'purple',label:t('themePurple',language)},{value:'dark',label:t('themeDark',language)},{value:'black',label:t('themeOLED',language)}]}/>, true)}
              </SectionPanel>
              <SectionPanel title={copy('Цвет и масштаб', 'Color and scale')} description={copy('Подстрой акцентный цвет и размер элементов интерфейса.', 'Adjust the accent color and interface scale.')}>
                {row(copy('Цвет акцента', 'Accent color'), copy('Используется для выделенных элементов и интерактивных деталей.', 'Used for selected items and interactive details.'), <div className="flex gap-2">{[{id:'purple',color:'#a855f7',label:copy('Фиолетовый','Purple')},{id:'pink',color:'#ec4899',label:copy('Розовый','Pink')},{id:'blue',color:'#3b82f6',label:copy('Синий','Blue')},{id:'cyan',color:'#06b6d4',label:copy('Бирюзовый','Cyan')},{id:'green',color:'#22c55e',label:copy('Зелёный','Green')}].map(item => <button key={item.id} onClick={() => setPreference('accentColor', item.id)} title={item.label} aria-label={item.label} className={`w-7 h-7 rounded-full border-2 ${preferences.accentColor === item.id ? 'border-white scale-110' : 'border-white/20'}`} style={{background:item.color}}/>)}</div>)}
                {range(copy('Масштаб интерфейса', 'Interface scale'), copy('Увеличивает или уменьшает элементы MusPlay.', 'Makes MusPlay interface elements larger or smaller.'), preferences.uiScale || 100, value => setPreference('uiScale', value), 85, 115, 5, '%')}
                {toggle('compactLists', copy('Компактные списки', 'Compact lists'), copy('Уменьшает высоту строк треков и плотнее размещает элементы.', 'Reduces track-row height and makes lists more compact.'))}
                {toggle('showRightPanel', copy('Показывать правую панель', 'Show the right panel'), copy('Отображает блок «Сейчас играет» и очередь справа.', 'Shows Now Playing and the queue on the right.'), true)}
                {toggle('showUnavailableTracks', copy('Показывать недоступные файлы', 'Show unavailable files'), copy('Оставляет в списке записи о перемещённых или временно недоступных аудиофайлах.', 'Keep entries for moved or temporarily unavailable audio files.'), true)}
              </SectionPanel>
              <SectionPanel title={copy('Анимации', 'Motion')}>
                {toggle('animationsEnabled', copy('Анимации интерфейса', 'Interface animations'), copy('Плавные появления окон, переключение разделов и анимации кнопок.', 'Smooth panel entrances, section changes and button interactions.'))}
                {toggle('reduceMotion', copy('Уменьшить движение', 'Reduce motion'), copy('Минимизирует перемещения и длительность анимаций, даже если они включены.', 'Reduces movement and shortens animations even when animations are enabled.'), true)}
              </SectionPanel>
            </>}

            {activeSection === 'library' && <>
              <SectionPanel title={copy('Сканирование медиатеки', 'Library scanning')} description={copy('Управляй тем, когда MusPlay ищет новые файлы в выбранных папках.', 'Choose when MusPlay looks for new files in your music folders.')}>
                {toggle('autoScanAtStartup', copy('Сканировать папки при запуске', 'Scan folders on startup'), copy('Новые композиции из сохранённых папок будут добавляться автоматически.', 'New tracks from your saved folders are added automatically.'))}
                {select('rescanInterval', copy('Повторное сканирование', 'Rescan interval'), copy('Автоматически проверять папки, пока MusPlay открыт.', 'Automatically rescan folders while MusPlay is running.'), [{value:'never',label:copy('Не повторять','Never')},{value:'15m',label:copy('Каждые 15 минут','Every 15 minutes')},{value:'1h',label:copy('Каждый час','Every hour')},{value:'6h',label:copy('Каждые 6 часов','Every 6 hours')}], true)}
                <div className="py-4"><div className="flex flex-wrap gap-2"><button onClick={addMusicFolders} disabled={scanningMusic} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm"><FolderPlus size={15}/>{copy('Добавить папку','Add folder')}</button><button onClick={() => scanFolders()} disabled={scanningMusic || !musicFolders.length} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 hover:bg-white/10 disabled:opacity-40 text-sm"><RefreshCw size={15} className={scanningMusic ? 'animate-spin' : ''}/>{copy('Сканировать сейчас','Scan now')}</button></div>
                  {musicFolders.length ? <div className="space-y-2 mt-4">{musicFolders.map(folder => { const excluded = (preferences.excludedFolders || []).includes(folder); return <div key={folder} className="flex items-center gap-2 rounded-xl bg-black/15 border border-white/5 px-3 py-2"><FolderOpen size={15} className="text-purple-300 shrink-0"/><span className="text-xs text-gray-300 min-w-0 flex-1 break-all">{folder}</span><label className="flex items-center gap-2 text-[11px] text-gray-400"><input type="checkbox" checked={excluded} onChange={event => { const next = new Set(preferences.excludedFolders || []); if (event.target.checked) next.add(folder); else next.delete(folder); setPreference('excludedFolders', [...next]); }} className="accent-purple-500"/>{copy('Исключить','Exclude')}</label><button onClick={() => removeMusicFolder(folder)} title={copy('Удалить папку','Remove folder')} className="p-1.5 text-gray-500 hover:text-red-300"><Trash2 size={14}/></button></div>; })}</div> : <p className="text-xs text-gray-500 mt-4">{ft('noFolders', language)}</p>}
                  {scanStatus && <p className="text-xs text-purple-200 mt-3">{scanStatus}</p>}
                </div>
              </SectionPanel>
              <SectionPanel title={copy('Кэш библиотеки', 'Library cache')} description={copy('Работает с сохранёнными обложками; музыкальные файлы и теги не удаляются.', 'Manages cached artwork only; music files and tags are not deleted.')}>
                <SettingRow title={copy('Очистить кэш обложек', 'Clear artwork cache')} description={copy('Удаляет сохранённые в библиотеке изображения обложек. Для локальных файлов MusPlay сможет прочитать их из аудиофайла повторно.', 'Removes cached cover images. MusPlay can read embedded artwork from local audio files again.')} control={<button onClick={async () => { if (!window.confirm(copy('Очистить сохранённые обложки? Они могут быть повторно прочитаны из файлов.', 'Clear cached artwork? It can be read again from local files.'))) return; await usePlayerStore.getState().clearArtworkCache(); setStatus(copy('Кэш обложек очищен.', 'Artwork cache cleared.')); }} className="px-3 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/10">{copy('Очистить','Clear')}</button>} last/>
              </SectionPanel>
            </>}

            {activeSection === 'lyrics' && <>
              <SectionPanel title={copy('Автоматический поиск', 'Automatic lyrics search')} description={copy('Настрой, когда MusPlay ищет синхронизированный текст.', 'Choose when MusPlay searches for synchronized lyrics.')}>
                {toggle('autoSearchLyrics', copy('Искать текст при смене композиции', 'Search lyrics when the track changes'), copy('Поиск выполняется в фоне и использует локальный кэш, если текст уже сохранён.', 'Search runs in the background and uses the local cache when lyrics have already been saved.'))}
                {toggle('autoOpenLyrics', copy('Автоматически открывать экран текста', 'Automatically open the lyrics screen'), copy('Экран текста будет открываться при каждой смене композиции.', 'The lyrics screen opens automatically whenever the track changes.'), true)}
              </SectionPanel>
              <SectionPanel title={copy('Отображение текста', 'Lyrics appearance')}>
                {select('lyricsTextSize', copy('Размер текста', 'Lyrics text size'), copy('Изменяет размер строк в полноэкранном режиме текста.', 'Changes the line size in the lyrics view.'), [{value:'small',label:copy('Маленький','Small')},{value:'normal',label:copy('Обычный','Normal')},{value:'large',label:copy('Большой','Large')}])}
                {select('lyricsScrollSpeed', copy('Прокрутка текста', 'Lyrics scrolling'), copy('Выбери скорость анимированной прокрутки к текущей строке.', 'Choose how quickly the current line is brought into view.'), [{value:'slow',label:copy('Медленная','Slow')},{value:'normal',label:copy('Обычная','Normal')},{value:'fast',label:copy('Быстрая','Fast')}], true)}
              </SectionPanel>
              <SectionPanel title={copy('Офлайн-доступ', 'Offline access')}>
                {toggle('cacheLyricsOffline', copy('Сохранять найденные тексты локально', 'Save found lyrics locally'), copy('Успешно найденные тексты сохраняются на устройстве и доступны без интернета.', 'Successfully found lyrics are stored on this device and remain available offline.'))}
                <SettingRow title={copy('Очистить кэш текстов', 'Clear lyrics cache')} description={copy('Удаляет автоматически найденные тексты из локального кэша. Импортированные вручную LRC-файлы не затрагиваются.', 'Removes automatically fetched lyrics from the local cache. Manually imported LRC files are kept.')} control={<button onClick={clearLyricsCache} className="px-3 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/10">{copy('Очистить кэш','Clear cache')}</button>} last/>
              </SectionPanel>
            </>}

            {activeSection === 'system' && <>
              <SectionPanel title={copy('Запуск и работа в фоне', 'Startup and background')}>
                {row(copy('Запускать вместе с Windows', 'Start with Windows'), copy('MusPlay будет запускаться при входе в Windows.', 'Launch MusPlay when you sign in to Windows.'), <Toggle checked={startupWithWindows} disabled={!startupLoaded || savingSystemSetting} onChange={toggleStartup}/>)}
                {row(t('minimizeToTray', language), t('trayDesc', language), <Toggle checked={minimizeToTray} disabled={!trayLoaded || savingSystemSetting} onChange={toggleTray}/>)}
                {toggle('trackNotifications', copy('Уведомления о смене трека', 'Track change notifications'), copy('Показывает системное уведомление Windows с названием новой композиции.', 'Shows a Windows notification with the title of the new track.'), true)}
              </SectionPanel>
              <SectionPanel title={copy('Управление', 'Controls')}>
                <SettingRow title={t('hardwareKeys', language)} description={t('hardwareKeysDesc', language)} control={<span className={`rounded-lg border px-3 py-2 text-xs font-medium ${mediaShortcutStatus?.unavailable?.length ? 'border-amber-400/20 bg-amber-400/10 text-amber-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>{mediaShortcutStatus ? `${mediaShortcutStatus.registered?.length || 0}/${mediaShortcutStatus.supported?.length || 4} ${t('ready',language)}` : t('checking',language)}</span>}/>
                {mediaShortcutStatus?.unavailable?.length > 0 && <p className="pb-3 text-xs text-amber-200/90">{t('keysUnavailable', language)}</p>}
                <div className="py-4 border-b border-white/[0.07]"><div className="flex items-center gap-2 mb-3"><Keyboard size={17} className="text-purple-300"/><p className="text-sm font-medium">{copy('Сочетания клавиш', 'Keyboard shortcuts')}</p></div><div className="space-y-2">{[{key:'shortcutPlayPause',label:copy('Воспроизведение / пауза','Play / pause')},{key:'shortcutPrevious',label:copy('Предыдущий трек','Previous track')},{key:'shortcutNext',label:copy('Следующий трек','Next track')}].map(item => <div key={item.key} className="flex items-center justify-between gap-3"><span className="text-xs text-gray-400">{item.label}</span><button onClick={() => setCapturingShortcut(item.key)} className="min-w-[150px] rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white hover:border-purple-400/50">{capturingShortcut === item.key ? copy('Нажми сочетание…','Press a shortcut…') : String(preferences[item.key] || '').replace('ArrowRight','→').replace('ArrowLeft','←')}</button></div>)}</div><p className="text-[11px] text-gray-500 mt-3">{copy('Работают, пока окно MusPlay активно. Для отмены записи нажми Esc.', 'Shortcuts work while the MusPlay window is focused. Press Esc to cancel recording.')}</p></div>
                <SettingRow title={copy('Аудиофайлы по умолчанию', 'Default audio app')} description={copy('MusPlay поддерживает открытие аудиофайлов из Проводника. Выбор приложения по умолчанию выполняется в настройках Windows.', 'MusPlay can open audio files from File Explorer. Choose the default app in Windows Settings.')} control={<button onClick={() => window.electronAPI?.openDefaultAppsSettings?.()} className="px-3 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/10">{copy('Открыть Windows','Open Windows')}</button>} last/>
              </SectionPanel>
              <SectionPanel title={copy('Резервная копия', 'Backup and restore')} description={copy('Сохраняет язык, тему, параметры воспроизведения, внешний вид, папки и эквалайзер. Музыкальные файлы не копируются.', 'Backs up language, theme, playback, appearance, folders and equalizer settings. Music files are not copied.')}>
                <div className="flex flex-wrap gap-2 py-4"><button onClick={exportBackup} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-sm"><Download size={15}/>{copy('Экспортировать настройки','Export settings')}</button><button onClick={() => importRef.current?.click()} disabled={importingBackup} className="inline-flex items-center gap-2 rounded-xl border border-white/10 hover:bg-white/10 px-4 py-2.5 text-sm disabled:opacity-50"><Upload size={15}/>{copy('Восстановить из файла','Restore from file')}</button><input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={importBackup}/></div>
                <SettingRow title={copy('Сбросить настройки', 'Reset settings')} description={copy('Вернёт значения по умолчанию. Библиотека, плейлисты и файлы останутся на месте.', 'Restores defaults. Your library, playlists and files remain untouched.')} control={<button onClick={resetPreferences} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-red-400/20 text-red-200 hover:bg-red-500/10 text-sm"><RotateCcw size={14}/>{copy('Сбросить','Reset')}</button>} last/>
              </SectionPanel>
            </>}

            {activeSection === 'about' && <>
              <SectionPanel title={copy('MusPlay', 'MusPlay')} description={t('aboutDescription', language)}>
                <div className="flex items-center justify-between py-4"><div><p className="font-semibold">MusPlay <span className="text-purple-300 font-normal">v{version}</span></p><p className="text-xs text-gray-500 mt-1">{copy('Локальный музыкальный плеер для Windows.', 'A local music player for Windows.')}</p></div><Music2 size={30} className="text-purple-300"/></div>
                <SettingRow title={copy('Проверка обновлений', 'Check for updates')} description={t('releasesPublished', language)} control={<button onClick={check} disabled={checking} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 px-4 py-2.5 text-sm"><RefreshCw size={15} className={checking ? 'animate-spin' : ''}/>{t('checkUpdates', language)}</button>}/>
                {status && <p className="text-sm text-purple-200 py-3">{status}</p>}
                {updateState?.updateAvailable && <button onClick={() => open(updateState.releasesUrl || RELEASES_URL)} className="pb-3 text-sm text-purple-300 hover:text-white inline-flex items-center gap-1">{t('downloadVersion', language, { latestVersion: updateState.latestVersion })}<ExternalLink size={14}/></button>}
              </SectionPanel>
              <SectionPanel title={copy('Сообщество и разработка', 'Community and development')}>
                <SettingRow title="GitHub" description={copy('Исходный код, выпуски и сообщения об ошибках.', 'Source code, releases and issue tracking.')} control={<button onClick={() => open(GITHUB_URL)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 hover:bg-white/10 text-sm"><Github size={16}/>{copy('Открыть','Open')}<ExternalLink size={13}/></button>}/>
                <SettingRow title="Telegram" description={copy('Новости, объявления и развитие MusPlay.', 'News, announcements and MusPlay updates.')} control={<button onClick={() => open(TELEGRAM_URL)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 hover:bg-white/10 text-sm"><Send size={16}/>{copy('Открыть канал','Open channel')}<ExternalLink size={13}/></button>}/>
                <SettingRow title={copy('Лицензии', 'Licenses')} description={copy('Сведения о сторонних библиотеках и лицензиях доступны в файлах проекта.', 'Third-party library and license information is available in the project files.')} control={<ShieldCheck size={18} className="text-purple-300"/>} last/>
              </SectionPanel>
              <p className="text-[11px] text-gray-600 px-2">{t('preferencesStored', language)}</p>
            </>}
          </div>
        </div>
      </div>
    </main>
  );
}
