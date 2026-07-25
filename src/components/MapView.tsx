import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Location, RideRequest, TaxiType, Landmark } from '../types';
import { createPassengerIcon, createDestinationIcon, createDriverIcon, createLandmarkIcon } from '../lib/geo';
import { RABAT_LANDMARKS } from '../data/landmarks';

interface MapViewProps {
  center: { lat: number; lng: number };
  zoom?: number;
  requests?: RideRequest[];
  selectedPickup?: Location | null;
  selectedDestination?: Location | null;
  driverLocation?: Location | null;
  driverTaxiType?: TaxiType;
  cityTaxiColorHex?: string;
  onMapClick?: (loc: Location) => void;
  onSelectLandmark?: (landmark: Landmark) => void;
  showLandmarks?: boolean;
  activeRideId?: string;
}

export const MapView: React.FC<MapViewProps> = ({
  center,
  zoom = 14,
  requests = [],
  selectedPickup,
  selectedDestination,
  driverLocation,
  driverTaxiType = 'PETIT_TAXI',
  cityTaxiColorHex = '#dc2626',
  onMapClick,
  onSelectLandmark,
  showLandmarks = true,
  activeRideId
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [center.lat, center.lng],
        zoom: zoom,
        zoomControl: false
      });

      // Add OpenStreetMap Tile Layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }).addTo(map);

      // Add Zoom Control to Top Right
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Add Marker Layer Group
      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;

      mapRef.current = map;
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Center map when center or zoom prop changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([center.lat, center.lng], zoom, { animate: true });
    }
  }, [center.lat, center.lng, zoom]);

  // 3. Handle Map Click callback
  useEffect(() => {
    if (!mapRef.current) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (onMapClick) {
        onMapClick({
          lat: Math.round(e.latlng.lat * 10000) / 10000,
          lng: Math.round(e.latlng.lng * 10000) / 10000,
          name: `Geselecteerde plek (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`
        });
      }
    };

    mapRef.current.on('click', handleMapClick);
    return () => {
      if (mapRef.current) {
        mapRef.current.off('click', handleMapClick);
      }
    };
  }, [onMapClick]);

  // 4. Render Markers and Route Polylines
  useEffect(() => {
    if (!mapRef.current || !markersGroupRef.current) return;

    const group = markersGroupRef.current;
    group.clearLayers();

    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    // A. Render Rabat Landmarks
    if (showLandmarks) {
      RABAT_LANDMARKS.forEach(lm => {
        const marker = L.marker([lm.lat, lm.lng], {
          icon: createLandmarkIcon()
        });

        const popupContent = document.createElement('div');
        popupContent.className = 'text-center p-1';
        popupContent.innerHTML = `
          <div class="font-bold text-amber-400 text-xs">${lm.name}</div>
          <div class="text-[11px] text-slate-300 mt-1">Populaire taxi-stopplaats</div>
          <button class="mt-2 w-full px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded text-xs shadow transition">
            Kies als ophaalpunt
          </button>
        `;

        popupContent.querySelector('button')?.addEventListener('click', () => {
          if (onSelectLandmark) onSelectLandmark(lm);
          marker.closePopup();
        });

        marker.bindPopup(popupContent);
        group.addLayer(marker);
      });
    }

    // B. Render Selected Pickup (Passenger formulating request)
    if (selectedPickup) {
      const pickupMarker = L.marker([selectedPickup.lat, selectedPickup.lng], {
        icon: createPassengerIcon('PENDING')
      }).bindPopup(`
        <div class="text-xs font-bold text-emerald-400">📍 Jouw Ophaalpunt</div>
        <div class="text-[11px] text-slate-200 mt-0.5">${selectedPickup.name || 'Gekozen locatie'}</div>
      `);
      group.addLayer(pickupMarker);
    }

    // C. Render Selected Destination
    if (selectedDestination) {
      const destMarker = L.marker([selectedDestination.lat, selectedDestination.lng], {
        icon: createDestinationIcon()
      }).bindPopup(`
        <div class="text-xs font-bold text-red-400">🏁 Bestemming</div>
        <div class="text-[11px] text-slate-200 mt-0.5">${selectedDestination.name || 'Gekozen bestemming'}</div>
      `);
      group.addLayer(destMarker);
    }

    // D. Render Active Ride Requests
    requests.forEach(req => {
      // Pickup marker
      const isCurrentActive = activeRideId && req.id === activeRideId;
      const passengerMarker = L.marker([req.pickup.lat, req.pickup.lng], {
        icon: createPassengerIcon(req.status)
      });

      const popupContent = `
        <div class="text-xs space-y-1">
          <div class="font-bold text-amber-400 flex items-center justify-between">
            <span>${req.passengerName}</span>
            <span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
              ${req.taxiType === 'PETIT_TAXI' ? 'Petit Taxi' : 'Grand Taxi'}
            </span>
          </div>
          <div class="text-slate-300 text-[11px]">📍 ${req.pickup.name || 'Ophaalpunt'}</div>
          ${req.destinationNote ? `<div class="text-slate-400 italic text-[10px]">💬 "${req.destinationNote}"</div>` : ''}
          <div class="text-emerald-400 font-bold text-[11px] pt-1">
            Est. Ritprijs: ~${req.estimatedFareMad} MAD (${req.passengerCount} pers.)
          </div>
        </div>
      `;

      passengerMarker.bindPopup(popupContent);
      group.addLayer(passengerMarker);

      // Driver marker if accepted
      if (req.driverLocation && req.status !== 'COMPLETED' && req.status !== 'CANCELLED') {
        const dMarker = L.marker([req.driverLocation.lat, req.driverLocation.lng], {
          icon: createDriverIcon((req.driverTaxiType as TaxiType) || 'PETIT_TAXI', cityTaxiColorHex)
        }).bindPopup(`
          <div class="text-xs font-bold text-amber-400">🚖 ${req.driverName || 'Taxichauffeur'}</div>
          <div class="text-[11px] text-emerald-400 mt-0.5">Status: ${req.status}</div>
        `);
        group.addLayer(dMarker);

        // Draw connecting route polyline
        if (isCurrentActive || requests.length === 1) {
          const latlngs: L.LatLngExpression[] = [
            [req.driverLocation.lat, req.driverLocation.lng],
            [req.pickup.lat, req.pickup.lng]
          ];
          if (req.destination) {
            latlngs.push([req.destination.lat, req.destination.lng]);
          }

          routeLineRef.current = L.polyline(latlngs, {
            color: '#3b82f6',
            weight: 4,
            opacity: 0.8,
            dashArray: '8, 8'
          }).addTo(mapRef.current);
        }
      }
    });

    // E. Render standalone driver location if provided
    if (driverLocation && !requests.some(r => r.driverLocation)) {
      const standaloneDriverMarker = L.marker([driverLocation.lat, driverLocation.lng], {
        icon: createDriverIcon(driverTaxiType as TaxiType, cityTaxiColorHex)
      }).bindPopup(`
        <div class="text-xs font-bold text-amber-400">🚖 Jouw Taxi (Chauffeur)</div>
        <div class="text-[11px] text-slate-300">Actief in Rabat</div>
      `);
      group.addLayer(standaloneDriverMarker);
    }

  }, [requests, selectedPickup, selectedDestination, driverLocation, driverTaxiType, cityTaxiColorHex, showLandmarks, activeRideId, onSelectLandmark]);

  // Handle Geolocation Button click
  const handleLocateUser = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userLoc = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            name: 'Mijn Huidige Locatie'
          };
          if (mapRef.current) {
            mapRef.current.setView([userLoc.lat, userLoc.lng], 16, { animate: true });
          }
          if (onMapClick) {
            onMapClick(userLoc);
          }
        },
        (err) => {
          alert('Kon GPS-locatie niet ophalen. Controleer uw browserinstellingen.');
          console.warn('Geolocation error', err);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      alert('Geolocatie wordt niet ondersteund door deze browser.');
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Leaflet Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Locate Me Floating Button */}
      <button
        onClick={handleLocateUser}
        title="Mijn GPS-locatie"
        className="absolute bottom-6 right-4 z-20 flex items-center gap-1.5 px-3 py-2 bg-slate-900/90 hover:bg-slate-800 text-amber-400 font-semibold text-xs rounded-full border border-slate-700 shadow-xl backdrop-blur-md active:scale-95 transition"
      >
        <span>🎯</span>
        <span>Mijn Locatie</span>
      </button>

      {/* Map Hint Tag */}
      <div className="absolute top-3 left-3 z-20 px-2.5 py-1 bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-lg text-[11px] text-slate-300 shadow flex items-center gap-1.5 pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>Klik op de kaart om een punt te kiezen</span>
      </div>
    </div>
  );
};
