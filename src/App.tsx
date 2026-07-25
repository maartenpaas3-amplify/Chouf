import React, { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { PassengerView } from './components/PassengerView';
import { DriverView } from './components/DriverView';
import { WelcomeView } from './components/WelcomeView';
import { LanguageToggle } from './components/LanguageToggle';
import { PWAPrompt } from './components/PWAPrompt';
import { t, useLanguage } from './lib/i18n';
import { triggerPWAInstall, useIsStandalone } from './lib/pwa';

export default function App() {
  const [lang] = useLanguage();
  const isStandalone = useIsStandalone();

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path === '/passagier') return '/passagier';
      if (path === '/chauffeur') return '/chauffeur';
      if (path === '/welkom') return '/welkom';

      // Default '/': Check remembered role
      const savedRole = localStorage.getItem('chouf_user_role');
      if (savedRole === 'passagier') return '/passagier';
      if (savedRole === 'chauffeur') return '/chauffeur';

      return '/welkom';
    }
    return '/welkom';
  });

  useEffect(() => {
    // Handle browser back/forward buttons
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/') {
        const savedRole = localStorage.getItem('chouf_user_role');
        if (savedRole === 'passagier') setCurrentPath('/passagier');
        else if (savedRole === 'chauffeur') setCurrentPath('/chauffeur');
        else setCurrentPath('/welkom');
      } else {
        setCurrentPath(path);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      if (path === '/passagier') {
        localStorage.setItem('chouf_user_role', 'passagier');
      } else if (path === '/chauffeur') {
        localStorage.setItem('chouf_user_role', 'chauffeur');
      }
      window.history.pushState({}, '', path);
      setCurrentPath(path);
    }
  };

  const handleSelectRole = (role: 'passagier' | 'chauffeur') => {
    navigateTo(`/${role}`);
  };

  // Register PWA service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker geregistreerd:', reg.scope))
        .catch(err => console.log('Service Worker registratie mislukt:', err));
    }
  }, []);

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="h-full w-full flex flex-col bg-slate-100 font-sans text-slate-900 overflow-hidden no-select"
    >
      {/* Top Header / App Shell Navigation (Only visible on Passager & Chauffeur screens) */}
      {currentPath !== '/welkom' && (
        <header className="h-14 bg-white border-b border-slate-200/80 px-4 flex items-center justify-between z-40 shadow-sm shrink-0">
          <div 
            onClick={() => navigateTo('/welkom')}
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition"
            title={t('header', 'switchMode')}
          >
            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center p-1 shadow-sm">
              <img
                src="https://i.ibb.co/ynMdVvwn/chouflogotransparant-1.png"
                alt="Chouf Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-tight text-slate-900 leading-none">
                {t('header', 'appName')}
              </h1>
              <p className="text-[11px] text-slate-500 font-medium leading-none mt-1">
                {t('header', 'subtitle')}
              </p>
            </div>
          </div>

          {/* Location Badge */}
          <div className="flex-1 flex justify-center px-2">
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80 text-xs font-bold shrink-0 shadow-xs">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 text-slate-700">
                <MapPin size={14} className="text-[#F57C00] shrink-0" />
                <span>Rabat</span>
              </div>
            </div>
          </div>

          {/* Language Toggle & PWA Install Button */}
          <div className="flex items-center gap-2">
            {!isStandalone && (
              <button
                type="button"
                onClick={triggerPWAInstall}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-[#D97706] border border-amber-200/90 rounded-2xl text-xs font-extrabold transition-all active:scale-95 shrink-0 shadow-2xs cursor-pointer"
                title={t('pwa', 'installApp')}
              >
                <span className="text-xs">📲</span>
                <span className="hidden sm:inline">{t('pwa', 'installApp')}</span>
              </button>
            )}
            <LanguageToggle />
          </div>
        </header>
      )}

      {/* Main View Router */}
      <main className="flex-1 relative w-full h-full overflow-hidden">
        {currentPath === '/welkom' && (
          <WelcomeView onSelectRole={handleSelectRole} />
        )}
        {currentPath === '/passagier' && <PassengerView />}
        {currentPath === '/chauffeur' && <DriverView />}
      </main>

      {/* PWA Install Banner */}
      <PWAPrompt />
    </div>
  );
}
