import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import {
  supabase,
  isSupabaseConfigured,
  getDistanceMeters,
  getOrCreateAnonymousUser,
  SupabasePin,
} from '../lib/supabase';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  sendPassengerAlertNotification,
  isIosDevice,
  isStandaloneApp,
} from '../lib/notifications';
import { t, useLanguage, getLocalizedZoneName } from '../lib/i18n';
import { fetchORSDirections, formatDuration } from '../lib/ors';
import { CityZone, ActiveTripDestination } from '../types';
import { getZonesForCity } from '../data/cityZones';
import { SuperModeCandidate, calculateSuperModeCandidates } from '../lib/superMode';

const DEFAULT_DRIVER_CENTER = { lat: 34.015, lng: -6.832 }; // Rabat center for driver

// 15 minutes expiration threshold & 2km radius
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const MAX_RADIUS_METERS = 2000; // 2km radius

// Custom Leaflet Step Marker Icon for Route Optimization
const createRouteStepIcon = (stepNumber: number, type: 'pickup' | 'dropoff') =>
  L.divIcon({
    className: 'custom-route-step-icon',
    html: `
      <div style="
        background: ${type === 'pickup' ? '#F57C00' : '#059669'};
        color: #ffffff;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 2.5px solid #ffffff;
        box-shadow: 0 4px 12px ${type === 'pickup' ? 'rgba(245, 124, 0, 0.6)' : 'rgba(5, 150, 105, 0.6)'};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 800;
        font-family: sans-serif;
      ">
        ${stepNumber}
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

// Custom Leaflet Icons
const createDriverMarkerIcon = () =>
  L.divIcon({
    className: 'custom-driver-icon',
    html: `
      <div style="
        background: #3b82f6;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 3px solid #ffffff;
        box-shadow: 0 4px 14px rgba(59, 130, 246, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      ">
        🚖
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

const createNormalPassengerIcon = () =>
  L.divIcon({
    className: 'custom-passenger-normal-icon',
    html: `
      <div style="
        background: #F57C00;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 3px solid #ffffff;
        box-shadow: 0 4px 12px rgba(245, 124, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 17px;
      ">
        📍
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

const createPressePassengerIcon = () =>
  L.divIcon({
    className: 'custom-passenger-presse-icon',
    html: `
      <div style="
        background: #ef4444;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 3px solid #ffffff;
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.4), 0 4px 16px rgba(239, 68, 68, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        animation: pulse 1.5s infinite;
      ">
        ⚡
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

const createDestinationIcon = () =>
  L.divIcon({
    className: 'custom-dest-icon',
    html: `
      <div style="
        background: #64748b;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
      ">
        🏁
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const createActiveDestinationIcon = (isCustom: boolean) =>
  L.divIcon({
    className: 'custom-active-dest-icon',
    html: `
      <div style="
        background: #10b981;
        color: #ffffff;
        padding: 5px 10px;
        border-radius: 14px;
        border: 2.5px solid #ffffff;
        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.6);
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 800;
        font-family: system-ui, -apple-system, sans-serif;
        white-space: nowrap;
        cursor: grab;
      ">
        <span>🏁</span>
        <span>${isCustom ? '📍 Exact' : '🎯 Zone'}</span>
      </div>
    `,
    iconSize: [84, 32],
    iconAnchor: [42, 16],
  });

export const DriverView: React.FC = () => {
  const [lang] = useLanguage();
  const isRTL = lang === 'ar';

  // Active Trip Destination State for 1st Passenger (Super Mode Step 1)
  const [activeDestination, setActiveDestination] = useState<ActiveTripDestination | null>(() => {
    try {
      if (typeof window === 'undefined') return null;
      const saved = localStorage.getItem('chouf_active_trip_destination');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isZonePickerOpen, setIsZonePickerOpen] = useState<boolean>(false);
  const driverCity = 'Rabat'; // City independent: configurable per driver city
  const cityZones = getZonesForCity(driverCity);

  const handleSelectZone = (zone: CityZone) => {
    const newDest: ActiveTripDestination = {
      zoneId: zone.id,
      zoneName: zone.name,
      centerLat: zone.centerLat,
      centerLng: zone.centerLng,
      exactLat: zone.centerLat,
      exactLng: zone.centerLng,
      isCustomPinSet: false,
      selectedAt: Date.now(),
      hasPassengerOnboard: true,
    };

    setActiveDestination(newDest);
    try {
      localStorage.setItem('chouf_active_trip_destination', JSON.stringify(newDest));
    } catch (err) {
      console.warn('localStorage save active destination error:', err);
    }

    setIsZonePickerOpen(false);

    if (mapRef.current) {
      mapRef.current.flyTo([zone.centerLat, zone.centerLng], 14, { animate: true });
    }
  };

  const handleClearDestination = () => {
    setActiveDestination(null);
    setSuperModeCandidates(null);
    setSelectedCandidateId(null);
    setLastNotifSentCandidateId(null);
    try {
      localStorage.removeItem('chouf_active_trip_destination');
    } catch (err) {
      console.warn('localStorage remove active destination error:', err);
    }
    setIsZonePickerOpen(false);
  };

  // Super Mode State (Stand A: 0 passagiers zone-analyse & Stand B: 1 passagier omweg-check)
  const [isSuperModeActive, setIsSuperModeActive] = useState<boolean>(false);
  const [isCalculatingSuperMode, setIsCalculatingSuperMode] = useState<boolean>(false);
  const [superModeCandidates, setSuperModeCandidates] = useState<SuperModeCandidate[] | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [lastNotifSentCandidateId, setLastNotifSentCandidateId] = useState<string | null>(null);

  const handleRunSuperModeCheck = async () => {
    if (!activeDestination) return;
    setIsCalculatingSuperMode(true);
    try {
      const dest1Loc = {
        lat: activeDestination.exactLat || activeDestination.centerLat,
        lng: activeDestination.exactLng || activeDestination.centerLng,
      };
      const results = await calculateSuperModeCandidates(
        driverLocation,
        dest1Loc,
        activePassengerPins
      );
      setSuperModeCandidates(results);
    } catch (err) {
      console.warn('[SuperMode] Calculation error:', err);
      setSuperModeCandidates([]);
    } finally {
      setIsCalculatingSuperMode(false);
    }
  };

  // Auto-run detour check when switching to Stand B with an active destination
  useEffect(() => {
    if (isSuperModeActive && activeDestination) {
      handleRunSuperModeCheck();
    } else {
      setSuperModeCandidates(null);
      setSelectedCandidateId(null);
    }
  }, [activeDestination, isSuperModeActive]);

  const handleSelectSuperModeCandidate = async (cand: SuperModeCandidate) => {
    setSelectedCandidateId(cand.passenger.id);
    setLastNotifSentCandidateId(cand.passenger.id);

    if (mapRef.current) {
      mapRef.current.flyTo([cand.passenger.lat, cand.passenger.lng], 15, { animate: true });
    }

    // Melding naar passagier 1: "Onderweg wordt nog iemand anders opgepikt, je rit duurt ongeveer +X min langer."
    const messageBody = t('driver', 'passenger1DetourNotif').replace('{minutes}', cand.detourMinutes.toString());

    try {
      const success = await sendPassengerAlertNotification(
        t('driver', 'superModeNotifTitle'),
        messageBody,
        `detour-p1-${cand.passenger.id}`
      );

      if (success) {
        console.info(`[SuperMode] Notification sent to Passenger 1 (+${cand.detourMinutes} min detour).`);
      } else {
        console.info(`[SuperMode] Passenger 1 notification channel unreached/blocked. Driver proceeds without blocking.`);
      }
    } catch (err) {
      console.warn('[SuperMode] Notification attempt log:', err);
    }
  };

  const handleToggleSuperMode = () => {
    if (!isSuperModeActive) {
      setIsSuperModeActive(true);
      if (activeDestination) {
        handleRunSuperModeCheck();
      }
    } else {
      setIsSuperModeActive(false);
      setSuperModeCandidates(null);
      setSelectedCandidateId(null);
      setLastNotifSentCandidateId(null);
    }
  };

  // Driver Gate Verification State
  const [isVerified, setIsVerified] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return true;
      const verified = localStorage.getItem('chouf_driver_verified');
      if (verified === null) return false;
      return verified === 'true' || verified === '1';
    } catch (err) {
      console.warn('[DriverView] localStorage read error, failing open:', err);
      return true; // Fail open safety rule
    }
  });

  const [phoneInput, setPhoneInput] = useState<string>(() => {
    try {
      return localStorage.getItem('chouf_driver_phone') || '';
    } catch {
      return '';
    }
  });

  const handleOpenWhatsapp = () => {
    try {
      localStorage.setItem('chouf_driver_verified', 'true');
      if (phoneInput.trim()) {
        localStorage.setItem('chouf_driver_phone', phoneInput.trim());
      }
    } catch (err) {
      console.warn('[DriverView] localStorage write error:', err);
    }

    const digitsOnly = phoneInput.replace(/\D/g, '');
    const last4 = digitsOnly.length >= 4 ? digitsOnly.slice(-4) : digitsOnly.padEnd(4, '0');
    const refCode = `CH-${last4 || '0000'}`;

    const formattedPhone = phoneInput.trim() || 'Non spécifié';
    const message = `Bonjour, je souhaite rejoindre Chouf comme chauffeur. Mon numéro: ${formattedPhone}, code: ${refCode}`;
    const waUrl = `https://wa.me/212611053649?text=${encodeURIComponent(message)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
    setIsVerified(true);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('chouf_driver_verified');
    } catch (err) {
      console.warn('[DriverView] localStorage logout error:', err);
    }
    setIsVerified(false);
  };
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number }>(DEFAULT_DRIVER_CENTER);
  const [driverUserId, setDriverUserId] = useState<string | null>(null);

  const [driverPinId, setDriverPinId] = useState<string>(() => {
    let saved = localStorage.getItem('chouf_driver_pin_id');
    if (!saved) {
      saved = 'driver_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('chouf_driver_pin_id', saved);
    }
    return saved;
  });

  // Auto-login driver anonymously in background
  useEffect(() => {
    getOrCreateAnonymousUser().then((id) => {
      if (id) {
        setDriverUserId(id);
      }
    });
  }, []);

  const [activePassengerPins, setActivePassengerPins] = useState<SupabasePin[]>([]);
  const [supabaseConnected, setSupabaseConnected] = useState<boolean>(isSupabaseConfigured());
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);

  // Stand A (0 passengers): Calculate waiting passenger count per Rabat zone
  const zoneCounts = React.useMemo(() => {
    const zones = getZonesForCity('Rabat');
    const counts: Record<string, { zone: CityZone; count: number }> = {};
    zones.forEach((z) => {
      counts[z.id] = { zone: z, count: 0 };
    });

    activePassengerPins.forEach((pin) => {
      let nearestZoneId: string | null = null;
      let minDistance = Infinity;

      zones.forEach((z) => {
        const dist = getDistanceMeters(pin.lat, pin.lng, z.centerLat, z.centerLng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestZoneId = z.id;
        }
      });

      if (nearestZoneId && counts[nearestZoneId]) {
        counts[nearestZoneId].count += 1;
      }
    });

    return counts;
  }, [activePassengerPins]);

  // Determine single hottest zone for Stand A (max count > 0 and NO tie for max)
  const hottestZoneInfo = React.useMemo(() => {
    const list = Object.values(zoneCounts) as Array<{ zone: CityZone; count: number }>;
    if (list.length === 0) return null;

    let maxCount = 0;
    list.forEach((item) => {
      if (item.count > maxCount) {
        maxCount = item.count;
      }
    });

    if (maxCount === 0) return null;

    const topZones = list.filter((item) => item.count === maxCount);
    if (topZones.length > 1) {
      // Tie for top spot -> no single forced highlight
      return null;
    }

    return topZones[0]; // { zone: CityZone, count: number }
  }, [zoneCounts]);

  // Notification States
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    getNotificationPermissionState()
  );
  const [showIosGuideModal, setShowIosGuideModal] = useState<boolean>(false);

  // Refs for notifications deduplication
  const seenPinIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef<boolean>(false);

  const [isAutoFollowing, setIsAutoFollowing] = useState<boolean>(true);
  const isAutoFollowingRef = useRef<boolean>(true);

  const openPopupPinIdRef = useRef<string | null>(null);
  const isClearingLayersRef = useRef<boolean>(false);

  // Throttling ref for driver location reporting
  const lastDriverSyncRef = useRef<{ lat: number; lng: number; timestamp: number }>({
    lat: 0,
    lng: 0,
    timestamp: 0,
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // 1. Live GPS tracking for driver with watchPosition (Continuous tracking)
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    let watchId: number;

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriverLocation(loc);

        // Auto-center the map on driver's position as they move (if auto-following is active)
        if (mapRef.current && isAutoFollowingRef.current) {
          mapRef.current.panTo([loc.lat, loc.lng], { animate: true });
        }
      },
      (err) => {
        console.warn('Geolocation watch error:', err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
    );

    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // 2. Enable Notifications Click Handler
  const handleEnableNotifications = async () => {
    if (isIosDevice() && !isStandaloneApp()) {
      setShowIosGuideModal(true);
      return;
    }

    const perm = await requestNotificationPermission();
    setNotifPermission(perm);

    if (perm === 'granted') {
      sendPassengerAlertNotification(
        t('driver', 'alertNotifActivatedTitle'),
        t('driver', 'alertNotifActivatedBody')
      );
    }
  };

  // 3. Publish Driver Position to Supabase (Throttled > 50m or 30-60s)
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;

    const syncDriverPosition = async () => {
      const now = Date.now();
      const last = lastDriverSyncRef.current;

      const distMoved = getDistanceMeters(last.lat, last.lng, driverLocation.lat, driverLocation.lng);
      const timeElapsed = now - last.timestamp;

      if (distMoved < 50 && timeElapsed < 30000 && last.timestamp > 0) {
        return;
      }

      let validUserId = driverUserId;
      if (!validUserId) {
        validUserId = await getOrCreateAnonymousUser();
        if (validUserId) {
          setDriverUserId(validUserId);
        }
      }

      lastDriverSyncRef.current = {
        lat: driverLocation.lat,
        lng: driverLocation.lng,
        timestamp: now,
      };

      const nowIso = new Date().toISOString();
      const payload: Record<string, any> = {
        id: driverPinId,
        type: 'chauffeur',
        lat: driverLocation.lat,
        lng: driverLocation.lng,
        haast: false,
        user_id: validUserId || null,
        aangemaakt_op: nowIso,
        laatst_geupdate_op: nowIso,
      };

      try {
        const { error } = await supabase.from('pins').upsert(payload);
        if (error) {
          console.warn('Driver position upsert note:', error.message || error);
          if (error.message?.includes('row-level security') || error.code === '42501' || error.message?.includes('USING expression')) {
            const freshDriverId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'drv_' + Math.random().toString(36).substring(2, 11);
            localStorage.setItem('chouf_driver_pin_id', freshDriverId);
            setDriverPinId(freshDriverId);
            payload.id = freshDriverId;
            try { await supabase.from('pins').upsert(payload); } catch (e) { console.warn(e); }
          } else if (error.code === '23503' && payload.user_id) {
            delete payload.user_id;
            try { await supabase.from('pins').upsert(payload); } catch (e) { console.warn(e); }
          }
        }
      } catch (err) {
        console.warn('Driver position upsert network exception:', err);
      }
    };

    syncDriverPosition();
  }, [driverLocation, driverPinId, driverUserId]);

  // 4. Fetch & Subscribe to Passenger Pins directly from Supabase Database
  const fetchAndFilterPassengerPins = async () => {
    const now = Date.now();

    if (supabase) {
      try {
        console.log('[Supabase] Fetching active passenger pins from table "pins"...');
        const { data, error } = await supabase
          .from('pins')
          .select('*')
          .eq('type', 'passagier');

        if (error) {
          console.warn('[Supabase] Note fetching passenger pins:', error.message || error);
          setSupabaseConnected(false);
          return;
        }

        if (Array.isArray(data)) {
          setSupabaseConnected(true);
          const validPins = data.filter((pin: SupabasePin) => {
            const pinTime = new Date(pin.laatst_geupdate_op || pin.aangemaakt_op).getTime();
            const ageMs = now - pinTime;
            if (ageMs > FIFTEEN_MINUTES_MS) return false;

            const dist = getDistanceMeters(
              driverLocation.lat,
              driverLocation.lng,
              pin.lat,
              pin.lng
            );

            return dist <= MAX_RADIUS_METERS;
          });

          console.log(`[Supabase] Successfully fetched ${data.length} total passenger pins, ${validPins.length} valid within 2km radius.`);
          setActivePassengerPins(validPins);
        }
      } catch (err) {
        console.warn('[Supabase] Network exception fetching passenger pins:', err);
        setSupabaseConnected(false);
      }
    } else {
      setSupabaseConnected(false);
    }
  };

  useEffect(() => {
    fetchAndFilterPassengerPins();

    if (!supabase) return;

    const subscriptionChannel = supabase
      .channel('public:pins_driver')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pins' },
        () => {
          fetchAndFilterPassengerPins();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSupabaseConnected(true);
        }
      });

    const interval = setInterval(() => {
      fetchAndFilterPassengerPins();
    }, 10000);

    return () => {
      if (supabase && subscriptionChannel) {
        supabase.removeChannel(subscriptionChannel);
      }
      clearInterval(interval);
    };
  }, [driverLocation]);

  // 5. Detect New Pins & Trigger Web Notifications
  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      // Mark existing pins as seen on initial render so we don't spam alerts on boot
      activePassengerPins.forEach((pin) => seenPinIdsRef.current.add(pin.id));
      initialLoadDoneRef.current = true;
      return;
    }

    // Check for newly added passenger pins
    activePassengerPins.forEach((pin) => {
      if (!seenPinIdsRef.current.has(pin.id)) {
        seenPinIdsRef.current.add(pin.id);

        if (notifPermission === 'granted') {
          const distMeters = getDistanceMeters(
            driverLocation.lat,
            driverLocation.lng,
            pin.lat,
            pin.lng
          );
          const distKm = (distMeters / 1000).toFixed(1);

          const title = pin.haast
            ? t('driver', 'alertHurryTitle')
            : t('driver', 'alertWaitingTitle');

          const body = `${t('driver', 'alertBodyPrefix')} ${distKm} km${
            pin.bestemming_tekst ? ' • ' + t('driver', 'legendDestination') + ': ' + pin.bestemming_tekst : ''
          }`;

          sendPassengerAlertNotification(title, body, `passenger-${pin.id}`);
        }
      }
    });
  }, [activePassengerPins, notifPermission, driverLocation]);

  // 6. Initialize Leaflet Map
  useEffect(() => {
    if (!isVerified || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [driverLocation.lat, driverLocation.lng],
      zoom: 13,
      minZoom: 12,
      maxZoom: 18,
      zoomControl: false,
    });

    // Pause auto-following if the user manually drags or zooms the map
    map.on('dragstart zoomstart', () => {
      isAutoFollowingRef.current = false;
      setIsAutoFollowing(false);
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
      minZoom: 12,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;

    mapRef.current = map;

    // Force initial size calculation and fit 2km radius circle bounds automatically
    const fitInitial2kmBounds = () => {
      if (!mapRef.current) return;
      mapRef.current.invalidateSize();
      const circleBounds = L.latLng(driverLocation.lat, driverLocation.lng).toBounds(MAX_RADIUS_METERS);
      mapRef.current.fitBounds(circleBounds, { padding: [30, 30] });
    };

    fitInitial2kmBounds();
    const initTimer1 = setTimeout(fitInitial2kmBounds, 100);
    const initTimer2 = setTimeout(fitInitial2kmBounds, 300);

    return () => {
      clearTimeout(initTimer1);
      clearTimeout(initTimer2);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isVerified]);

  // 6.1 Force Leaflet map size recalculation whenever verified state changes or window resizes
  useEffect(() => {
    if (!isVerified || !mapRef.current) return;

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    handleResize();
    const timer1 = setTimeout(handleResize, 100);
    const timer2 = setTimeout(handleResize, 300);

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', handleResize);
    };
  }, [isVerified]);

  // 7. Sync Driver Marker & Continuous Auto-Follow
  useEffect(() => {
    if (!mapRef.current) return;

    if (!driverMarkerRef.current) {
      const marker = L.marker([driverLocation.lat, driverLocation.lng], {
        icon: createDriverMarkerIcon(),
        zIndexOffset: 1000,
      }).addTo(mapRef.current);

      marker.bindPopup(`
        <div style="font-family: sans-serif; text-align: center; color: #ffffff; padding: 2px;">
          <strong style="font-size: 13px;">${t('driver', 'yourPosition')}</strong>
        </div>
      `);

      driverMarkerRef.current = marker;
    } else {
      driverMarkerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
    }

    if (isAutoFollowingRef.current) {
      mapRef.current.panTo([driverLocation.lat, driverLocation.lng], { animate: true });
    }
  }, [driverLocation]);

  // 8. Render Active Passenger Pins + Polylines
  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current) return;

    isClearingLayersRef.current = true;
    layerGroupRef.current.clearLayers();

    // 2km Radius Circle indicator
    L.circle([driverLocation.lat, driverLocation.lng], {
      radius: MAX_RADIUS_METERS,
      color: '#F57C00',
      weight: 1.5,
      dashArray: '6, 6',
      fillColor: '#F57C00',
      fillOpacity: 0.05,
    }).addTo(layerGroupRef.current);

    // Marker cluster group specifically for passenger pickup markers
    const passengerClusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = 36;
        let fontSize = '13px';
        if (count >= 100) {
          size = 44;
          fontSize = '12px';
        } else if (count >= 10) {
          size = 40;
          fontSize = '13px';
        }

        return L.divIcon({
          html: `<div style="
            background: #F57C00;
            color: #ffffff;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 4px 12px rgba(245, 124, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: ${fontSize};
            font-family: system-ui, -apple-system, sans-serif;
          ">${count}</div>`,
          className: 'custom-passenger-cluster-icon',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    });

    activePassengerPins.forEach((pin) => {
      const isPresse = pin.haast;
      const pickupLat = pin.lat;
      const pickupLng = pin.lng;

      const passengerMarker = L.marker([pickupLat, pickupLng], {
        icon: isPresse ? createPressePassengerIcon() : createNormalPassengerIcon(),
      });

      passengerMarker.on('popupopen', () => {
        openPopupPinIdRef.current = pin.id;
      });

      passengerMarker.on('popupclose', () => {
        if (!isClearingLayersRef.current && openPopupPinIdRef.current === pin.id) {
          openPopupPinIdRef.current = null;
        }
      });

      const distMeters = getDistanceMeters(
        driverLocation.lat,
        driverLocation.lng,
        pickupLat,
        pickupLng
      );
      const distKm = (distMeters / 1000).toFixed(2);

      const statusBadge = isPresse
        ? `<span style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">${t('driver', 'popupHurry')}</span>`
        : `<span style="background: #F57C00; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">${t('driver', 'popupWaiting')}</span>`;

      const destText = pin.bestemming_tekst
        ? `<div style="font-size: 11px; margin-top: 4px; color: #cbd5e1;">🏁 ${t('driver', 'legendDestination')}: <strong style="color: #ffffff;">${pin.bestemming_tekst}</strong></div>`
        : `<div style="font-size: 11px; margin-top: 4px; color: #94a3b8; font-style: italic;">${t('driver', 'popupNoDest')}</div>`;

      const googleNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${pickupLat},${pickupLng}`;

      passengerMarker.bindPopup(`
        <div style="font-family: sans-serif; padding: 2px; min-width: 170px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <strong style="font-size: 12px; color: #ffffff;">${t('driver', 'popupPassenger')}</strong>
            ${statusBadge}
          </div>
          <div style="font-size: 11px; color: #cbd5e1;">Distance: <strong style="color: #ffffff;">${distKm} km</strong></div>
          ${destText}
          <a
            href="${googleNavUrl}"
            target="_blank"
            rel="noopener noreferrer"
            style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 10px; width: 100%; padding: 8px 12px; background: #059669; color: #ffffff; border-radius: 8px; font-size: 12px; font-weight: 700; text-decoration: none; box-shadow: 0 2px 4px rgba(5,150,105,0.3); transition: background 0.2s;"
          >
            <span>🧭</span>
            <span>${t('driver', 'popupNavigate')}</span>
          </a>
        </div>
      `);

      passengerMarker.addTo(passengerClusterGroup);

      if (openPopupPinIdRef.current === pin.id) {
        passengerMarker.openPopup();
      }

      if (pin.bestemming_lat && pin.bestemming_lng) {
        const destLat = pin.bestemming_lat;
        const destLng = pin.bestemming_lng;

        const destMarker = L.marker([destLat, destLng], {
          icon: createDestinationIcon(),
        });
        destMarker.bindPopup(`
          <div style="font-family: sans-serif; font-size: 11px; color: #ffffff;">
            🏁 ${t('driver', 'legendDestination')}: <strong style="color: #ffffff;">${pin.bestemming_tekst || t('driver', 'legendDestination')}</strong>
          </div>
        `);
        destMarker.addTo(layerGroupRef.current!);
      }
    });

    passengerClusterGroup.addTo(layerGroupRef.current!);

    // Render Active Passenger Destination Pin (Super Mode Step 1)
    if (activeDestination && activeDestination.exactLat && activeDestination.exactLng) {
      const isCustom = activeDestination.isCustomPinSet;
      const destMarker = L.marker([activeDestination.exactLat, activeDestination.exactLng], {
        icon: createActiveDestinationIcon(isCustom),
        draggable: true,
        zIndexOffset: 3000,
      });

      destMarker.bindPopup(`
        <div style="font-family: sans-serif; padding: 4px; min-width: 170px;">
          <div style="font-size: 10px; font-weight: 800; color: #10b981; margin-bottom: 2px; text-transform: uppercase;">
            🏁 ${t('driver', 'destChoiceTitle')}
          </div>
          <strong style="font-size: 13px; color: #ffffff; display: block; margin-bottom: 4px;">
            ${activeDestination.zoneName}
          </strong>
          <div style="font-size: 11px; color: #cbd5e1;">
            ${isCustom ? '📍 ' + t('driver', 'exactLocationSet') : '🎯 ' + t('driver', 'optionalDragPin')}
          </div>
        </div>
      `);

      destMarker.on('dragend', (e: any) => {
        const latlng = e.target.getLatLng();
        setActiveDestination((prev) => {
          if (!prev) return null;
          const updated: ActiveTripDestination = {
            ...prev,
            exactLat: latlng.lat,
            exactLng: latlng.lng,
            isCustomPinSet: true,
          };
          try {
            localStorage.setItem('chouf_active_trip_destination', JSON.stringify(updated));
          } catch (err) {
            console.warn('localStorage save active destination error:', err);
          }
          return updated;
        });
      });

      destMarker.addTo(layerGroupRef.current!);
    }

    // Render Stand A (0 passengers) Hottest Zone Highlight on Map
    if (isSuperModeActive && !activeDestination && hottestZoneInfo) {
      const { zone, count } = hottestZoneInfo;

      L.circle([zone.centerLat, zone.centerLng], {
        radius: 650,
        color: '#d97706',
        fillColor: '#fbbf24',
        fillOpacity: 0.22,
        weight: 3,
        dashArray: '6, 6',
      }).addTo(layerGroupRef.current!);

      const localizedZoneName = getLocalizedZoneName(zone.name, lang);
      const markerText = t('driver', 'bestChanceMapMarker')
        .replace('{zone}', localizedZoneName)
        .replace('{count}', String(count));

      const goldIcon = L.divIcon({
        className: 'custom-hottest-zone-marker',
        html: `
          <div style="
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: #ffffff;
            padding: 5px 12px;
            border-radius: 9999px;
            font-weight: 900;
            font-size: 11px;
            box-shadow: 0 4px 14px rgba(217, 119, 6, 0.45);
            border: 2px solid #ffffff;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            white-space: nowrap;
            transform: translate(-50%, -50%);
          ">
            <span style="font-size: 13px;">🏆</span>
            <span>${markerText}</span>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const hotspotMarker = L.marker([zone.centerLat, zone.centerLng], {
        icon: goldIcon,
        zIndexOffset: 3500,
      });

      const countText = count === 1 ? t('driver', 'waitingPassenger') : t('driver', 'waitingPassengers');

      hotspotMarker.bindPopup(`
        <div style="font-family: sans-serif; padding: 4px;">
          <div style="font-size: 10px; font-weight: 800; color: #d97706; text-transform: uppercase;">
            ${t('driver', 'bestChancePopupTitle')}
          </div>
          <strong style="font-size: 13px; color: #ffffff; display: block; margin-top: 2px;">
            ${localizedZoneName}
          </strong>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 4px;">
            🔥 <strong>${count}</strong> ${countText}
          </div>
        </div>
      `);

      hotspotMarker.addTo(layerGroupRef.current!);
    }

    // Render Super Mode Selected Candidate Route Overlay on Map (Stand B)
    if (isSuperModeActive && activeDestination && selectedCandidateId && superModeCandidates) {
      const selectedCand = superModeCandidates.find((c) => c.passenger.id === selectedCandidateId);
      if (selectedCand && selectedCand.routeGeometry && selectedCand.routeGeometry.length > 0) {
        L.polyline(selectedCand.routeGeometry, {
          color: '#059669',
          weight: 7,
          opacity: 0.35,
          className: 'route-line-fadeIn',
        }).addTo(layerGroupRef.current!);

        L.polyline(selectedCand.routeGeometry, {
          color: '#10b981',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.95,
          className: 'route-line-fadeIn',
        }).addTo(layerGroupRef.current!);
      }
    }

    isClearingLayersRef.current = false;
  }, [activePassengerPins, driverLocation, activeDestination, isSuperModeActive, selectedCandidateId, superModeCandidates, hottestZoneInfo]);

  // Access Gate Guard Screen
  if (!isVerified) {
    const digitsOnly = phoneInput.replace(/\D/g, '');
    const last4 = digitsOnly.length >= 4 ? digitsOnly.slice(-4) : digitsOnly.padEnd(4, '0');
    const refCode = `CH-${last4 || '0000'}`;

    return (
      <div className="relative w-full h-full min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4 bg-slate-50 text-slate-900 font-sans overflow-y-auto">
        <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 my-auto">
          {/* Brand Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-200/80 flex items-center justify-center mx-auto shadow-sm p-2">
              <img
                src="https://i.ibb.co/ynMdVvwn/chouflogotransparant-1.png"
                alt="Chouf Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {t('driver', 'gateTitle')}
            </h2>
            <p className="text-xs font-semibold text-slate-500 max-w-xs mx-auto">
              {t('driver', 'gateSubtitle')}
            </p>
          </div>

          {/* Form Controls */}
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {t('driver', 'gatePhoneLabel')}
              </label>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder={t('driver', 'gatePhonePlaceholder')}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200/90 rounded-2xl text-slate-900 font-medium text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F57C00]/40 focus:border-[#F57C00] transition"
              />
            </div>

            {/* Reference Code Display */}
            <div className="bg-orange-50/80 border border-orange-200/80 rounded-2xl p-4 text-center space-y-1">
              <span className="text-[11px] font-bold text-orange-800 uppercase tracking-wider block">
                {t('driver', 'gateRefCodeLabel')}
              </span>
              <span className="text-2xl font-black text-[#F57C00] font-mono tracking-widest block">
                {refCode}
              </span>
            </div>

            {/* Big Green WhatsApp Button */}
            <button
              type="button"
              onClick={handleOpenWhatsapp}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] cursor-pointer"
            >
              <span className="text-lg">💬</span>
              <span>{t('driver', 'gateOpenWhatsapp')}</span>
            </button>

            <p className="text-[11px] text-slate-500 text-center italic leading-tight px-2">
              {t('driver', 'gateNote')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-100 text-slate-900 overflow-hidden font-sans">
      {/* iPhone / iOS PWA Instructions Modal */}
      {showIosGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-[#F57C00] flex items-center gap-2">
                <span>📱</span>
                <span>{t('driver', 'iosModalTitle')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowIosGuideModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p className="font-medium text-slate-900">
                {t('driver', 'iosModalText')}
              </p>

              <ol className="space-y-2 list-decimal list-inside bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                <li>{t('driver', 'iosStep1')}</li>
                <li>{t('driver', 'iosStep2')}</li>
                <li>{t('driver', 'iosStep3')}</li>
              </ol>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  setShowIosGuideModal(false);
                  const perm = await requestNotificationPermission();
                  setNotifPermission(perm);
                }}
                className="flex-1 py-3 bg-[#F57C00] hover:bg-[#e07000] active:bg-[#c76300] text-white font-extrabold text-xs rounded-2xl transition-all shadow-md shadow-[#F57C00]/20 active:scale-95"
              >
                {t('driver', 'iosEnableAnyway')}
              </button>
              <button
                type="button"
                onClick={() => setShowIosGuideModal(false)}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition active:scale-95"
              >
                {t('driver', 'close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner: Mode Observation & Realtime Status */}
      <div className="bg-white border-b border-slate-200/80 px-4 py-2.5 flex items-center justify-between text-xs z-20 shadow-sm">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              supabaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-[#F57C00]'
            }`}
          />
          <span className="font-bold text-slate-800">
            {t('driver', 'modeBanner')} ({activePassengerPins.length} {activePassengerPins.length === 1 ? t('driver', 'passengerCountOne') : t('driver', 'passengerCountPlural')})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600 font-bold bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
            {t('driver', 'radius')}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="text-[11px] font-bold text-slate-500 hover:text-rose-600 active:text-rose-700 transition-colors underline cursor-pointer px-1"
          >
            {t('driver', 'gateLogout')}
          </button>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative flex-1 w-full h-full min-h-[40vh]">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Floating "Ma position" re-center button */}
        <button
          type="button"
          onClick={() => {
            isAutoFollowingRef.current = true;
            setIsAutoFollowing(true);
            if (mapRef.current) {
              mapRef.current.panTo([driverLocation.lat, driverLocation.lng], { animate: true });
            }
          }}
          className={`absolute bottom-8 end-4 z-[400] flex items-center gap-2 px-4 py-2.5 rounded-full font-extrabold text-xs shadow-xl backdrop-blur-md transition-all active:scale-95 border ${
            isAutoFollowing
              ? 'bg-[#F57C00] text-white border-[#F57C00] ring-2 ring-[#F57C00]/30 shadow-[#F57C00]/25'
              : 'bg-white/95 text-slate-800 border-slate-200/90 hover:bg-slate-50 shadow-slate-300/50'
          }`}
        >
          <span className={isAutoFollowing ? 'animate-pulse' : ''}>🎯</span>
          <span>{t('driver', 'myPosition')}</span>
        </button>
      </div>

      {/* Bottom Sheet Panel (InDrive style light rounded card) */}
      <div
        className="relative w-full max-h-[60vh] sm:max-h-[65vh] overflow-y-auto bg-white rounded-t-[2.5rem] p-5 space-y-3.5 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] border-t border-slate-100 z-30 -mt-6 shrink-0"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Decorative Top Pill Handle */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto -mt-1 mb-0.5" />

        {/* Notification Permission Banner / Controls */}
        <div>
          {notifPermission === 'default' && (
            <button
              type="button"
              onClick={handleEnableNotifications}
              className="w-full py-3.5 px-4 bg-[#F57C00] hover:bg-[#e07000] active:bg-[#c76300] text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-[#F57C00]/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span>🔔</span>
              <span>{t('driver', 'enableNotifications')}</span>
            </button>
          )}

          {notifPermission === 'granted' && (
            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl text-xs text-emerald-900 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="font-bold text-emerald-900">{t('driver', 'notificationsEnabled')}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  sendPassengerAlertNotification(
                    t('driver', 'alertTestTitle'),
                    t('driver', 'alertTestBody')
                  );
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-xl shadow-sm transition active:scale-95"
              >
                {t('driver', 'testAlert')}
              </button>
            </div>
          )}

          {notifPermission === 'denied' && (
            <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-[10px] text-slate-500 flex items-center gap-2 font-medium leading-tight">
              <span className="text-slate-400 text-xs shrink-0">⚠️</span>
              <span>{t('driver', 'notificationsBlocked')}</span>
            </div>
          )}
        </div>

        {/* 🎯 Bestemmingskeuze Eerste Passagier (Super Mode Step 1) */}
        <div className="bg-white border border-orange-200/90 rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-sm font-extrabold text-[#F57C00] shrink-0">
                🏁
              </div>
              <div>
                <h4 className="font-extrabold text-xs text-slate-900 leading-tight">
                  {t('driver', 'destChoiceTitle')}
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  {t('driver', 'destChoiceSubtitle')}
                </p>
              </div>
            </div>

            {activeDestination && (
              <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1">
                <span>✓</span>
                <span>{t('driver', 'passengerOnboard')}</span>
              </span>
            )}
          </div>

          {/* Active Destination Card OR Trigger Button */}
          {activeDestination ? (
            <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-xl p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🎯</span>
                    <span className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                      {getLocalizedZoneName(activeDestination.zoneName, lang)}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 font-medium leading-tight">
                    {activeDestination.isCustomPinSet
                      ? `📍 ${t('driver', 'exactLocationSet')}`
                      : `🎯 Center (${activeDestination.centerLat.toFixed(4)}, ${activeDestination.centerLng.toFixed(4)})`}
                  </p>
                </div>
              </div>

              <div className="text-[10px] text-emerald-800 bg-white/80 p-2 rounded-lg border border-emerald-200/60 leading-tight flex items-center gap-1.5">
                <span className="shrink-0">💡</span>
                <span>{t('driver', 'optionalDragPin')}</span>
              </div>

              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setIsZonePickerOpen(!isZonePickerOpen)}
                  className="flex-1 py-2 px-3 bg-white hover:bg-slate-100 text-slate-800 font-extrabold text-[11px] rounded-xl border border-slate-200 shadow-xs transition active:scale-95 cursor-pointer text-center"
                >
                  🔄 {t('driver', 'changeDestination')}
                </button>
                <button
                  type="button"
                  onClick={handleClearDestination}
                  className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] rounded-xl border border-rose-200 transition active:scale-95 cursor-pointer"
                >
                  🏁 {t('driver', 'clearDestination')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {!isZonePickerOpen ? (
                <button
                  type="button"
                  onClick={() => setIsZonePickerOpen(true)}
                  className="w-full py-3.5 px-4 bg-[#F57C00] hover:bg-[#e07000] active:bg-[#c76300] text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#F57C00]/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🚖</span>
                  <span>{t('driver', 'pickupPassengerBtn')}</span>
                </button>
              ) : null}
            </div>
          )}

          {/* Zone Selection Grid (2 Columns, Large Touch Targets, No Scrolling Needed) */}
          {isZonePickerOpen && (
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-bold text-slate-700">
                  📍 {t('driver', 'selectZone')} ({cityZones.length})
                </span>
                {activeDestination && (
                  <button
                    type="button"
                    onClick={() => setIsZonePickerOpen(false)}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕ {t('driver', 'close')}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {cityZones.map((zone) => {
                  const isSelected = activeDestination?.zoneId === zone.id;
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => handleSelectZone(zone)}
                      className={`p-3 rounded-xl font-extrabold text-xs flex flex-col items-center justify-center text-center gap-1 transition-all shadow-xs cursor-pointer active:scale-[0.97] min-h-[64px] ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-2 border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'bg-orange-50/90 hover:bg-[#F57C00] active:bg-[#e07000] text-slate-900 hover:text-white border border-orange-200/90'
                      }`}
                    >
                      <span className="text-base leading-none">📍</span>
                      <span className="leading-snug font-bold">{getLocalizedZoneName(zone.name, lang)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ⚡ Super Mode Section (Auto-switching Stand A & Stand B) */}
        <div
          className={`rounded-2xl transition-all shadow-sm border p-4 space-y-3 ${
            isSuperModeActive
              ? 'bg-emerald-50/50 text-slate-800 border-emerald-300/80'
              : 'bg-white hover:bg-emerald-50/30 border-slate-200/90 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between text-start gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0 transition-all ${
                  isSuperModeActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'bg-slate-100 border border-slate-200 text-slate-500'
                }`}
              >
                ⚡
              </div>

              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center justify-between gap-x-2 pe-1">
                  <h4 className="font-extrabold text-xs text-slate-900 leading-snug flex items-center gap-1.5">
                    <span>{t('driver', 'superModeToggle')}</span>
                    {isSuperModeActive && (
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.2 rounded-md uppercase">
                        {!activeDestination ? t('driver', 'standAShort') : t('driver', 'standBShort')}
                      </span>
                    )}
                  </h4>
                  {isSuperModeActive ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] px-2.5 py-0.5 rounded-full font-extrabold whitespace-nowrap shrink-0 shadow-xs">
                      {t('driver', 'statusOn')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 text-[10px] px-2.5 py-0.5 rounded-full font-extrabold whitespace-nowrap shrink-0">
                      {t('driver', 'statusOff')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  {!activeDestination
                    ? t('driver', 'superModeSubStandA')
                    : t('driver', 'superModeSubtitle')}
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={handleToggleSuperMode}
              aria-label={t('driver', 'superModeToggle')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isSuperModeActive ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isSuperModeActive
                    ? isRTL ? '-translate-x-5' : 'translate-x-5'
                    : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {!isSuperModeActive ? (
            <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-center font-medium">
              💡 {t('driver', 'superModeHintOff')}
            </div>
          ) : !activeDestination ? (
            /* STAND A: 0 Passagiers - Zone Analyse & Hotspot Highlight */
            <div className="space-y-3 pt-2 border-t border-emerald-200/80">
              <div className="flex items-center justify-between text-xs px-0.5">
                <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span>{t('driver', 'standALabel')}</span>
                </span>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                  {t('driver', 'zoneAnalysisBadge')}
                </span>
              </div>

              {/* Hottest Zone Hero Card or Tie Banner */}
              {hottestZoneInfo ? (
                <div
                  onClick={() => {
                    if (mapRef.current) {
                      mapRef.current.flyTo(
                        [hottestZoneInfo.zone.centerLat, hottestZoneInfo.zone.centerLng],
                        15,
                        { animate: true }
                      );
                    }
                  }}
                  className="p-3 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl text-white shadow-md border border-amber-400/80 space-y-1.5 cursor-pointer active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 text-white px-2 py-0.5 rounded-md">
                      {t('driver', 'bestChanceTag')}
                    </span>
                    <span className="text-[11px] font-extrabold bg-white text-amber-900 px-2.5 py-0.5 rounded-full shadow-2xs">
                      🔥 {hottestZoneInfo.count} {hottestZoneInfo.count === 1 ? t('driver', 'waitingPassenger') : t('driver', 'waitingPassengers')}
                    </span>
                  </div>
                  <h5 className="text-sm font-black tracking-tight leading-snug">
                    {getLocalizedZoneName(hottestZoneInfo.zone.name, lang)}
                  </h5>
                  <div className="flex items-center justify-between text-[10px] text-amber-100 pt-0.5">
                    <span>{t('driver', 'highestConcentration')}</span>
                    <span className="font-bold underline">{t('driver', 'viewOnMap')}</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
                  <div className="text-sm font-bold text-slate-700">{t('driver', 'noSpecificHotspot')}</div>
                  <p className="text-[10px] text-slate-500 leading-snug">
                    {t('driver', 'noSpecificHotspotDesc')}
                  </p>
                </div>
              )}

              {/* Zone Breakdown List */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-extrabold text-slate-700 flex items-center justify-between px-1">
                  <span>{t('driver', 'waitingPerZoneTitle')}</span>
                  <span className="text-[10px] font-medium text-slate-500">
                    {t('driver', 'totalWaiting').replace('{count}', String(activePassengerPins.length))}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pe-1">
                  {getZonesForCity('Rabat').map((z) => {
                    const zData = zoneCounts[z.id];
                    const count = zData ? zData.count : 0;
                    const isWinner = hottestZoneInfo && hottestZoneInfo.zone.id === z.id;

                    return (
                      <div
                        key={z.id}
                        onClick={() => {
                          if (mapRef.current) {
                            mapRef.current.flyTo([z.centerLat, z.centerLng], 14, { animate: true });
                          }
                        }}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all cursor-pointer ${
                          isWinner
                            ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-400/30 shadow-xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200/90'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              isWinner ? 'bg-amber-500 animate-pulse' : count > 0 ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                          <span className={`font-bold truncate ${isWinner ? 'text-amber-950' : 'text-slate-800'}`}>
                            {getLocalizedZoneName(z.name, lang)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isWinner && (
                            <span className="text-[9px] font-black bg-amber-500 text-white px-1.5 py-0.2 rounded uppercase">
                              {t('driver', 'bestChanceShort')}
                            </span>
                          )}
                          <span
                            className={`text-[11px] font-black px-2 py-0.5 rounded-lg ${
                              count > 0
                                ? isWinner
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {count}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* STAND B: 1 Passagier - Omweg-check Kandidatenlijst */
            <div className="space-y-2.5 pt-2 border-t border-emerald-200/80">
              <div className="flex items-center justify-between text-xs px-0.5">
                <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>{t('driver', 'standBLabel')}</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  {t('driver', 'detourCheckBadge')}
                </span>
              </div>

              <button
                type="button"
                onClick={handleRunSuperModeCheck}
                disabled={isCalculatingSuperMode}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl border border-emerald-500 shadow-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
              >
                {isCalculatingSuperMode ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>{t('driver', 'calculatingDetours')}</span>
                  </>
                ) : (
                  <span>{t('driver', 'checkCandidatesBtn')}</span>
                )}
              </button>

              {/* Candidate Cards List OR Empty State */}
              {superModeCandidates !== null && !isCalculatingSuperMode && (
                <div className="space-y-2 pt-1">
                  {superModeCandidates.length > 0 ? (
                    superModeCandidates.map((cand) => {
                      const isSelected = selectedCandidateId === cand.passenger.id;
                      const pId = cand.passenger.id.slice(-4);
                      const pickupKm = (cand.pickupDistanceMeters / 1000).toFixed(1);

                      let badgeBg = 'bg-emerald-500 text-white';
                      let badgeBorder = 'border-emerald-600';
                      if (cand.colorCategory === 'orange') {
                        badgeBg = 'bg-amber-500 text-white';
                        badgeBorder = 'border-amber-600';
                      } else if (cand.colorCategory === 'red') {
                        badgeBg = 'bg-rose-500 text-white';
                        badgeBorder = 'border-rose-600';
                      }

                      return (
                        <div
                          key={cand.passenger.id}
                          onClick={() => handleSelectSuperModeCandidate(cand)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer space-y-1.5 active:scale-[0.98] ${
                            isSelected
                              ? 'bg-emerald-100/90 border-emerald-500 ring-2 ring-emerald-500/30 shadow-md'
                              : 'bg-white hover:bg-slate-50 border-slate-200/90 shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${badgeBg}`} />
                              <span className="font-extrabold text-xs text-slate-900">
                                {cand.passenger.bestemming_tekst
                                  ? `Passager #${pId} (${cand.passenger.bestemming_tekst})`
                                  : `Passager #${pId}`}
                              </span>
                            </div>

                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${badgeBg} ${badgeBorder}`}>
                              +{cand.detourMinutes} min {t('driver', 'detourLabel')}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-600 px-0.5">
                            <span>📍 Oppikken op ~{pickupKm} km</span>
                            <span className="font-bold text-emerald-800">
                              {isSelected ? `✓ ${t('driver', 'selectedCandidate')}` : t('driver', 'selectCandidate')}
                            </span>
                          </div>

                          {isSelected && lastNotifSentCandidateId === cand.passenger.id && (
                            <div className="mt-1.5 pt-1.5 border-t border-emerald-300/80 text-[10px] text-emerald-950 font-extrabold flex items-center gap-1.5 bg-emerald-200/60 p-2 rounded-lg leading-tight">
                              <span className="text-xs">📲</span>
                              <span>
                                {t('driver', 'p1NotifSentToast').replace('{minutes}', cand.detourMinutes.toString())}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    /* Empty State: Geen goede match nu */
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
                      <div className="text-lg">🛑</div>
                      <h6 className="font-extrabold text-xs text-slate-900">
                        {t('driver', 'noMatchFound')}
                      </h6>
                      <p className="text-[10px] text-slate-500 font-medium leading-tight">
                        {t('driver', 'noMatchFoundSub')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsLegendOpen(!isLegendOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-2xl text-xs font-extrabold text-slate-800 uppercase tracking-wider text-start transition-all active:scale-[0.99] cursor-pointer shadow-sm"
        >
          <span>{t('driver', 'mapLegend')}</span>
          <ChevronDown
            className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
              isLegendOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isLegendOpen && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="w-6 h-6 rounded-full bg-[#F57C00] flex items-center justify-center text-xs text-white font-bold shadow-sm shadow-[#F57C00]/20 shrink-0">
                  📍
                </span>
                <span className="text-slate-800 font-semibold text-[11px]">{t('driver', 'legendWaiting')}</span>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center text-xs text-white font-bold shadow-sm shadow-rose-500/20 shrink-0">
                  ⚡
                </span>
                <span className="text-slate-800 font-semibold text-[11px]">{t('driver', 'legendHurry')}</span>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-white font-bold shadow-sm shrink-0">
                  🏁
                </span>
                <span className="text-slate-800 font-semibold text-[11px]">{t('driver', 'legendDestination')}</span>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="w-6 h-1 bg-[#F57C00] rounded border border-dashed border-[#F57C00]/80 shrink-0" />
                <span className="text-slate-800 font-semibold text-[11px]">{t('driver', 'legendRoute')}</span>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 text-center italic leading-tight pt-1">
              {t('driver', 'legendFooter')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
