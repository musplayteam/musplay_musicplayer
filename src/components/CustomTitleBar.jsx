import { useState, useEffect } from 'react';
import { Minus, Square, X, Music } from 'lucide-react';

export default function CustomTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      const checkMaximized = async () => {
        const maximized = await window.electronAPI.isMaximized();
        setIsMaximized(maximized);
      };
      checkMaximized();
      const timer = setInterval(checkMaximized, 800);
      return () => clearInterval(timer);
    }
  }, []);

  return (
    <div 
      className="fixed top-0 left-0 right-0 h-12 bg-[#0f0518] flex items-center justify-between select-none flex-shrink-0 z-50"
      style={{ 
        WebkitAppRegion: 'drag',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
      }}
    >
      {/* Логотип и название */}
      <div className="flex items-center gap-3 px-4">
        <div className="w-7 h-7 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center">
          <Music size={16} className="text-white" />
        </div>
        <span className="text-sm font-bold text-white tracking-wide">MusPlay</span>
      </div>

      {/* Кнопки управления окном */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' }}>
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="w-12 h-12 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition"
          title="Свернуть"
        >
          <Minus size={14} strokeWidth={2} />
        </button>
        
        <button
          onClick={() => {
            window.electronAPI?.maximize();
            setIsMaximized(!isMaximized);
          }}
          className="w-12 h-12 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition"
          title={isMaximized ? "Восстановить" : "Развернуть"}
        >
          <Square size={12} strokeWidth={2} />
        </button>
        
        <button
          onClick={() => window.electronAPI?.close()}
          className="w-12 h-12 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-500 transition"
          title="Закрыть"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}