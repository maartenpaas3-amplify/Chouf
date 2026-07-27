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
import { t, useLanguage } from '../lib/i18n';
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

export const DriverView: React.FC = () => {
  const [lang] = useLanguage();

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

  // Route Optimization State
  const [onboardPassengersCount, setOnboardPassengersCount] = useState<number>(0);
  const [optimizedRoute, setOptimizedRoute] = useState<
    (OptimizedRoute & { orsStatus?: 'loading' | 'success' | 'failed' }) | null
  >(null);
  const [showRouteOnMap, setShowRouteOnMap] = useState<boolean>(true);
  const [isOptimizerExpanded, setIsOptimizerExpanded] = useState<boolean>(false);

  const orsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevStopsHashRef = useRef<string>('');

  // Auto-calculate optimized route when active pins, driver position, or onboard count changes
  useEffect(() => {
    let isMounted = true;

    if (!isOptimizerExpanded) {
      setOptimizedRoute(null);
      prevStopsHashRef.current = '';
      if (orsTimerRef.current) {
        clearTimeout(orsTimerRef.current);
      }
      return;
    }

    const route = findOptimizedDriverRoute(
      driverLocation,
      activePassengerPins,
      onboardPassengersCount,
      lang
    );

    if (!route || route.stops.length === 0) {
      setOptimizedRoute(null);
      prevStopsHashRef.current = '';
      return;
    }

    const stopsHash = route.stops.map((s) => `${s.id}-${s.type}`).join('|') + `_${onboardPassengersCount}`;
    const stopsChanged = stopsHash !== prevStopsHashRef.current;
    prevStopsHashRef.current = stopsHash;

    const apiKey = import.meta.env.VITE_OPENROUTESERVICE_API_KEY;
    const hasApiKey = Boolean(apiKey && typeof apiKey === 'string' && apiKey.trim() !== '');

    // Set initial route state without resetting to loading if stops didn't change and we already have a road route
    setOptimizedRoute((prev) => {
      if (!stopsChanged && prev && prev.isRoadRoute && prev.roadGeometry && prev.roadGeometry.length > 0) {
        return {
          ...route,
          roadGeometry: prev.roadGeometry,
          roadDistanceMeters: prev.roadDistanceMeters,
          roadDurationSeconds: prev.roadDurationSeconds,
          isRoadRoute: true,
          orsStatus: 'success',
        };
      }

      if (!hasApiKey) {
        return {
          ...route,
          isRoadRoute: false,
          orsStatus: 'failed',
        };
      }

      return {
        ...route,
        isRoadRoute: false,
        orsStatus: 'loading',
      };
    });

    if (!hasApiKey) return;

    const waypoints = [
      driverLocation,
      ...route.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    ];

    if (orsTimerRef.current) {
      clearTimeout(orsTimerRef.current);
    }

    orsTimerRef.current = setTimeout(() => {
      fetchORSDirections(waypoints).then((orsResult) => {
        if (isMounted) {
          if (orsResult && orsResult.geometry && orsResult.geometry.length > 0) {
            setOptimizedRoute((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                roadGeometry: orsResult.geometry,
                roadDistanceMeters: orsResult.distanceMeters,
                roadDurationSeconds: orsResult.durationSeconds,
                isRoadRoute: true,
                orsStatus: 'success',
              };
            });
          } else {
            setOptimizedRoute((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                isRoadRoute: false,
                orsStatus: 'failed',
              };
            });
          }
        }
      });
    }, 250);

    return () => {
      isMounted = false;
      if (orsTimerRef.current) {
        clearTimeout(orsTimerRef.current);
      }
    };
  }, [isOptimizerExpanded, driverLocation, activePassengerPins, onboardPassengersCount, lang]);

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

    // Force initial size calculation
    map.invalidateSize();
    const initTimer1 = setTimeout(() => map.invalidateSize(), 100);
    const initTimer2 = setTimeout(() => map.invalidateSize(), 300);

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

    // Render Optimized Multi-Stop Route Overlay
    if (showRouteOnMap && optimizedRoute && optimizedRoute.stops.length > 0) {
      const straightLinePoints: [number, number][] = [
        [driverLocation.lat, driverLocation.lng],
        ...optimizedRoute.stops.map((s) => [s.lat, s.lng] as [number, number]),
      ];

      const isRoadReady =
        optimizedRoute.isRoadRoute &&
        optimizedRoute.roadGeometry &&
        optimizedRoute.roadGeometry.length > 0;

      const isOrsLoading = optimizedRoute.orsStatus === 'loading';

      if (isRoadReady) {
        // STATE B: Real road route loaded (smooth fade-in transition)
        const roadPoints = optimizedRoute.roadGeometry!;

        // Route glow effect
        L.polyline(roadPoints, {
          color: '#F57C00',
          weight: 8,
          opacity: 0.35,
          className: 'route-line-fadeIn',
        }).addTo(layerGroupRef.current!);

        // Solid animated dash route line
        L.polyline(roadPoints, {
          color: '#E65100',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.95,
          className: 'route-line-fadeIn',
        }).addTo(layerGroupRef.current!);
      } else if (isOrsLoading) {
        // STATE A: ORS request in flight -> subtle, faint, gently pulsing placeholder line
        L.polyline(straightLinePoints, {
          color: '#F57C00',
          weight: 3.5,
          opacity: 0.35,
          dashArray: '6, 10',
          className: 'route-line-loading',
        }).addTo(layerGroupRef.current!);
      } else {
        // STATE C: Fallback when ORS fails or returns empty -> solid straight-line route
        L.polyline(straightLinePoints, {
          color: '#F57C00',
          weight: 8,
          opacity: 0.35,
        }).addTo(layerGroupRef.current!);

        L.polyline(straightLinePoints, {
          color: '#E65100',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.95,
        }).addTo(layerGroupRef.current!);
      }

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

        {/* ⚡ Route Optimization Feature Section */}
        <div
          className={`rounded-2xl transition-all shadow-sm border ${
            isOptimizerExpanded
              ? 'bg-slate-50 text-slate-800 border-slate-200/80 p-4 space-y-3'
              : 'bg-white hover:bg-orange-50/50 border-slate-200/90 text-slate-900 p-3.5'
          }`}
        >
          <button
            type="button"
            onClick={() => setIsOptimizerExpanded(!isOptimizerExpanded)}
            className="w-full flex items-center justify-between text-start cursor-pointer group gap-3"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0 transition-all ${
                  isOptimizerExpanded
                    ? 'bg-[#F57C00] text-white shadow-md shadow-[#F57C00]/30'
                    : 'bg-slate-100 border border-slate-200 text-slate-500 group-hover:bg-orange-100 group-hover:text-orange-600 group-hover:border-orange-200'
                }`}
              >
                ⚡
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pe-1">
                  <h4 className="font-extrabold text-xs text-slate-900 leading-snug flex items-center gap-1.5">
                    <span>{t('driver', 'routeOptimizerTitle')}</span>
                  </h4>
                  {isOptimizerExpanded ? (
                    <span className="inline-flex items-center gap-1 bg-[#F57C00] text-white text-[10px] px-2.5 py-0.5 rounded-full font-extrabold whitespace-nowrap shrink-0 shadow-xs">
                      ON {optimizedRoute && optimizedRoute.passengers.length > 0 ? `· ${optimizedRoute.passengers.length} ${optimizedRoute.passengers.length === 1 ? t('driver', 'match') : t('driver', 'matches')}` : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 text-[10px] px-2.5 py-0.5 rounded-full font-extrabold whitespace-nowrap shrink-0 group-hover:border-orange-300 group-hover:text-orange-600">
                      OFF
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed truncate">
                  {t('driver', 'routeOptimizerDesc')}
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 shrink-0 ${
                isOptimizerExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isOptimizerExpanded && (
            <div className="space-y-4 pt-3.5 mt-1 border-t border-slate-200/80 text-xs">
              {/* Onboard Passenger Counter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-2">
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
                              : 'bg-orange-500 text-white border-orange-600 ring-2 ring-orange-500/30 shadow-md'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-sm'
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
                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-center text-slate-600 text-[11px]">
                  <span>🚖 {t('driver', 'taxiFull')}</span>
                </div>
              ) : optimizedRoute ? (
                <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] gap-2">
                    <span className="font-semibold text-orange-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shrink-0" />
                      <span>{optimizedRoute.explanation}</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {optimizedRoute.isRoadRoute && optimizedRoute.roadDurationSeconds ? (
                        <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-bold flex items-center gap-1">
                          <span>⏱️ {formatDuration(optimizedRoute.roadDurationSeconds, lang)}</span>
                        </span>
                      ) : null}
                      <span className="text-[10px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 font-medium">
                        {optimizedRoute.isRoadRoute && optimizedRoute.roadDistanceMeters
                          ? `${(optimizedRoute.roadDistanceMeters / 1000).toFixed(1)} km 🛣️`
                          : `${(optimizedRoute.totalDistanceMeters / 1000).toFixed(1)} km 📏`}
                      </span>
                    </div>
                  </div>

                  {/* Step Sequence List */}
                  <div className="space-y-1.5 pt-1">
                    {/* Prominent Navigation Button at Top */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!optimizedRoute || !optimizedRoute.stops || optimizedRoute.stops.length === 0) return;
                        console.log('[NAV] Opening Google Maps route:', optimizedRoute.googleMapsUrl);
                        window.open(optimizedRoute.googleMapsUrl, '_blank', 'noopener,noreferrer');
                      }}
                      disabled={!optimizedRoute || !optimizedRoute.stops || optimizedRoute.stops.length === 0}
                      className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl border border-emerald-500 flex items-center justify-center gap-2 shadow-md shadow-emerald-600/30 cursor-pointer disabled:cursor-not-allowed transition-all"
                    >
                      <span className="text-sm">🧭</span>
                      <span>{t('driver', 'navWithGoogleMaps')}</span>
                    </button>

                    {optimizedRoute.stops.map((stop) => (
                      <div
                        key={stop.id}
                        className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200/80 text-[11px]"
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-extrabold text-[10px] shrink-0 text-white ${
                            stop.type === 'pickup' ? 'bg-orange-500' : 'bg-emerald-600'
                          }`}
                        >
                          {stop.stepNumber}
                        </span>
                        <span className="text-xs shrink-0">
                          {stop.type === 'pickup' ? '📍' : '🏁'}
                        </span>
                        <div className="flex-1 truncate">
                          <span className="font-semibold text-slate-800">
                            {stop.type === 'pickup' ? t('driver', 'pickupStep') : t('driver', 'dropoffStep')}:
                          </span>{' '}
                          <span className="text-slate-600 font-medium">{stop.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Map Toggle Button */}
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowRouteOnMap(!showRouteOnMap)}
                      className="w-full py-2 px-3 rounded-xl font-semibold text-[11px] bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>🗺️</span>
                      <span>
                        {showRouteOnMap
                          ? t('driver', 'hideRouteOnMap')
                          : t('driver', 'showRouteOnMap')}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-center text-slate-500 text-[11px]">
                  <span>{t('driver', 'noOptimizedRoute')}</span>
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
