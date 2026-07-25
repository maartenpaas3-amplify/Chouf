import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { LanguageToggle } from './LanguageToggle';

interface WelcomeViewProps {
  onSelectRole: (role: 'passagier' | 'chauffeur') => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ onSelectRole }) => {
  // Hook usage triggers re-render on language change
  useLanguage();

  return (
    <div className="relative w-full h-full min-h-[80vh] flex flex-col items-center justify-between p-6 bg-slate-50/50 text-slate-900 font-sans overflow-y-auto">
      {/* Language selector in top right */}
      <div className="w-full flex justify-end shrink-0 pt-1">
        <LanguageToggle />
      </div>

      {/* Main Branding Section */}
      <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center my-auto py-6">
        {/* Transparent Chouf PNG Logo */}
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-[#F57C00]/10 rounded-full blur-2xl transform scale-125" />
          <img
            src="https://i.ibb.co/ynMdVvwn/chouflogotransparant-1.png"
            alt="Chouf Logo"
            className="relative w-36 h-36 object-contain filter drop-shadow-md animate-fade-in"
          />
        </div>

        {/* Brand Name */}
        <h1 className="text-4xl font-black text-slate-900 tracking-[0.2em] ps-[0.2em] font-sans uppercase">
          CHOUF
        </h1>

        {/* Slogan */}
        <p className="text-slate-500 font-semibold text-base mt-2 tracking-wide">
          {t('welcome', 'slogan')}
        </p>

        {/* Subtitle / Prompt */}
        <div className="mt-8 mb-8 w-full">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {t('welcome', 'chooseMode')}
          </p>
        </div>

        {/* Choice Buttons */}
        <div className="w-full space-y-3.5">
          <button
            type="button"
            onClick={() => onSelectRole('passagier')}
            className="w-full py-4 px-6 bg-[#F57C00] hover:bg-[#e07000] active:bg-[#c76300] text-white font-extrabold text-base rounded-2xl shadow-lg shadow-[#F57C00]/25 transition-all active:scale-[0.98] flex items-center justify-center gap-3 border border-[#F57C00]"
          >
            <span className="text-xl">🙋‍♂️</span>
            <span>{t('welcome', 'passengerBtn')}</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectRole('chauffeur')}
            className="w-full py-4 px-6 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-900 font-extrabold text-base rounded-2xl border-2 border-[#F57C00] shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-3"
          >
            <span className="text-xl">🚖</span>
            <span className="text-[#F57C00]">{t('welcome', 'driverBtn')}</span>
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div className="w-full max-w-sm mx-auto text-center pt-4 pb-2 shrink-0">
        <p className="text-[11px] text-slate-400 font-medium">
          {t('welcome', 'footer')}
        </p>
      </div>
    </div>
  );
};
