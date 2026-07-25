import React from 'react';
import { useLanguage, setLanguage } from '../lib/i18n';

export const LanguageToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [lang] = useLanguage();

  return (
    <div className={`inline-flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80 text-xs font-extrabold shrink-0 whitespace-nowrap shadow-xs z-50 ${className}`}>
      <button
        type="button"
        onClick={() => setLanguage('fr')}
        className={`px-3 py-1 rounded-xl transition-all cursor-pointer select-none font-black ${
          lang === 'fr'
            ? 'bg-[#F57C00] text-white shadow-xs shadow-[#F57C00]/30 scale-[1.02]'
            : 'text-slate-500 hover:text-slate-900 font-bold'
        }`}
        title="Français"
      >
        FR
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`px-3 py-1 rounded-xl transition-all cursor-pointer select-none font-black ${
          lang === 'en'
            ? 'bg-[#F57C00] text-white shadow-xs shadow-[#F57C00]/30 scale-[1.02]'
            : 'text-slate-500 hover:text-slate-900 font-bold'
        }`}
        title="English"
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage('ar')}
        className={`px-3 py-1 rounded-xl transition-all cursor-pointer select-none font-black ${
          lang === 'ar'
            ? 'bg-[#F57C00] text-white shadow-xs shadow-[#F57C00]/30 scale-[1.02]'
            : 'text-slate-500 hover:text-slate-900 font-bold'
        }`}
        title="العربية"
      >
        ع
      </button>
    </div>
  );
};

