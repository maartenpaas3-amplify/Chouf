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
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowInstructionsModal(true);
    }
  };

  return (
    <>
      {/* Top Banner or Floating Button */}
      {showBanner && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-amber-500 text-slate-950 px-3.5 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between border border-amber-300">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚖</span>
            <div>
              <div className="font-black text-xs leading-none">{t('pwa', 'installTitle')}</div>
              <div className="text-[10px] opacity-90">{t('pwa', 'installSubtitle')}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleInstallClick}
              className="px-2.5 py-1 bg-slate-950 text-amber-400 font-bold text-xs rounded-xl shadow"
            >
              {t('pwa', 'installBtn')}
            </button>
            <button
              onClick={() => setShowBanner(false)}
              className="px-2 py-1 text-slate-900 hover:text-slate-950 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Manual Install Instructions Modal */}
      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-sm text-amber-400 flex items-center gap-2">
                <span>📱</span>
                <span>{t('pwa', 'addToHome')}</span>
              </h3>
              <button
                onClick={() => setShowInstructionsModal(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p className="font-semibold text-white">
                {t('pwa', 'howToInstall')}
              </p>

              <ol className="space-y-2 list-decimal list-inside bg-slate-800 p-3 rounded-2xl border border-slate-700">
                <li>{t('pwa', 'step1')}</li>
                <li>{t('pwa', 'step2')}</li>
                <li>{t('pwa', 'step3')}</li>
              </ol>

              <p className="text-[11px] text-slate-400">
                {t('pwa', 'pwaNote')}
              </p>
            </div>

            <button
              onClick={() => setShowInstructionsModal(false)}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition"
            >
              {t('pwa', 'gotIt')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
