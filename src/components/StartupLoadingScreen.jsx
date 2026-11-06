const COPY = {
  ru: { title: 'Подготавливаем вашу музыку', body: 'Восстанавливаем библиотеку, очередь и плейлисты', wait: 'Это может занять немного времени', errorTitle: 'Не удалось загрузить данные', errorBody: 'MusPlay не смог полностью восстановить сохранённые данные. Можно попробовать ещё раз или продолжить без их восстановления.', retry: 'Повторить', continue: 'Продолжить' },
  en: { title: 'Getting your music ready', body: 'Restoring your library, queue and playlists', wait: 'This may take a moment', errorTitle: 'Could not load your data', errorBody: 'MusPlay could not fully restore your saved data. Try again or continue without restoring it.', retry: 'Try again', continue: 'Continue' },
  es: { title: 'Preparando tu música', body: 'Restaurando tu biblioteca, cola y listas', wait: 'Esto puede tardar un momento', errorTitle: 'No se pudieron cargar tus datos', errorBody: 'MusPlay no pudo restaurar todos tus datos guardados. Inténtalo de nuevo o continúa sin restaurarlos.', retry: 'Reintentar', continue: 'Continuar' },
  fr: { title: 'Préparation de votre musique', body: 'Restauration de votre bibliothèque, file et playlists', wait: 'Cela peut prendre un instant', errorTitle: 'Impossible de charger vos données', errorBody: 'MusPlay n’a pas pu restaurer toutes vos données. Réessayez ou continuez sans restauration.', retry: 'Réessayer', continue: 'Continuer' },
  de: { title: 'Deine Musik wird vorbereitet', body: 'Bibliothek, Warteschlange und Playlists werden wiederhergestellt', wait: 'Das kann einen Moment dauern', errorTitle: 'Daten konnten nicht geladen werden', errorBody: 'MusPlay konnte deine gespeicherten Daten nicht vollständig wiederherstellen. Versuche es erneut oder fahre ohne Wiederherstellung fort.', retry: 'Erneut versuchen', continue: 'Weiter' },
  pt: { title: 'Preparando sua música', body: 'Restaurando sua biblioteca, fila e playlists', wait: 'Isso pode levar um instante', errorTitle: 'Não foi possível carregar seus dados', errorBody: 'O MusPlay não conseguiu restaurar todos os dados salvos. Tente novamente ou continue sem restaurá-los.', retry: 'Tentar novamente', continue: 'Continuar' },
  it: { title: 'Preparazione della musica', body: 'Ripristino di libreria, coda e playlist', wait: 'Potrebbe volerci qualche istante', errorTitle: 'Impossibile caricare i dati', errorBody: 'MusPlay non è riuscito a ripristinare tutti i dati salvati. Riprova oppure continua senza ripristinarli.', retry: 'Riprova', continue: 'Continua' },
  pl: { title: 'Przygotowywanie muzyki', body: 'Przywracanie biblioteki, kolejki i playlist', wait: 'To może chwilę potrwać', errorTitle: 'Nie udało się wczytać danych', errorBody: 'MusPlay nie mógł w pełni przywrócić zapisanych danych. Spróbuj ponownie lub kontynuuj bez przywracania.', retry: 'Ponów próbę', continue: 'Kontynuuj' },
  uk: { title: 'Готуємо вашу музику', body: 'Відновлюємо бібліотеку, чергу та плейлисти', wait: 'Це може зайняти трохи часу', errorTitle: 'Не вдалося завантажити дані', errorBody: 'MusPlay не зміг повністю відновити збережені дані. Спробуйте ще раз або продовжте без відновлення.', retry: 'Повторити', continue: 'Продовжити' },
  tr: { title: 'Müziğiniz hazırlanıyor', body: 'Kitaplığınız, sıranız ve çalma listeleriniz geri yükleniyor', wait: 'Bu biraz zaman alabilir', errorTitle: 'Veriler yüklenemedi', errorBody: 'MusPlay kayıtlı verilerinizi tam olarak geri yükleyemedi. Yeniden deneyin veya geri yüklemeden devam edin.', retry: 'Yeniden dene', continue: 'Devam et' },
  ar: { title: 'جارٍ تجهيز موسيقاك', body: 'استعادة مكتبتك وقائمة التشغيل وقوائمك', wait: 'قد يستغرق هذا بعض الوقت', errorTitle: 'تعذّر تحميل بياناتك', errorBody: 'لم يتمكن MusPlay من استعادة جميع بياناتك المحفوظة. حاول مجددًا أو تابع دون استعادتها.', retry: 'إعادة المحاولة', continue: 'متابعة' },
  'zh-CN': { title: '正在准备你的音乐', body: '正在恢复音乐库、播放队列和播放列表', wait: '这可能需要一点时间', errorTitle: '无法加载数据', errorBody: 'MusPlay 未能完整恢复已保存的数据。请重试，或不恢复数据继续使用。', retry: '重试', continue: '继续' },
  ja: { title: '音楽を準備しています', body: 'ライブラリ、キュー、プレイリストを復元しています', wait: '少し時間がかかる場合があります', errorTitle: 'データを読み込めませんでした', errorBody: '保存されたデータを完全に復元できませんでした。再試行するか、復元せずに続行してください。', retry: '再試行', continue: '続行' },
  ko: { title: '음악을 준비하고 있어요', body: '라이브러리, 대기열 및 재생목록을 복원하는 중', wait: '잠시 시간이 걸릴 수 있어요', errorTitle: '데이터를 불러오지 못했어요', errorBody: 'MusPlay가 저장된 데이터를 모두 복원하지 못했습니다. 다시 시도하거나 복원하지 않고 계속하세요.', retry: '다시 시도', continue: '계속' },
  hi: { title: 'आपका संगीत तैयार हो रहा है', body: 'लाइब्रेरी, कतार और प्लेलिस्ट बहाल की जा रही हैं', wait: 'इसमें थोड़ा समय लग सकता है', errorTitle: 'डेटा लोड नहीं हो सका', errorBody: 'MusPlay आपका सारा सहेजा हुआ डेटा बहाल नहीं कर सका। फिर से प्रयास करें या बिना बहाली के जारी रखें।', retry: 'पुनः प्रयास करें', continue: 'जारी रखें' },
  id: { title: 'Menyiapkan musik Anda', body: 'Memulihkan pustaka, antrean, dan daftar putar', wait: 'Ini mungkin perlu beberapa saat', errorTitle: 'Data tidak dapat dimuat', errorBody: 'MusPlay tidak dapat memulihkan semua data tersimpan. Coba lagi atau lanjutkan tanpa pemulihan.', retry: 'Coba lagi', continue: 'Lanjutkan' },
  vi: { title: 'Đang chuẩn bị nhạc của bạn', body: 'Đang khôi phục thư viện, hàng đợi và danh sách phát', wait: 'Quá trình này có thể mất một chút thời gian', errorTitle: 'Không thể tải dữ liệu', errorBody: 'MusPlay không thể khôi phục toàn bộ dữ liệu đã lưu. Hãy thử lại hoặc tiếp tục mà không khôi phục.', retry: 'Thử lại', continue: 'Tiếp tục' },
  nl: { title: 'Je muziek wordt klaargemaakt', body: 'Bibliotheek, wachtrij en afspeellijsten worden hersteld', wait: 'Dit kan even duren', errorTitle: 'Gegevens konden niet worden geladen', errorBody: 'MusPlay kon je opgeslagen gegevens niet volledig herstellen. Probeer het opnieuw of ga verder zonder herstel.', retry: 'Opnieuw proberen', continue: 'Doorgaan' },
  az: { title: 'Musiqiniz hazırlanır', body: 'Kitabxana, növbə və pleylistlər bərpa edilir', wait: 'Bu bir az vaxt apara bilər', errorTitle: 'Məlumatları yükləmək mümkün olmadı', errorBody: 'MusPlay saxlanmış məlumatların hamısını bərpa edə bilmədi. Yenidən cəhd edin və ya bərpa etmədən davam edin.', retry: 'Yenidən yoxla', continue: 'Davam et' },
  bn: { title: 'আপনার সঙ্গীত প্রস্তুত হচ্ছে', body: 'লাইব্রেরি, কিউ এবং প্লেলিস্ট পুনরুদ্ধার করা হচ্ছে', wait: 'এতে কিছুটা সময় লাগতে পারে', errorTitle: 'ডেটা লোড করা যায়নি', errorBody: 'MusPlay আপনার সংরক্ষিত সব ডেটা পুনরুদ্ধার করতে পারেনি। আবার চেষ্টা করুন অথবা পুনরুদ্ধার ছাড়াই চালিয়ে যান।', retry: 'আবার চেষ্টা করুন', continue: 'চালিয়ে যান' },
  he: { title: 'המוזיקה שלך מוכנה', body: 'הספרייה, התור ורשימות ההשמעה משוחזרים', wait: 'הפעולה עשויה להימשך מעט', errorTitle: 'לא ניתן לטעון את הנתונים', errorBody: 'MusPlay לא הצליח לשחזר את כל הנתונים השמורים. אפשר לנסות שוב או להמשיך ללא שחזור.', retry: 'ניסיון חוזר', continue: 'המשך' },
  kk: { title: 'Музыкаңыз дайындалуда', body: 'Кітапхана, кезек және ойнату тізімдері қалпына келтірілуде', wait: 'Бұл біраз уақыт алуы мүмкін', errorTitle: 'Деректер жүктелмеді', errorBody: 'MusPlay сақталған деректердің барлығын қалпына келтіре алмады. Қайталап көріңіз немесе қалпына келтірмей жалғастырыңыз.', retry: 'Қайталау', continue: 'Жалғастыру' },
  be: { title: 'Рыхтуем вашу музыку', body: 'Аднаўляем бібліятэку, чаргу і плэйлісты', wait: 'Гэта можа заняць крыху часу', errorTitle: 'Не ўдалося загрузіць даныя', errorBody: 'MusPlay не змог цалкам аднавіць захаваныя даныя. Паспрабуйце яшчэ раз або працягніце без аднаўлення.', retry: 'Паўтарыць', continue: 'Працягнуць' },
};

export default function StartupLoadingScreen({ language = 'en', error = false, closing = false, onRetry, onContinue }) {
  const normalizedLanguage = String(language || 'en').toLowerCase() === 'zh-cn' ? 'zh-CN' : language;
  const copy = COPY[normalizedLanguage] || COPY.en;

  return (
    <div className={`musplay-startup-overlay${closing ? ' is-closing' : ''}`} role="status" aria-live="polite">
      <div className="musplay-startup-ambient musplay-startup-ambient-one" />
      <div className="musplay-startup-ambient musplay-startup-ambient-two" />
      <div className="musplay-startup-content">
        <div className="musplay-startup-mark">
          <span className="musplay-startup-orbit" />
          <span className="musplay-startup-orbit-inner" />
          <img src="./icon.png" alt="" className="musplay-startup-icon" />
        </div>
        <div className="musplay-startup-brand">MusPlay</div>
        <div className="musplay-startup-version">YOUR MUSIC. YOUR SPACE.</div>
        <h1 className="musplay-startup-title">{error ? copy.errorTitle : copy.title}</h1>
        <p className="musplay-startup-description">{error ? copy.errorBody : copy.body}</p>
        {!error ? (
          <>
            <div className="musplay-startup-loader" aria-hidden="true"><span /></div>
            <p className="musplay-startup-hint">{copy.wait}</p>
          </>
        ) : (
          <div className="musplay-startup-actions">
            <button type="button" onClick={onRetry} className="musplay-startup-button primary">{copy.retry}</button>
            <button type="button" onClick={onContinue} className="musplay-startup-button secondary">{copy.continue}</button>
          </div>
        )}
      </div>
      <div className="musplay-startup-footer">MUSPLAY DESKTOP</div>
    </div>
  );
}
