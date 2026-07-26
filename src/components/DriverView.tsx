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
import { triggerPWAInstall, useIsStandalone } from '../lib/pwa';
import { findOptimizedDriverRoute, OptimizedRoute } from '../lib/routeOptimizer';
import { fetchORSDirections, formatDuration } from '../lib/ors';

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
        background: ${type === 'pickup' ? '#2563eb' : '#059669'};
        color: #ffffff;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 2.5px solid #ffffff;
        box-shadow: 0 4px 12px ${type === 'pickup' ? 'rgba(37, 99, 235, 0.6)' : 'rgba(5, 150, 105, 0.6)'};
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

export const DriverView: React.FC = () => {
  const [lang] = useLanguage();
  const isStandalone = useIsStandalone();
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

  // Route Optimization State
  const [onboardPassengersCount, setOnboardPassengersCount] = useState<number>(0);
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null);
  const [showRouteOnMap, setShowRouteOnMap] = useState<boolean>(true);
  const [isOptimizerExpanded, setIsOptimizerExpanded] = useState<boolean>(true);

  // Auto-calculate optimized route when active pins, driver position, or onboard count changes
  useEffect(() => {
    let isMounted = true;

    const route = findOptimizedDriverRoute(
      driverLocation,
      activePassengerPins,
      onboardPassengersCount,
      lang
    );

    if (!route || route.stops.length === 0) {
      setOptimizedRoute(null);
      return;
    }

    // Set immediate initial route with straight line distance for instant UI feedback
    setOptimizedRoute(route);

    // Fetch real road navigation route from OpenRouteService
    const waypoints = [
      driverLocation,
      ...route.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    ];

    fetchORSDirections(waypoints).then((orsResult) => {
      if (isMounted && orsResult && orsResult.geometry.length > 0) {
        setOptimizedRoute((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            roadGeometry: orsResult.geometry,
            roadDistanceMeters: orsResult.distanceMeters,
            roadDurationSeconds: orsResult.durationSeconds,
            isRoadRoute: true,
          };
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [driverLocation, activePassengerPins, onboardPassengersCount, lang]);

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
        <div style="font-family: sans-serif; text-align: center; color: #ffffff; padding: 2px;">
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
          <div style="font-family: sans-serif; font-size: 11px; color: #ffffff;">
            🏁 ${t('driver', 'legendDestination')}: <strong style="color: #ffffff;">${pin.bestemming_tekst || t('driver', 'legendDestination')}</strong>
          </div>
        `);
        destMarker.addTo(layerGroupRef.current!);
      }
    });

    // Render Optimized Multi-Stop Route Overlay
    if (showRouteOnMap && optimizedRoute && optimizedRoute.stops.length > 0) {
      const routePoints: [number, number][] =
        optimizedRoute.isRoadRoute && optimizedRoute.roadGeometry && optimizedRoute.roadGeometry.length > 0
          ? optimizedRoute.roadGeometry
          : [
              [driverLocation.lat, driverLocation.lng],
              ...optimizedRoute.stops.map((s) => [s.lat, s.lng] as [number, number]),
            ];

      // Route glow effect
      L.polyline(routePoints, {
        color: '#2563eb',
        weight: 8,
        opacity: 0.35,
      }).addTo(layerGroupRef.current!);

      // Solid animated dash route line
      L.polyline(routePoints, {
        color: '#1d4ed8',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.95,
      }).addTo(layerGroupRef.current!);

      // Step markers
      optimizedRoute.stops.forEach((stop) => {
        const stepMarker = L.marker([stop.lat, stop.lng], {
          icon: createRouteStepIcon(stop.stepNumber, stop.type),
          zIndexOffset: 2000,
        });

        const typeLabel = stop.type === 'pickup' ? `📍 ${t('driver', 'pickupStep')}` : `🏁 ${t('driver', 'dropoffStep')}`;
        stepMarker.bindPopup(`
          <div style="font-family: sans-serif; padding: 2px;">
            <div style="font-size: 10px; font-weight: 800; color: ${stop.type === 'pickup' ? '#60a5fa' : '#34d399'}; margin-bottom: 2px;">
              ${t('driver', 'routeProposed')} • ${t('driver', 'stepLabel')} ${stop.stepNumber} (${typeLabel})
            </div>
            <strong style="font-size: 12px; color: #ffffff;">${stop.name}</strong>
          </div>
        `);

        stepMarker.addTo(layerGroupRef.current!);
      });
    }

    isClearingLayersRef.current = false;
  }, [activePassengerPins, driverLocation, showRouteOnMap, optimizedRoute]);

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

        {/* ⚡ Route Optimization Feature Section */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-lg border border-slate-800 space-y-3">
          <button
            type="button"
            onClick={() => setIsOptimizerExpanded(!isOptimizerExpanded)}
            className="w-full flex items-center justify-between text-start cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-sm font-bold text-blue-400 shrink-0">
                ⚡
              </div>
              <div>
                <h4 className="font-bold text-xs text-white flex items-center gap-2">
                  <span>{t('driver', 'routeOptimizerTitle')}</span>
                  {optimizedRoute && (
                    <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {optimizedRoute.passengers.length} {optimizedRoute.passengers.length === 1 ? t('driver', 'match') : t('driver', 'matches')}
                    </span>
                  )}
                </h4>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {t('driver', 'routeOptimizerDesc')}
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                isOptimizerExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isOptimizerExpanded && (
            <div className="space-y-3 pt-2 border-t border-slate-800 text-xs">
              {/* Onboard Passenger Counter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  {t('driver', 'onboardPassengers')}
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 1, 2, 3].map((num) => {
                    const isSelected = onboardPassengersCount === num;
                    const isFull = num === 3;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setOnboardPassengersCount(num)}
                        className={`py-2 px-1 rounded-xl font-bold text-[11px] border transition-all text-center flex flex-col items-center justify-center gap-0.5 ${
                          isSelected
                            ? isFull
                              ? 'bg-rose-600 text-white border-rose-500 ring-2 ring-rose-500/30 shadow-md'
                              : 'bg-blue-600 text-white border-blue-500 ring-2 ring-blue-500/30 shadow-md'
                            : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80'
                        }`}
                      >
                        <span className="text-xs">
                          {num === 0 ? '🚖 0' : isFull ? '🈵 3/3' : `👥 ${num}`}
                        </span>
                        <span className="text-[9px] opacity-80 font-medium">
                          {isFull
                            ? t('driver', 'taxiFullShort')
                            : `${3 - num} ${3 - num === 1 ? t('driver', 'seat') : t('driver', 'seats')}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optimization Results */}
              {onboardPassengersCount === 3 ? (
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-center text-slate-300 text-[11px]">
                  <span>🚖 {t('driver', 'taxiFull')}</span>
                </div>
              ) : optimizedRoute ? (
                <div className="bg-slate-800/90 rounded-xl p-3 border border-slate-700/80 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] gap-2">
                    <span className="font-semibold text-blue-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
                      <span>{optimizedRoute.explanation}</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {optimizedRoute.isRoadRoute && optimizedRoute.roadDurationSeconds ? (
                        <span className="text-[10px] text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-700/80 font-bold flex items-center gap-1">
                          <span>⏱️ {formatDuration(optimizedRoute.roadDurationSeconds, lang)}</span>
                        </span>
                      ) : null}
                      <span className="text-[10px] text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-700 font-medium">
                        {optimizedRoute.isRoadRoute && optimizedRoute.roadDistanceMeters
                          ? `${(optimizedRoute.roadDistanceMeters / 1000).toFixed(1)} km 🛣️`
                          : `${(optimizedRoute.totalDistanceMeters / 1000).toFixed(1)} km 📏`}
                      </span>
                    </div>
                  </div>

                  {/* Step Sequence List */}
                  <div className="space-y-1.5 pt-1">
                    {optimizedRoute.stops.map((stop) => (
                      <div
                        key={stop.id}
                        className="flex items-center gap-2 bg-slate-900/60 p-2 rounded-lg border border-slate-700/50 text-[11px]"
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-extrabold text-[10px] shrink-0 text-white ${
                            stop.type === 'pickup' ? 'bg-blue-600' : 'bg-emerald-600'
                          }`}
                        >
                          {stop.stepNumber}
                        </span>
                        <span className="text-xs shrink-0">
                          {stop.type === 'pickup' ? '📍' : '🏁'}
                        </span>
                        <div className="flex-1 truncate">
                          <span className="font-semibold text-slate-200">
                            {stop.type === 'pickup' ? t('driver', 'pickupStep') : t('driver', 'dropoffStep')}:
                          </span>{' '}
                          <span className="text-slate-300 font-medium">{stop.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Map and Navigation Buttons */}
                  <div className="pt-1 flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRouteOnMap(!showRouteOnMap)}
                      className={`flex-1 py-2 px-3 rounded-xl font-extrabold text-[11px] border transition-all flex items-center justify-center gap-1.5 ${
                        showRouteOnMap
                          ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                          : 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600'
                      }`}
                    >
                      <span>🗺️</span>
                      <span>
                        {showRouteOnMap
                          ? t('driver', 'hideRouteOnMap')
                          : t('driver', 'showRouteOnMap')}
                      </span>
                    </button>

                    <a
                      href={optimizedRoute.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] rounded-xl border border-emerald-500 flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/30 text-decoration-none"
                    >
                      <span>🧭</span>
                      <span>{t('driver', 'startRouteNav')}</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-center text-slate-400 text-[11px]">
                  <span>{t('driver', 'noOptimizedRoute')}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Optional Install Button for drivers */}
        {!isStandalone && (
          <button
            type="button"
            onClick={triggerPWAInstall}
            className="w-full py-2.5 px-4 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/25 text-[#D97706] font-extrabold text-xs rounded-2xl border border-amber-500/30 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
          >
            <span className="text-sm">📲</span>
            <span>{t('pwa', 'installApp')}</span>
          </button>
        )}

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
