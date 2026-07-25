import React, { useState, useEffect } from 'react';
import { t, useLanguage } from '../lib/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAPrompt: React.FC = () => {
  useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  
  // Detect OS for initial tab preference
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>(isIOS ? 'ios' : 'android');

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setShowBanner(false);
        }
        setDeferredPrompt(null);
      } catch (err) {
        setShowInstructionsModal(true);
      }
    } else {
      setShowInstructionsModal(true);
    }
  };

  useEffect(() => {
    const handleOpenEvent = () => {
      handleInstallClick();
    };

    window.addEventListener('open-pwa-install', handleOpenEvent);
    return () => window.removeEventListener('open-pwa-install', handleOpenEvent);
  }, [deferredPrompt]);

  return (
    <>
      {/* Top Banner if prompt captured */}
      {showBanner && (
        <div className="fixed top-14 start-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-amber-500 text-slate-950 px-3.5 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between border border-amber-300">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚖</span>
            <div>
              <div className="font-black text-xs leading-none">{t('pwa', 'installTitle')}</div>
              <div className="text-[10px] opacity-90">{t('pwa', 'installSubtitle')}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-2.5 py-1 bg-slate-950 text-amber-400 font-bold text-xs rounded-xl shadow cursor-pointer"
            >
              {t('pwa', 'installBtn')}
            </button>
            <button
              type="button"
              onClick={() => setShowBanner(false)}
              className="px-2 py-1 text-slate-900 hover:text-slate-950 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Manual Install Instructions Modal */}
      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-sm text-amber-400 flex items-center gap-2">
                <span>📱</span>
                <span>{t('pwa', 'addToHome')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowInstructionsModal(false)}
                className="text-slate-400 hover:text-white font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Platform OS Tabs */}
            <div className="grid grid-cols-2 gap-1.5 bg-slate-800 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'android' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🤖 Android / Chrome
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'ios' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🍏 iPhone / Safari
              </button>
            </div>

            {/* Tab Instructions Content */}
            <div className="space-y-3 text-xs text-slate-300">
              <p className="font-semibold text-white">
                {t('pwa', 'howToInstall')}
              </p>

              {activeTab === 'android' ? (
                <ol className="space-y-2.5 bg-slate-800 p-3.5 rounded-2xl border border-slate-700/80 text-xs leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="font-extrabold text-amber-400 shrink-0">1.</span>
                    <span>{t('pwa', 'step1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-extrabold text-amber-400 shrink-0">2.</span>
                    <span>{t('pwa', 'step2')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-extrabold text-amber-400 shrink-0">3.</span>
                    <span>{t('pwa', 'step3')}</span>
                  </li>
                </ol>
              ) : (
                <ol className="space-y-2.5 bg-slate-800 p-3.5 rounded-2xl border border-slate-700/80 text-xs leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="font-extrabold text-amber-400 shrink-0">1.</span>
                    <span>{t('driver', 'iosStep1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-extrabold text-amber-400 shrink-0">2.</span>
                    <span>{t('driver', 'iosStep2')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-extrabold text-amber-400 shrink-0">3.</span>
                    <span>{t('driver', 'iosStep3')}</span>
                  </li>
                </ol>
              )}

              <p className="text-[11px] text-slate-400">
                {t('pwa', 'pwaNote')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowInstructionsModal(false)}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl transition cursor-pointer"
            >
              {t('pwa', 'gotIt')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
