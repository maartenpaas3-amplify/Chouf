// Notification & PWA Helper for Chouf Taxi

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('ServiceWorker registered with scope:', reg.scope);
      return reg;
    } catch (err) {
      console.warn('ServiceWorker registration failed:', err);
      return null;
    }
  }
  return null;
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandaloneMatch = window.matchMedia('(display-mode: standalone)').matches;
  const isNavStandalone = (navigator as unknown as { standalone?: boolean }).standalone;
  return Boolean(isStandaloneMatch || isNavStandalone);
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  // Register service worker if not already registered
  await registerServiceWorker();

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Notification permission error:', err);
    return getNotificationPermissionState();
  }
}

export async function sendPassengerAlertNotification(
  title: string,
  body: string,
  tag?: string
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const options: Record<string, any> = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: tag || 'chouf-passenger-alert',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: '/' },
  };

  try {
    // Try Service Worker registration first (works best on mobile & background)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return true;
      }
    }

    // Fallback to standard Notification constructor
    new Notification(title, options);
    return true;
  } catch (err) {
    console.warn('Failed to display notification:', err);
    return false;
  }
}
