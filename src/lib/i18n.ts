import { useState, useEffect } from 'react';

export type Language = 'fr' | 'en' | 'ar';

export const translations = {
  fr: {
    header: {
      appName: 'Chouf',
      country: 'Maroc',
      subtitle: 'Taxi Maroc',
      passenger: 'Passager',
      driver: 'Chauffeur',
      switchMode: "Retour à l'accueil (changer de mode)",
    },
    welcome: {
      slogan: 'Chouf. Trouve. Pars.',
      chooseMode: 'Choisissez votre mode',
      passengerBtn: 'Passager',
      driverBtn: 'Chauffeur',
      footer: 'Votre taxi partout au Maroc',
    },
    passenger: {
      phoneModalTitle: 'Numéro de téléphone',
      phoneModalSubtitle: 'Entrez votre numéro une seule fois pour continuer.',
      phonePlaceholder: '06 12 34 56 78',
      continue: 'Continuer',
      visibleStatus: 'Vous êtes visible pour les chauffeurs à proximité',
      notVisibleStatus: "Vous n'êtes plus visible pour les chauffeurs.",
      becomeVisible: 'Redevenir visible',
      searchPlaceholder: 'Où allez-vous ?',
      searching: 'Recherche...',
      noResults: 'Aucun résultat trouvé',
      inAHurry: 'Je suis pressé',
      stop: 'Arrêter',
      myPosition: 'Ma position',
    },
    driver: {
      modeBanner: 'Mode Chauffeur • Realtime',
      passengerCountOne: 'passager',
      passengerCountPlural: 'passagers',
      radius: 'Rayon 2 km',
      myPosition: 'Ma position',
      yourPosition: 'Votre position (Chauffeur)',
      enableNotifications: 'Activer les notifications',
      notificationsEnabled: 'Notifications activées',
      testAlert: "Tester l'alerte",
      notificationsBlocked: 'Notifications bloquées par votre navigateur. Autorisez-les dans vos réglages.',
      mapLegend: 'Légende de la carte',
      legendWaiting: 'En attente (normal)',
      legendHurry: 'Passager pressé',
      legendDestination: 'Destination',
      legendRoute: 'Trajet & Direction',
      legendFooter: 'Signalements expirés (>15 min) automatiquement masqués. Numéros de téléphone strictement confidentiels.',
      iosModalTitle: 'Notifications sur iPhone / Safari',
      iosModalText: "Sur iPhone (iOS), les notifications nécessitent d'ajouter Chouf à votre écran d'accueil :",
      iosStep1: 'Appuyez sur le bouton Partager (⎋) en bas de Safari.',
      iosStep2: 'Sélectionnez "Sur l\'écran d\'accueil".',
      iosStep3: 'Ouvrez l\'application Chouf depuis votre écran d\'accueil pour activer les notifications.',
      iosEnableAnyway: 'Activer quand même',
      close: 'Fermer',
      popupPassenger: 'Passager',
      popupHurry: '⚡ PRESSÉ',
      popupWaiting: '📍 EN ATTENTE',
      popupNoDest: 'Pas de destination spécifiée',
      popupNavigate: 'Naviguer',
      alertHurryTitle: '⚡ Passager PRESSÉ à proximité !',
      alertWaitingTitle: '🚖 Un passager attend près de vous !',
      alertBodyPrefix: 'À environ',
      alertNotifActivatedTitle: '🔔 Notifications Chouf activées !',
      alertNotifActivatedBody: 'Vous recevrez une alerte sonore chaque fois qu\'un passager est à proximité.',
      alertTestTitle: '🚖 Un passager attend près de vous !',
      alertTestBody: 'Alerte de test Chouf à environ 0.8 km • Vers Agdal',
    },
    pwa: {
      installTitle: "Installer l'application Chouf",
      installSubtitle: "Ajoutez à l'écran d'accueil sur Android",
      installBtn: 'Installer',
      addToHome: "Ajouter à l'écran d'accueil",
      howToInstall: 'Comment installer Chouf en tant que PWA sur mobile :',
      step1: 'Appuyez sur les 3 points (⋮) en haut à droite dans Chrome.',
      step2: 'Choisissez "Ajouter à l\'écran d\'accueil".',
      step3: 'Appuyez sur "Ajouter".',
      pwaNote: 'Chouf fonctionne comme une application native sur votre téléphone, sans passer par un app store.',
      gotIt: 'Compris',
    },
  },
  en: {
    header: {
      appName: 'Chouf',
      country: 'Morocco',
      subtitle: 'Morocco Taxi',
      passenger: 'Passenger',
      driver: 'Driver',
      switchMode: 'Back to home (switch mode)',
    },
    welcome: {
      slogan: 'Chouf. Find. Go.',
      chooseMode: 'CHOOSE YOUR MODE',
      passengerBtn: 'Passenger',
      driverBtn: 'Driver',
      footer: 'Your taxi everywhere in Morocco',
    },
    passenger: {
      phoneModalTitle: 'Phone number',
      phoneModalSubtitle: 'Enter your phone number once to continue.',
      phonePlaceholder: '06 12 34 56 78',
      continue: 'Continue',
      visibleStatus: 'You are visible to nearby drivers',
      notVisibleStatus: 'You are no longer visible to drivers.',
      becomeVisible: 'Become visible again',
      searchPlaceholder: 'Where are you going?',
      searching: 'Searching...',
      noResults: 'No results found',
      inAHurry: "I'm in a hurry",
      stop: 'Stop',
      myPosition: 'My location',
    },
    driver: {
      modeBanner: 'Driver Mode • Realtime',
      passengerCountOne: 'passenger',
      passengerCountPlural: 'passengers',
      radius: '2 km radius',
      myPosition: 'My location',
      yourPosition: 'Your location (Driver)',
      enableNotifications: 'Enable notifications',
      notificationsEnabled: 'Notifications enabled',
      testAlert: 'Test alert',
      notificationsBlocked: 'Notifications blocked by your browser. Allow them in settings.',
      mapLegend: 'Map legend',
      legendWaiting: 'Waiting (normal)',
      legendHurry: 'Passenger in a hurry',
      legendDestination: 'Destination',
      legendRoute: 'Route & Direction',
      legendFooter: 'Expired reports (>15 min) automatically hidden. Phone numbers strictly confidential.',
      iosModalTitle: 'Notifications on iPhone / Safari',
      iosModalText: 'On iPhone (iOS), notifications require adding Chouf to your home screen:',
      iosStep1: 'Tap the Share button (⎋) at the bottom of Safari.',
      iosStep2: 'Select "Add to Home Screen".',
      iosStep3: 'Open the Chouf app from your home screen to enable notifications.',
      iosEnableAnyway: 'Enable anyway',
      close: 'Close',
      popupPassenger: 'Passenger',
      popupHurry: '⚡ IN A HURRY',
      popupWaiting: '📍 WAITING',
      popupNoDest: 'No destination specified',
      popupNavigate: 'Navigate',
      alertHurryTitle: '⚡ PASSENGER IN A HURRY nearby!',
      alertWaitingTitle: '🚖 A passenger is waiting near you!',
      alertBodyPrefix: 'About',
      alertNotifActivatedTitle: '🔔 Chouf Notifications enabled!',
      alertNotifActivatedBody: 'You will receive a sound alert whenever a passenger is nearby.',
      alertTestTitle: '🚖 A passenger is waiting near you!',
      alertTestBody: 'Chouf test alert approx. 0.8 km • Towards Agdal',
    },
    pwa: {
      installTitle: 'Install Chouf App',
      installSubtitle: 'Add to home screen on Android',
      installBtn: 'Install',
      addToHome: 'Add to Home Screen',
      howToInstall: 'How to install Chouf as a PWA on mobile:',
      step1: 'Tap the 3 dots (⋮) in top right of Chrome.',
      step2: 'Choose "Add to Home Screen".',
      step3: 'Tap "Add".',
      pwaNote: 'Chouf works like a native app on your phone without an app store.',
      gotIt: 'Got it',
    },
  },
  ar: {
    header: {
      appName: 'شوف',
      country: 'المغرب',
      subtitle: 'تاكسي المغرب',
      passenger: 'راكب',
      driver: 'سائق',
      switchMode: 'العودة للرئيسية (تغيير الوضع)',
    },
    welcome: {
      slogan: 'شوف. جد. انطلق.',
      chooseMode: 'اختر وضعك',
      passengerBtn: 'راكب',
      driverBtn: 'سائق',
      footer: 'تاكسي في كل مكان بالمغرب',
    },
    passenger: {
      phoneModalTitle: 'رقم الهاتف',
      phoneModalSubtitle: 'أدخل رقم هاتفك مرة واحدة للمتابعة.',
      phonePlaceholder: '06 12 34 56 78',
      continue: 'متابعة',
      visibleStatus: 'أنت مرئي للسائقين القريبين',
      notVisibleStatus: 'لم تعد مرئيا للسائقين.',
      becomeVisible: 'الظهور مجددا',
      searchPlaceholder: 'إلى أين أنت ذاهب؟',
      searching: 'جاري البحث...',
      noResults: 'لم يتم العثور على نتائج',
      inAHurry: 'أنا مستعجل',
      stop: 'إيقاف',
      myPosition: 'موقعي',
    },
    driver: {
      modeBanner: 'وضع السائق • المباشر',
      passengerCountOne: 'راكب',
      passengerCountPlural: 'ركاب',
      radius: 'نطاق 2 كم',
      myPosition: 'موقعي',
      yourPosition: 'موقعك (السائق)',
      enableNotifications: 'تفعيل الإشعارات',
      notificationsEnabled: 'الإشعارات مفعلة',
      testAlert: 'تجربة التنبيه',
      notificationsBlocked: 'الإشعارات محظورة في متصفحك. قم بالسماح بها في الإعدادات.',
      mapLegend: 'دليل الخريطة',
      legendWaiting: 'في الانتظار (عادي)',
      legendHurry: 'راكب مستعجل',
      legendDestination: 'الوجهة',
      legendRoute: 'المسار والاتجاه',
      legendFooter: 'يتم إخفاء الطلبات المنتهية (>15 دقيقة) تلقائيا. أرقام الهواتف سرية للغاية.',
      iosModalTitle: 'الإشعارات على آيفون / سفاري',
      iosModalText: 'على آيفون (iOS)، تتطلب الإشعارات إضافة شوف إلى الشاشة الرئيسية:',
      iosStep1: 'اضغط على زر المشاركة (⎋) في أسفل سفاري.',
      iosStep2: 'اختر "إضافة إلى الشاشة الرئيسية".',
      iosStep3: 'افتح تطبيق شوف من الشاشة الرئيسية لتفعيل الإشعارات.',
      iosEnableAnyway: 'التفعيل على أي حال',
      close: 'إغلاق',
      popupPassenger: 'راكب',
      popupHurry: '⚡ مستعجل',
      popupWaiting: '📍 في الانتظار',
      popupNoDest: 'لم يتم تحديد وجهة',
      popupNavigate: 'توجيه',
      alertHurryTitle: '⚡ راكب مستعجل بالقرب منك!',
      alertWaitingTitle: '🚖 راكب ينتظر بالقرب منك!',
      alertBodyPrefix: 'على بعد حوالي',
      alertNotifActivatedTitle: '🔔 تم تفعيل إشعارات شوف!',
      alertNotifActivatedBody: 'ستتلقى تنبيها صوتيا كلما كان هناك راكب بالقرب منك.',
      alertTestTitle: '🚖 راكب ينتظر بالقرب منك!',
      alertTestBody: 'تنبيه تجريبي من شوف على بعد ~0.8 كم • نحو أكدال',
    },
    pwa: {
      installTitle: 'تثبيت تطبيق شوف',
      installSubtitle: 'إضافة إلى الشاشة الرئيسية على أندرويد',
      installBtn: 'تثبيت',
      addToHome: 'إضافة إلى الشاشة الرئيسية',
      howToInstall: 'كيفية تثبيت شوف كتطبيق PWA على الهاتف:',
      step1: 'اضغط على النقاط الثلاث (⋮) في أعلى يمين كروم.',
      step2: 'اختر "إضافة إلى الشاشة الرئيسية".',
      step3: 'اضغط على "إضافة".',
      pwaNote: 'يعمل شوف كتطبيق أصلي على هاتفك دون الحاجة لمتجر التطبيقات.',
      gotIt: 'فهمت',
    },
  },
} as const;

const LANGUAGE_KEY = 'chouf_language';

let currentLanguage: Language = (() => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'en' || saved === 'fr' || saved === 'ar') return saved as Language;
  }
  return 'fr';
})();

const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language) {
  if (lang !== 'fr' && lang !== 'en' && lang !== 'ar') return;
  currentLanguage = lang;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANGUAGE_KEY, lang);
  }
  listeners.forEach((listener) => listener());
}

export function useLanguage(): [Language, (lang: Language) => void] {
  const [lang, setLangState] = useState<Language>(currentLanguage);

  useEffect(() => {
    const handleUpdate = () => {
      setLangState(currentLanguage);
    };
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  const changeLang = (newLang: Language) => {
    setLanguage(newLang);
  };

  return [lang, changeLang];
}

export function t<
  K1 extends keyof typeof translations['fr'],
  K2 extends keyof typeof translations['fr'][K1]
>(section: K1, key: K2, overrideLang?: Language): string {
  const activeLang = overrideLang || currentLanguage;
  const dict = translations[activeLang] || translations.fr;
  const sec = (dict as any)[section] as Record<string, string> | undefined;
  if (sec && sec[key as string]) {
    return sec[key as string];
  }
  const fallbackSec = (translations.fr as any)[section] as Record<string, string>;
  return fallbackSec[key as string] || (key as string);
}
