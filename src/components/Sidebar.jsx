import { useEffect, useState } from 'react';
import {
  Home, Heart, ListMusic, Plus, Library, Clock3, Disc3, Users, FileMusic,
  Settings, Search, ChevronDown, Folder, ListVideo
} from 'lucide-react';
import { ft } from '../feature-i18n';
import usePlayerStore from '../store/playerStore';

const SIDEBAR_LABELS = {
    ru: ['Главная','Поиск по библиотеке','Поиск текста','Все плейлисты','Моя музыка','Мне нравится','Исполнители','Альбомы','История','Настройки','ПЛЕЙЛИСТЫ','Пока пусто','Название...'],
    en: ['Home','Search library','Search lyrics','All playlists','My music','Liked songs','Artists','Albums','History','Settings','PLAYLISTS','Nothing here yet','Playlist name...'],
    es: ['Inicio','Buscar en la biblioteca','Buscar letras','Todas las listas','Mi música','Me gusta','Artistas','Álbumes','Historial','Ajustes','LISTAS','Todavía está vacío','Nombre de la lista...'],
    fr: ['Accueil','Rechercher dans la bibliothèque','Rechercher des paroles','Toutes les playlists','Ma musique','Titres aimés','Artistes','Albums','Historique','Paramètres','PLAYLISTS','Encore vide','Nom de la playlist...'],
    de: ['Startseite','Bibliothek durchsuchen','Songtexte suchen','Alle Playlists','Meine Musik','Gefällt mir','Künstler','Alben','Verlauf','Einstellungen','PLAYLISTS','Noch leer','Playlistname...'],
    pt: ['Início','Pesquisar na biblioteca','Pesquisar letras','Todas as playlists','Minha música','Curtidas','Artistas','Álbuns','Histórico','Configurações','PLAYLISTS','Ainda está vazio','Nome da playlist...'],
    it: ['Home','Cerca nella libreria','Cerca testi','Tutte le playlist','La mia musica','Brani preferiti','Artisti','Album','Cronologia','Impostazioni','PLAYLIST','Ancora vuoto','Nome playlist...'],
    pl: ['Strona główna','Szukaj w bibliotece','Szukaj tekstów','Wszystkie playlisty','Moja muzyka','Polubione','Wykonawcy','Albumy','Historia','Ustawienia','PLAYLISTY','Na razie pusto','Nazwa playlisty...'],
    uk: ['Головна','Пошук у бібліотеці','Пошук текстів','Усі плейлисти','Моя музика','Уподобане','Виконавці','Альбоми','Історія','Налаштування','ПЛЕЙЛИСТИ','Поки порожньо','Назва плейлиста...'],
    tr: ['Ana sayfa','Kitaplıkta ara','Şarkı sözü ara','Tüm çalma listeleri','Müziğim','Beğenilenler','Sanatçılar','Albümler','Geçmiş','Ayarlar','ÇALMA LİSTELERİ','Henüz boş','Çalma listesi adı...'],
    ar: ['الرئيسية','البحث في المكتبة','البحث عن كلمات الأغاني','كل قوائم التشغيل','موسيقاي','أعجبني','الفنانون','الألبومات','السجل','الإعدادات','قوائم التشغيل','لا يوجد شيء بعد','اسم قائمة التشغيل...'],
    'zh-CN': ['主页','搜索音乐库','搜索歌词','所有播放列表','我的音乐','我喜欢的歌曲','艺人','专辑','历史记录','设置','播放列表','暂时为空','播放列表名称...'],
    ja: ['ホーム','ライブラリを検索','歌詞を検索','すべてのプレイリスト','マイミュージック','お気に入り','アーティスト','アルバム','履歴','設定','プレイリスト','まだありません','プレイリスト名...'],
    ko: ['홈','라이브러리 검색','가사 검색','모든 재생목록','내 음악','좋아요','아티스트','앨범','기록','설정','재생목록','아직 비어 있음','재생목록 이름...'],
    hi: ['होम','लाइब्रेरी खोजें','गीत के बोल खोजें','सभी प्लेलिस्ट','मेरा संगीत','पसंदीदा','कलाकार','एल्बम','इतिहास','सेटिंग्स','प्लेलिस्ट','अभी खाली है','प्लेलिस्ट का नाम...'],
    id: ['Beranda','Cari pustaka','Cari lirik','Semua playlist','Musik saya','Disukai','Artis','Album','Riwayat','Pengaturan','PLAYLIST','Belum ada','Nama playlist...'],
    vi: ['Trang chủ','Tìm trong thư viện','Tìm lời bài hát','Tất cả danh sách phát','Nhạc của tôi','Đã thích','Nghệ sĩ','Album','Lịch sử','Cài đặt','DANH SÁCH PHÁT','Chưa có mục nào','Tên danh sách phát...'],
    nl: ['Startpagina','Bibliotheek doorzoeken','Songteksten zoeken','Alle afspeellijsten','Mijn muziek','Vind-ik-leuks','Artiesten','Albums','Geschiedenis','Instellingen','AFSPEELLIJSTEN','Nog leeg','Naam afspeellijst...'],
    az: ['Ana səhifə','Kitabxanada axtar','Mahnı sözlərini axtar','Bütün pleylistlər','Musiqim','Bəyəndiklərim','İfaçılar','Albomlar','Tarixçə','Parametrlər','PLEYLISTLƏR','Hələ boşdur','Pleylistin adı...'],
    bn: ['হোম','লাইব্রেরিতে খুঁজুন','গানের কথা খুঁজুন','সব প্লেলিস্ট','আমার সঙ্গীত','পছন্দের গান','শিল্পী','অ্যালবাম','ইতিহাস','সেটিংস','প্লেলিস্ট','এখনও খালি','প্লেলিস্টের নাম...'],
    he: ['בית','חיפוש בספרייה','חיפוש מילות שירים','כל הפלייליסטים','המוזיקה שלי','אהבתי','אמנים','אלבומים','היסטוריה','הגדרות','פלייליסטים','עדיין ריק','שם הפלייליסט...'],
    kk: ['Басты бет','Кітапханадан іздеу','Ән мәтінін іздеу','Барлық плейлист','Менің музыкам','Ұнағандар','Орындаушылар','Альбомдар','Тарих','Баптаулар','ПЛЕЙЛИСТТЕР','Әзірше бос','Плейлист атауы...'],
    be: ['Галоўная','Пошук у бібліятэцы','Пошук тэкстаў','Усе плэйлісты','Мая музыка','Падабаецца','Выканаўцы','Альбомы','Гісторыя','Налады','ПЛЭЙЛІСТЫ','Пакуль пуста','Назва плэйліста...']
  }

const GROUP_LABELS = {
  ru: { search: 'Поиск', media: 'Медиатека' }, en: { search: 'Search', media: 'Media library' },
  es: { search: 'Buscar', media: 'Biblioteca' }, fr: { search: 'Recherche', media: 'Médiathèque' },
  de: { search: 'Suche', media: 'Mediathek' }, pt: { search: 'Buscar', media: 'Biblioteca' },
  it: { search: 'Cerca', media: 'Raccolta' }, pl: { search: 'Szukaj', media: 'Biblioteka' },
  uk: { search: 'Пошук', media: 'Медіатека' }, tr: { search: 'Ara', media: 'Kitaplık' },
  ar: { search: 'بحث', media: 'مكتبة الوسائط' }, 'zh-CN': { search: '搜索', media: '媒体库' },
  ja: { search: '検索', media: 'メディアライブラリ' }, ko: { search: '검색', media: '미디어 보관함' },
  hi: { search: 'खोजें', media: 'मीडिया लाइब्रेरी' }, id: { search: 'Cari', media: 'Pustaka media' },
  vi: { search: 'Tìm kiếm', media: 'Thư viện' }, nl: { search: 'Zoeken', media: 'Mediabibliotheek' },
  az: { search: 'Axtar', media: 'Media kitabxanası' }, bn: { search: 'অনুসন্ধান', media: 'মিডিয়া লাইব্রেরি' },
  he: { search: 'חיפוש', media: 'ספריית מדיה' }, kk: { search: 'Іздеу', media: 'Медиатека' },
  be: { search: 'Пошук', media: 'Медыятэка' }
};

export default function Sidebar({ currentView, setCurrentView, setSelectedPlaylistId, selectedPlaylistId, language = 'ru' }) {
  const { playlists, createPlaylist, library, favorites, history, queue } = usePlayerStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(currentView === 'search' || currentView === 'lyrics');
  const [libraryExpanded, setLibraryExpanded] = useState(['library', 'favorites', 'artists', 'albums', 'history'].includes(currentView));
  const l = SIDEBAR_LABELS[language] || SIDEBAR_LABELS.en;
  const copy = {
    home: l[0], search: GROUP_LABELS[language]?.search || GROUP_LABELS.en.search,
    librarySearch: l[1], lyricsSearch: l[2], media: GROUP_LABELS[language]?.media || GROUP_LABELS.en.media,
    myMusic: l[4], liked: l[5], artists: l[6], albums: l[7], history: l[8],
    playlists: l[3], empty: l[11], placeholder: l[12], settings: l[9],
    playlistHeading: l[10]
  };
  const queueLabel = ft('queueTitle', language);

  useEffect(() => {
    if (currentView === 'search' || currentView === 'lyrics') setSearchExpanded(true);
    if (['library', 'favorites', 'artists', 'albums', 'history'].includes(currentView)) setLibraryExpanded(true);
  }, [currentView]);

  const handleCreate = event => {
    event.preventDefault();
    if (newPlaylistName.trim()) {
      createPlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
      setIsCreating(false);
    }
  };
  const openPlaylist = id => { setSelectedPlaylistId(id); setCurrentView('playlist'); };
  const navClass = active => `musplay-nav-item flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${active ? 'is-active bg-purple-600/30 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`;
  const subClass = active => `flex w-full items-center gap-3 rounded-lg py-2 pl-9 pr-3 text-left text-sm transition ${active ? 'text-white bg-white/[0.07]' : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04]'}`;

  return (
    <aside data-wheel-region="true" className="musplay-sidebar w-64 min-w-[224px] min-h-0 h-full shrink-0 px-5 pt-6 pb-4 flex flex-col gap-5 overflow-hidden border-r border-white/5">
      <div className="flex items-center gap-2 shrink-0 px-1">
        <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center"><ListMusic size={18}/></div>
        <span className="font-bold text-lg">MusPlay</span>
      </div>

      <nav className="flex flex-col gap-1 shrink-0 max-h-[58%] overflow-y-auto overscroll-contain pr-1">
        <button onClick={() => setCurrentView('home')} className={navClass(currentView === 'home')}><Home size={18}/><span className="text-sm flex-1">{copy.home}</span></button>
        <button onClick={() => setSearchExpanded(value => !value)} className={navClass(currentView === 'search' || currentView === 'lyrics')} aria-expanded={searchExpanded}>
          <Search size={18}/><span className="text-sm flex-1">{copy.search}</span><ChevronDown size={15} className={`transition-transform ${searchExpanded ? 'rotate-180' : ''}`}/>
        </button>
        {searchExpanded && <div className="flex flex-col gap-0.5 pb-1">
          <button onClick={() => setCurrentView('search')} className={subClass(currentView === 'search')}><Library size={15}/>{copy.librarySearch}</button>
          <button onClick={() => setCurrentView('lyrics')} className={subClass(currentView === 'lyrics')}><FileMusic size={15}/>{copy.lyricsSearch}</button>
        </div>}
        <button onClick={() => setLibraryExpanded(value => !value)} className={navClass(['library','favorites','artists','albums','history'].includes(currentView))} aria-expanded={libraryExpanded}>
          <Folder size={18}/><span className="text-sm flex-1">{copy.media}</span><ChevronDown size={15} className={`transition-transform ${libraryExpanded ? 'rotate-180' : ''}`}/>
        </button>
        {libraryExpanded && <div className="flex flex-col gap-0.5 pb-1">
          <button onClick={() => setCurrentView('library')} className={subClass(currentView === 'library')}><Library size={15}/><span className="flex-1">{copy.myMusic}</span><span className="text-xs text-gray-600">{library.length}</span></button>
          <button onClick={() => setCurrentView('favorites')} className={subClass(currentView === 'favorites')}><Heart size={15}/><span className="flex-1">{copy.liked}</span><span className="text-xs text-gray-600">{favorites.length}</span></button>
          <button onClick={() => setCurrentView('artists')} className={subClass(currentView === 'artists')}><Users size={15}/>{copy.artists}</button>
          <button onClick={() => setCurrentView('albums')} className={subClass(currentView === 'albums')}><Disc3 size={15}/>{copy.albums}</button>
          <button onClick={() => setCurrentView('history')} className={subClass(currentView === 'history')}><Clock3 size={15}/><span className="flex-1">{copy.history}</span><span className="text-xs text-gray-600">{history.length}</span></button>
        </div>}
        <button onClick={() => setCurrentView('playlists')} className={navClass(currentView === 'playlists' || currentView === 'playlist')}><ListVideo size={18}/><span className="text-sm flex-1">{copy.playlists}</span></button>
        <button onClick={() => setCurrentView('queue')} className={navClass(currentView === 'queue')}><ListMusic size={18}/><span className="text-sm flex-1">{queueLabel}</span><span className="text-xs text-gray-600">{queue.length}</span></button>
      </nav>

      <section className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-xs uppercase text-gray-400 tracking-wider">{copy.playlistHeading}</h3>
          <button onClick={() => setIsCreating(true)} title={language === 'ru' ? 'Создать плейлист' : 'Create playlist'} className="text-gray-400 hover:text-white transition"><Plus size={16}/></button>
        </div>
        {isCreating && <form onSubmit={handleCreate} className="mb-3"><input type="text" value={newPlaylistName} onChange={event => setNewPlaylistName(event.target.value)} placeholder={copy.placeholder} className="w-full bg-white/5 border border-purple-500/50 rounded-lg px-2 py-2 text-sm text-white focus:outline-none" autoFocus onBlur={() => !newPlaylistName && setIsCreating(false)}/></form>}
        <div className="flex flex-col gap-1">
          {playlists.length === 0 && !isCreating && <p className="text-xs text-gray-500 px-3">{copy.empty}</p>}
          {playlists.map(playlist => <button key={playlist.id} onClick={() => openPlaylist(playlist.id)} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition text-left ${currentView === 'playlist' && playlist.id === selectedPlaylistId ? 'bg-purple-600/30 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><ListMusic size={15} className="text-purple-400 shrink-0"/><span className="text-sm truncate flex-1">{playlist.name}</span><span className="text-xs text-gray-600">{playlist.tracks.length}</span></button>)}
        </div>
      </section>

      <div className="shrink-0 border-t border-white/[0.08] pt-3">
        <button onClick={() => setCurrentView('settings')} className={navClass(currentView === 'settings')}><Settings size={18}/><span className="text-sm flex-1">{copy.settings}</span></button>
      </div>
    </aside>
  );
}
