import { useState } from 'react';
import { Home, Heart, ListMusic, Plus, Library, Clock3, Disc3, Users, FileMusic, Settings } from 'lucide-react';
import { ft } from '../feature-i18n';
import usePlayerStore from '../store/playerStore';

export default function Sidebar({ currentView, setCurrentView, setSelectedPlaylistId, selectedPlaylistId, language = 'ru' }) {
  const { playlists, createPlaylist, library, favorites, history, queue } = usePlayerStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const sidebarLabels = {
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
  };
  const l = sidebarLabels[language] || sidebarLabels.en;
  const labels = { home:l[0], search:l[1], lyrics:l[2], playlists:l[3], library:l[4], favorites:l[5], artists:l[6], albums:l[7], history:l[8], settings:l[9], playlistHeading:l[10], empty:l[11], playlistPlaceholder:l[12] };

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
            { id: 'queue', label: ft('queueTitle', language), Icon: ListMusic, count: queue.length },
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