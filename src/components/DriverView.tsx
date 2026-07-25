import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
import { t, useLanguage } from '../lib/i18n';

const DEFAULT_DRIVER_CENTER = { lat: 34.015, lng: -6.832 }; // Rabat center for driver

// 15 minutes expiration threshold & 2km radius
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const MAX_RADIUS_METERS = 2000; // 2km radius

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

export const DriverView: React.FC = () => {
  useLanguage();
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
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [driverLocation.lat, driverLocation.lng],
      zoom: 13,
      zoomControl: false,
    });

    // Pause auto-following if the user manually drags or zooms the map
    map.on('dragstart zoomstart', () => {
      isAutoFollowingRef.current = false;
      setIsAutoFollowing(false);
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 7. Sync Driver Marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (!driverMarkerRef.current) {
      const marker = L.marker([driverLocation.lat, driverLocation.lng], {
        icon: createDriverMarkerIcon(),
        zIndexOffset: 1000,
      }).addTo(mapRef.current);

      marker.bindPopup(`
        <div style="font-family: sans-serif; text-align: center; color: #0f172a; padding: 2px;">
          <strong style="font-size: 13px;">${t('driver', 'yourPosition')}</strong>
        </div>
      `);

      driverMarkerRef.current = marker;
    } else {
      driverMarkerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
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
      color: '#3b82f6',
      weight: 1.5,
      dashArray: '6, 6',
      fillColor: '#3b82f6',
      fillOpacity: 0.05,
    }).addTo(layerGroupRef.current);

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
        ? `<div style="font-size: 11px; margin-top: 4px; color: #334155;">🏁 ${t('driver', 'legendDestination')}: <strong>${pin.bestemming_tekst}</strong></div>`
        : `<div style="font-size: 11px; margin-top: 4px; color: #64748b; font-style: italic;">${t('driver', 'popupNoDest')}</div>`;

      const googleNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${pickupLat},${pickupLng}`;

      passengerMarker.bindPopup(`
        <div style="font-family: sans-serif; padding: 2px; min-width: 170px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <strong style="font-size: 12px; color: #0f172a;">${t('driver', 'popupPassenger')}</strong>
            ${statusBadge}
          </div>
          <div style="font-size: 11px; color: #475569;">Distance: <strong>${distKm} km</strong></div>
          ${destText}
          <a
            href="${googleNavUrl}"
            target="_blank"
            rel="noopener noreferrer"
            style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 10px; width: 100%; padding: 8px 12px; background: #2563eb; color: #ffffff; border-radius: 8px; font-size: 12px; font-weight: 700; text-decoration: none; box-shadow: 0 2px 4px rgba(37,99,235,0.3); transition: background 0.2s;"
          >
            <span>🧭</span>
            <span>${t('driver', 'popupNavigate')}</span>
          </a>
        </div>
      `);

      passengerMarker.addTo(layerGroupRef.current!);

      if (openPopupPinIdRef.current === pin.id) {
        passengerMarker.openPopup();
      }

      if (pin.bestemming_lat && pin.bestemming_lng) {
        const destLat = pin.bestemming_lat;
        const destLng = pin.bestemming_lng;

        L.polyline(
          [
            [pickupLat, pickupLng],
            [destLat, destLng],
          ],
          {
            color: isPresse ? '#ef4444' : '#F57C00',
            weight: 2.5,
            dashArray: '5, 5',
            opacity: 0.85,
          }
        ).addTo(layerGroupRef.current!);

        const destMarker = L.marker([destLat, destLng], {
          icon: createDestinationIcon(),
        });
        destMarker.bindPopup(`
          <div style="font-family: sans-serif; font-size: 11px; color: #0f172a;">
            🏁 ${t('driver', 'legendDestination')}: <strong>${pin.bestemming_tekst || t('driver', 'legendDestination')}</strong>
          </div>
        `);
        destMarker.addTo(layerGroupRef.current!);
      }
    });

    isClearingLayersRef.current = false;
  }, [activePassengerPins, driverLocation]);

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
        <span className="text-[10px] text-slate-600 font-bold bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
          {t('driver', 'radius')}
        </span>
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
              mapRef.current.setView([driverLocation.lat, driverLocation.lng], 13, { animate: true });
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
      <div className="relative w-full bg-white rounded-t-[2.5rem] p-5 space-y-3.5 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] border-t border-slate-100 z-30 -mt-6">
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
