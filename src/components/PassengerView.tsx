import React, { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { taxiStore } from '../lib/store';
import { supabase, isSupabaseConfigured, getDistanceMeters, getOrCreateAnonymousUser } from '../lib/supabase';
import { t, useLanguage } from '../lib/i18n';
import { triggerPWAInstall, useIsStandalone } from '../lib/pwa';

// Hardcoded places in Rabat
const RABAT_DESTINATIONS = [
  { name: 'Gare Rabat Ville', lat: 34.0175, lng: -6.8368 },
  { name: 'Tour Hassan', lat: 34.0242, lng: -6.8227 },
  { name: 'Bab El Had', lat: 34.0205, lng: -6.8385 },
  { name: 'Agdal', lat: 34.0028, lng: -6.8482 },
  { name: 'Hay Riad', lat: 33.9558, lng: -6.8835 },
  { name: 'Kasbah des Oudayas', lat: 34.0318, lng: -6.8358 },
];

const DEFAULT_CENTER = { lat: 34.0209, lng: -6.8416 }; // Rabat Center

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

const createUserIcon = () =>
  L.divIcon({
    className: 'custom-user-icon',
    html: `
      <div style="
        background: #F57C00;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 3px solid #ffffff;
        box-shadow: 0 4px 12px rgba(245,124,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        cursor: grab;
      ">
        📍
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

const createDestinationIcon = () =>
  L.divIcon({
    className: 'custom-dest-icon',
    html: `
      <div style="
        background: #ef4444;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 3px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        cursor: grab;
      ">
        🏁
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

export const PassengerView: React.FC = () => {
  const [lang] = useLanguage();
  const isStandalone = useIsStandalone();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>(DEFAULT_CENTER);
  const [destination, setDestination] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [destinationInput, setDestinationInput] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isPresse, setIsPresse] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [activeRequestId, setActiveRequestId] = useState<string>(() => {
    let savedId = localStorage.getItem('chouf_passenger_pin_id');
    if (!savedId) {
      savedId = 'pass_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('chouf_passenger_pin_id', savedId);
    }
    return savedId;
  });

  const [userId, setUserId] = useState<string | null>(null);

  // Auto-login anonymously in background
  useEffect(() => {
    getOrCreateAnonymousUser().then((id) => {
      if (id) {
        setUserId(id);
      }
    });
  }, []);

  // Tracking last synced values to enforce 50m / 30s throttling
  const lastSyncRef = useRef<{
    lat: number;
    lng: number;
    destName: string | null;
    isPresse: boolean;
    timestamp: number;
  }>({
    lat: 0,
    lng: 0,
    destName: null,
    isPresse: false,
    timestamp: 0,
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Get User Geolocation
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          if (mapRef.current) {
            mapRef.current.setView([loc.lat, loc.lng], 15);
          }
        },
        (err) => {
          console.warn('Geolocation error:', err);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [userLocation.lat, userLocation.lng],
      zoom: 15,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    // Map tap/click updates location
    map.on('click', (e: L.LeafletMouseEvent) => {
      const clickedLoc = {
        lat: Math.round(e.latlng.lat * 10000) / 10000,
        lng: Math.round(e.latlng.lng * 10000) / 10000,
      };
      
      setUserLocation(clickedLoc);
    });

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 3. Sync User Marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (!userMarkerRef.current) {
      const marker = L.marker([userLocation.lat, userLocation.lng], {
        draggable: true,
        icon: createUserIcon(),
      }).addTo(mapRef.current);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setUserLocation({
          lat: Math.round(pos.lat * 10000) / 10000,
          lng: Math.round(pos.lng * 10000) / 10000,
        });
      });

      userMarkerRef.current = marker;
    } else {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    }
  }, [userLocation]);

  // 4. Sync Destination Marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (destination) {
      if (!destMarkerRef.current) {
        const marker = L.marker([destination.lat, destination.lng], {
          draggable: true,
          icon: createDestinationIcon(),
        }).addTo(mapRef.current);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          setDestination({
            name: destination.name || 'Destination',
            lat: Math.round(pos.lat * 10000) / 10000,
            lng: Math.round(pos.lng * 10000) / 10000,
          });
        });

        destMarkerRef.current = marker;
      } else {
        destMarkerRef.current.setLatLng([destination.lat, destination.lng]);
      }
    } else if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
  }, [destination]);

  // 5. Automatically publish / update visible state in Supabase & local taxiStore
  useEffect(() => {
    if (!isActive) return;

    const now = Date.now();
    const last = lastSyncRef.current;
    const destName = destination?.name || null;

    const distMoved = getDistanceMeters(last.lat, last.lng, userLocation.lat, userLocation.lng);
    const timeElapsed = now - last.timestamp;
    const attributeChanged = last.destName !== destName || last.isPresse !== isPresse;

    // Throttle check: update if attributes changed, or moved > 50m, or > 30 seconds passed
    if (!attributeChanged && distMoved < 50 && timeElapsed < 30000 && last.timestamp > 0) {
      return;
    }

    lastSyncRef.current = {
      lat: userLocation.lat,
      lng: userLocation.lng,
      destName,
      isPresse,
      timestamp: now,
    };

    // Update Local taxiStore (fallback / cross-tab local communication)
    const currentReqs = taxiStore.getRequests();
    let existing = currentReqs.find((r) => r.id === activeRequestId);

    if (existing && existing.status !== 'CANCELLED' && existing.status !== 'COMPLETED') {
      taxiStore.saveRequests(
        currentReqs.map((r) => {
          if (r.id === activeRequestId) {
            return {
              ...r,
              pickup: { lat: userLocation.lat, lng: userLocation.lng, name: t('passenger', 'myPosition') },
              destination: destination
                ? { lat: destination.lat, lng: destination.lng, name: destination.name }
                : undefined,
              destinationNote: isPresse ? t('passenger', 'inAHurry') : '',
            };
          }
          return r;
        })
      );
    } else {
      taxiStore.addRequest({
        id: activeRequestId,
        passengerName: t('header', 'passenger'),
        passengerPhone: '',
        pickup: { lat: userLocation.lat, lng: userLocation.lng, name: t('passenger', 'myPosition') },
        destination: destination
          ? { lat: destination.lat, lng: destination.lng, name: destination.name }
          : undefined,
        destinationNote: isPresse ? t('passenger', 'inAHurry') : '',
        taxiType: 'PETIT_TAXI',
        passengerCount: 1,
        estimatedFareMad: 15,
        distanceKm: 2,
      });
    }

    // Write to Supabase Database
    if (supabase) {
      const syncToSupabase = async () => {
        let validUserId = userId;
        if (!validUserId) {
          console.log('[Supabase] Resolving user session before writing passenger pin...');
          validUserId = await getOrCreateAnonymousUser();
          if (validUserId) {
            setUserId(validUserId);
          }
        }

        const nowIso = new Date().toISOString();
        const payload: Record<string, any> = {
          id: activeRequestId,
          type: 'passagier',
          lat: userLocation.lat,
          lng: userLocation.lng,
          bestemming_lat: destination?.lat ?? null,
          bestemming_lng: destination?.lng ?? null,
          bestemming_tekst: destination?.name ?? null,
          haast: isPresse,
          telefoon: null,
          user_id: validUserId || null,
          aangemaakt_op: nowIso,
          laatst_geupdate_op: nowIso,
        };

        console.log('[Supabase] Attempting to upsert passenger pin:', { activeRequestId, user_id: validUserId, payload });

        try {
          const { data, error } = await supabase.from('pins').upsert(payload);
          if (error) {
            console.warn('[Supabase] Note on writing/upserting passenger pin:', error.message || error);

            // If RLS policy prevents updating an existing row (e.g. stale request ID from previous session), regenerate ID and retry
            if (error.message?.includes('row-level security') || error.code === '42501' || error.message?.includes('USING expression')) {
              console.warn('[Supabase] Stale request ID caused RLS rejection. Generating fresh request ID and retrying...');
              const freshId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'req_' + Math.random().toString(36).substring(2, 11);
              localStorage.setItem('chouf_active_request_id', freshId);
              setActiveRequestId(freshId);
              payload.id = freshId;

              try {
                const { data: retryData, error: retryError } = await supabase.from('pins').upsert(payload);
                if (retryError) {
                  console.warn('[Supabase] Retry with fresh request ID resulted in:', retryError.message || retryError);
                } else {
                  console.log('[Supabase] Passenger pin successfully written with fresh request ID:', freshId, 'user_id:', validUserId, retryData);
                }
              } catch (retryEx) {
                console.warn('[Supabase] Retry exception:', retryEx);
              }
            } else if (error.code === '23503' && payload.user_id) {
              // If error is due to user_id FK constraint, retry without user_id
              console.warn('[Supabase] Retrying upsert without user_id due to foreign key constraint...');
              delete payload.user_id;
              try {
                const { data: retryData, error: retryError } = await supabase.from('pins').upsert(payload);
                if (retryError) {
                  console.warn('[Supabase] Retry without user_id resulted in:', retryError.message || retryError);
                } else {
                  console.log('[Supabase] Passenger pin successfully written (without user_id):', activeRequestId, retryData);
                }
              } catch (retryEx) {
                console.warn('[Supabase] Retry exception:', retryEx);
              }
            }
          } else {
            console.log('[Supabase] Passenger pin successfully written to Supabase:', activeRequestId, 'user_id:', validUserId, data);
          }
        } catch (err) {
          console.warn('[Supabase] Network or fetch exception writing passenger pin:', err);
        }
      };

      syncToSupabase();
    }
  }, [userLocation, destination, isPresse, isActive, activeRequestId, userId]);

  // Perform Nominatim Search
  const performSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(false);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=5&countrycodes=ma`,
        {
          headers: {
            'Accept-Language': 'fr, ar, en',
          },
        }
      );
      if (!response.ok) {
        throw new Error('Search request failed');
      }
      const data = await response.json();
      setSearchResults(Array.isArray(data) ? data : []);
      setHasSearched(true);
    } catch (err) {
      console.warn('Nominatim error:', err);
      setSearchResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Input Change with 800ms Debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDestinationInput(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!value.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      if (destination) {
        setDestination(null);
      }
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      performSearch(value);
    }, 800);
  };

  // Handle Enter Key Press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      performSearch(destinationInput);
    }
  };

  // Handle Search Result Selection
  const handleSelectSearchResult = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const shortName = result.display_name.split(',')[0] || result.display_name;

    const place = { name: shortName, lat, lng };
    setDestination(place);
    setDestinationInput(shortName);
    setSearchResults([]);
    setHasSearched(false);

    if (mapRef.current) {
      mapRef.current.panTo([lat, lng], { animate: true });
    }
  };

  // Select place from hardcoded list
  const handleSelectPlace = (place: { name: string; lat: number; lng: number }) => {
    setDestination(place);
    setDestinationInput(place.name);
    setSearchResults([]);
    setHasSearched(false);
    if (mapRef.current) {
      mapRef.current.panTo([place.lat, place.lng], { animate: true });
    }
  };

  // Arrêter action
  const handleStop = () => {
    // 1. Remove from local store
    if (activeRequestId) {
      taxiStore.cancelRequest(activeRequestId);
    }

    // 2. Remove from Supabase
    if (supabase && activeRequestId) {
      console.log('[Supabase] Removing passenger pin on stop:', activeRequestId);
      (async () => {
        try {
          const { error } = await supabase.from('pins').delete().eq('id', activeRequestId);
          if (error) {
            console.warn('[Supabase] Note on deleting passenger pin:', error.message || error);
          } else {
            console.log('[Supabase] Passenger pin successfully deleted from Supabase:', activeRequestId);
          }
        } catch (err) {
          console.warn('[Supabase] Delete exception:', err);
        }
      })();
    }

    setIsActive(false);
    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
    setDestination(null);
    setDestinationInput('');
    setSearchResults([]);
    setHasSearched(false);

    // Reset last sync
    lastSyncRef.current.timestamp = 0;
  };

  // Restart visibility
  const handleRestart = () => {
    setIsActive(true);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-100 text-slate-900 overflow-hidden font-sans">
      {/* Map View */}
      <div className="relative flex-1 w-full h-full min-h-[40vh]">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {/* Bottom Sheet Panel (InDrive style light rounded card) */}
      <div className="relative w-full bg-white rounded-t-[2.5rem] p-5 space-y-4 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] border-t border-slate-100 z-30 -mt-6">
        {/* Decorative Top Pill Handle */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto -mt-1 mb-1" />

        {/* Status text with pulsing green dot */}
        {isActive ? (
          <div className="flex items-center gap-3 p-3.5 bg-emerald-50/90 border border-emerald-200/80 rounded-2xl shadow-sm">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <span className="text-xs font-bold text-emerald-900 leading-tight">
              {t('passenger', 'visibleStatus')}
            </span>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-center space-y-2">
            <p className="text-xs font-medium text-slate-600">{t('passenger', 'notVisibleStatus')}</p>
            <button
              type="button"
              onClick={handleRestart}
              className="px-5 py-2.5 bg-[#F57C00] hover:bg-[#e07000] active:bg-[#c76300] text-white font-bold text-xs rounded-xl transition shadow-md shadow-[#F57C00]/20 active:scale-95"
            >
              {t('passenger', 'becomeVisible')}
            </button>
          </div>
        )}

        {/* Combined Destination Search Input & Results & Hardcoded Shortcuts */}
        <div className="space-y-2.5">
          <div className="relative">
            <div className="absolute start-4 top-3.5 text-[#F57C00] text-base pointer-events-none">
              🔍
            </div>
            <input
              type="text"
              value={destinationInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t('passenger', 'searchPlaceholder')}
              className="w-full ps-11 pe-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#F57C00] focus:bg-white focus:ring-2 focus:ring-[#F57C00]/20 transition shadow-inner"
            />
            {isSearching && (
              <span className="absolute end-4 top-3.5 text-xs text-[#F57C00] font-bold animate-pulse">
                {t('passenger', 'searching')}
              </span>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto shadow-xl">
              {searchResults.map((result) => (
                <button
                  key={result.place_id}
                  type="button"
                  onClick={() => handleSelectSearchResult(result)}
                  className="w-full text-start px-4 py-3 text-xs text-slate-700 hover:bg-[#F57C00]/10 hover:text-slate-900 transition flex flex-col gap-0.5"
                >
                  <span className="font-bold text-[#F57C00] text-sm">
                    {result.display_name.split(',')[0]}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">
                    {result.display_name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* No Results Message */}
          {hasSearched && !isSearching && searchResults.length === 0 && (
            <div className="text-xs text-slate-500 italic px-2 py-1">
              {t('passenger', 'noResults')}
            </div>
          )}

          {/* Hardcoded Rabat Shortcut Buttons */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar pt-0.5">
            {RABAT_DESTINATIONS.map((place) => (
              <button
                key={place.name}
                type="button"
                onClick={() => handleSelectPlace(place)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                  destination?.name === place.name
                    ? 'bg-[#F57C00] border-[#F57C00] text-white font-bold shadow-md shadow-[#F57C00]/20 scale-[1.02]'
                    : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200/80 text-slate-700 active:scale-95'
                }`}
              >
                <MapPin
                  className={`w-3.5 h-3.5 shrink-0 ${
                    destination?.name === place.name ? 'text-white' : 'text-[#F57C00]'
                  }`}
                  fill="currentColor"
                />
                <span>{place.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Toggle: Je suis pressé */}
        <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
          <div className="flex items-center gap-2.5">
            <span className={`text-base ${isPresse ? 'text-[#F57C00] font-bold' : 'text-slate-500'}`}>⚡</span>
            <span className="text-sm font-bold text-slate-800">{t('passenger', 'inAHurry')}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsPresse(!isPresse)}
            className={`w-13 h-7 flex items-center rounded-full p-1 transition-colors duration-200 ${
              isPresse ? 'bg-[#F57C00] shadow-sm shadow-[#F57C00]/30' : 'bg-slate-300'
            }`}
          >
            <div
              className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${
                isPresse ? (lang === 'ar' ? '-translate-x-6' : 'translate-x-6') : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Button: Arrêter */}
        {isActive && (
          <button
            type="button"
            onClick={handleStop}
            className="w-full py-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-rose-600/25 transition-all active:scale-[0.98] cursor-pointer"
          >
            {t('passenger', 'stop')}
          </button>
        )}

        {/* Optional Install Button for returning users */}
        {!isStandalone && (
          <button
            type="button"
            onClick={triggerPWAInstall}
            className="w-full py-2.5 px-4 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/25 text-[#D97706] font-extrabold text-xs rounded-xl border border-amber-500/30 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
          >
            <span className="text-sm">📲</span>
            <span>{t('pwa', 'installApp')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
