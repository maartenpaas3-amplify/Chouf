import { useState, useEffect } from 'react';

export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

export function triggerPWAInstall() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('open-pwa-install'));
  }
}

export function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState<boolean>(() => isStandaloneApp());

  useEffect(() => {
    const check = () => setStandalone(isStandaloneApp());
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return standalone;
}
