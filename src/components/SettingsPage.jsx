import { useEffect, useState } from 'react';
import { Settings, Languages, Palette, Info, Github, RefreshCw, ExternalLink, CheckCircle2, MonitorCog } from 'lucide-react';

const RELEASES_URL = 'https://github.com/musplayteam/musplay_musicplayer/releases';

export default function SettingsPage({ language, setLanguage, theme, setTheme, appVersion, onCheckUpdates, updateState }) {
  const en = language === 'en';
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('');
  const [version, setVersion] = useState(appVersion || '1.1.0');
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [trayPreferenceLoaded, setTrayPreferenceLoaded] = useState(false);
  const [savingTrayPreference, setSavingTrayPreference] = useState(false);
  const [mediaShortcutStatus, setMediaShortcutStatus] = useState(null);
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
      if (active) { setMinimizeToTray(Boolean(value)); setTrayPreferenceLoaded(true); }
    }).catch(() => { if (active) setTrayPreferenceLoaded(true); });
    return () => { active = false; };
  }, []);

  const toggleTrayPreference = async (enabled) => {
    const previous = minimizeToTray;
    setMinimizeToTray(enabled);
    setSavingTrayPreference(true);
    try {
      const saved = await window.electronAPI?.setMinimizeToTray?.(enabled);
      if (typeof saved === 'boolean') setMinimizeToTray(saved);
    } catch (error) {
      setMinimizeToTray(previous);
      setStatus(en ? 'Could not save the tray preference.' : 'Не удалось сохранить настройку системного трея.');
    } finally {
      setSavingTrayPreference(false);
    }
  };

  const check = async () => {
    setChecking(true); setStatus(en ? 'Checking GitHub Releases…' : 'Проверяю GitHub Releases…');
    const result = await onCheckUpdates();
    setChecking(false);
    if (!result) setStatus(en ? 'Could not check for updates. Check your internet connection.' : 'Не удалось проверить обновления. Проверь подключение к интернету.');
    else if (result.updateAvailable) setStatus(en ? `Update ${result.latestVersion} is available.` : `Доступно обновление ${result.latestVersion}.`);
    else if (result.error) setStatus(en ? 'Could not check updates right now.' : 'Сейчас не удалось проверить обновления.');
    else setStatus(en ? `You are using the latest available version (${result.currentVersion}).` : `У тебя актуальная версия (${result.currentVersion}).`);
  };

  const open = (url) => window.electronAPI?.openExternal ? window.electronAPI.openExternal(url) : window.open(url, '_blank', 'noopener,noreferrer');
  const panel = 'rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:p-6';
  const select = 'rounded-xl border border-white/10 bg-[#241536] px-3 py-2.5 text-sm text-white outline-none focus:border-purple-400';
  return <main data-wheel-region="true" className="flex-1 min-w-0 min-h-0 h-full p-6 md:p-8 overflow-x-hidden overflow-y-auto overscroll-contain">
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-7">
        <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-300/20 flex items-center justify-center"><Settings size={22} className="text-purple-300" /></div>
        <div><h1 className="text-3xl font-bold">{en ? 'Settings' : 'Настройки'}</h1><p className="text-sm text-gray-400 mt-1">{en ? 'Personalize MusPlay to your preferences.' : 'Настрой MusPlay под себя.'}</p></div>
      </div>

      <section className={`${panel} mb-4`}>
        <h2 className="font-semibold flex items-center gap-2 mb-5"><Languages size={18} className="text-pink-300" />{en ? 'Language' : 'Язык приложения'}</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="text-sm font-medium">{en ? 'Interface language' : 'Язык интерфейса'}</p><p className="text-xs text-gray-400 mt-1">{en ? 'The setting is saved on this device.' : 'Настройка сохраняется на этом устройстве.'}</p></div><select className={select} value={language} onChange={e => setLanguage(e.target.value)}><option value="ru">Русский</option><option value="en">English</option></select></div>
      </section>

      <section className={`${panel} mb-4`}>
        <h2 className="font-semibold flex items-center gap-2 mb-5"><Palette size={18} className="text-pink-300" />{en ? 'Appearance' : 'Внешний вид'}</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="text-sm font-medium">{en ? 'Application theme' : 'Тема приложения'}</p><p className="text-xs text-gray-400 mt-1">{en ? 'Choose the background style.' : 'Выбери оформление фона приложения.'}</p></div><select className={select} value={theme} onChange={e => setTheme(e.target.value)}><option value="purple">{en ? 'MusPlay Purple' : 'Фиолетовая MusPlay'}</option><option value="dark">{en ? 'Dark' : 'Тёмная'}</option><option value="black">{en ? 'OLED Black' : 'Чёрная (OLED)'}</option></select></div>
      </section>

      <section className={`${panel} mb-4`}>
        <h2 className="font-semibold flex items-center gap-2 mb-5"><MonitorCog size={18} className="text-pink-300" />{en ? 'App controls' : 'Управление приложением'}</h2>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-5 border-b border-white/10">
          <div className="max-w-2xl">
            <p className="text-sm font-medium">{en ? 'Hardware media keys' : 'Мультимедийные клавиши клавиатуры'}</p>
            <p className="text-xs text-gray-400 mt-1">{en
              ? 'Play/Pause, Previous, Next and Stop work globally, even when MusPlay is minimized. Fn combinations are supported when the keyboard reports them to Windows as standard media keys.'
              : 'Воспроизведение/пауза, предыдущий, следующий трек и остановка работают даже когда MusPlay свёрнут. Сочетания с Fn распознаются, если клавиатура передаёт их Windows как стандартные мультимедийные команды.'}</p>
          </div>
          <span className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium ${mediaShortcutStatus && mediaShortcutStatus.unavailable?.length ? 'border-amber-400/20 bg-amber-400/10 text-amber-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>
            {mediaShortcutStatus ? `${mediaShortcutStatus.registered?.length || 0}/${mediaShortcutStatus.supported?.length || 4} ${en ? 'ready' : 'готово'}` : (en ? 'Checking…' : 'Проверка…')}
          </span>
        </div>
        {mediaShortcutStatus?.unavailable?.length > 0 && <p className="mt-3 text-xs text-amber-200/90">{en
          ? 'Some media keys could not be registered because Windows or another application is already using them.'
          : 'Некоторые мультимедийные клавиши не удалось зарегистрировать: возможно, их уже использует Windows или другая программа.'}</p>}
        <label className={`flex items-center justify-between gap-4 pt-5 ${trayPreferenceLoaded ? 'cursor-pointer' : 'opacity-60'}`}>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{en ? 'Minimize to system tray' : 'Сворачивать в системный трей'}</span>
            <span className="block text-xs text-gray-400 mt-1">{en
              ? 'When enabled, both the minimize and close buttons hide MusPlay in the notification area. Music keeps playing in the background.'
              : 'При включении кнопки «Свернуть» и «Закрыть» будут прятать MusPlay в область уведомлений. Музыка продолжит играть в фоне.'}</span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-purple-500"
            checked={minimizeToTray}
            disabled={!trayPreferenceLoaded || savingTrayPreference}
            onChange={event => toggleTrayPreference(event.target.checked)}
            aria-label={en ? 'Minimize to system tray' : 'Сворачивать в системный трей'}
          />
        </label>
      </section>

      <section className={`${panel} mb-4`}>
        <h2 className="font-semibold flex items-center gap-2 mb-5"><RefreshCw size={18} className="text-pink-300" />{en ? 'Updates' : 'Обновления'}</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><p className="text-sm font-medium">{en ? 'Installed version' : 'Установленная версия'} <span className="text-purple-300">v{version}</span></p><p className="text-xs text-gray-400 mt-1">{en ? 'New releases are published on GitHub.' : 'Новые версии публикуются в GitHub Releases.'}</p></div><button onClick={check} disabled={checking} className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 px-4 py-2.5 text-sm font-medium transition"><RefreshCw size={15} className={checking ? 'animate-spin' : ''}/>{en ? 'Check for updates' : 'Проверить обновления'}</button></div>
        {(status || updateState?.error) && <p className="mt-4 text-sm text-gray-300">{status}</p>}
        {updateState?.updateAvailable && <button onClick={() => open(updateState.releasesUrl || RELEASES_URL)} className="mt-3 text-sm text-purple-300 hover:text-white inline-flex items-center gap-1">{en ? `Download version ${updateState.latestVersion}` : `Скачать версию ${updateState.latestVersion}`} <ExternalLink size={14}/></button>}
      </section>

      <section className={panel}>
        <h2 className="font-semibold flex items-center gap-2 mb-5"><Info size={18} className="text-pink-300" />{en ? 'About MusPlay' : 'О приложении'}</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><p className="text-lg font-bold">MusPlay <span className="text-sm font-normal text-gray-400">v{version}</span></p><p className="text-sm text-gray-400 mt-1">{en ? 'A local music player for Windows.' : 'Локальный музыкальный плеер для Windows.'}</p></div><button onClick={() => open('https://github.com/musplayteam/musplay_musicplayer')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 hover:bg-white/10 px-4 py-2.5 text-sm transition"><Github size={16}/>{en ? 'Source code on GitHub' : 'Исходный код на GitHub'}<ExternalLink size={13}/></button></div>
        <div className="mt-4 pt-4 border-t border-white/10 text-xs text-gray-500 flex items-center gap-2"><MonitorCog size={14}/>{en ? 'Preferences are stored locally on this device.' : 'Настройки хранятся локально на этом устройстве.'}</div>
      </section>
    </div>
  </main>;
}
