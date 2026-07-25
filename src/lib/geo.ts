import L from 'leaflet';
import { TaxiType } from '../types';

/**
 * Haversine formula to calculate distance between two coordinates in kilometers
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10;
}

/**
 * Calculates estimated fare in Dirham (MAD)
 */
export function calculateEstimatedFare(distanceKm: number, taxiType: TaxiType, nightMode: boolean = false): number {
  if (taxiType === 'PETIT_TAXI') {
    // Moroccan Petit Taxi Fare standard:
    // Base prise en charge ~7.50 MAD
    // ~2.5 MAD per km
    // Night rate +50% after 20:00
    const base = 7.5;
    const perKm = 2.5;
    let total = base + (distanceKm * perKm);
    if (nightMode) total *= 1.5;
    return Math.max(8.0, Math.round(total));
  } else {
    // Grand Taxi standard shared seat or line rate:
    // ~12.0 MAD base + ~3.5 MAD per km
    const base = 12.0;
    const perKm = 3.5;
    let total = base + (distanceKm * perKm);
    if (nightMode) total *= 1.3;
    return Math.max(15.0, Math.round(total));
  }
}

/**
 * Creates custom HTML DivIcons for Leaflet
 */
export function createPassengerIcon(status: string = 'PENDING') {
  const isPending = status === 'PENDING';
  const color = isPending ? '#22c55e' : '#3b82f6';
  
  return L.divIcon({
    className: 'custom-passenger-pin',
    html: `
      <div class="relative flex items-center justify-center w-10 h-10">
        <span class="absolute w-10 h-10 rounded-full animate-ping-slow" style="background-color: ${color}; opacity: 0.4;"></span>
        <div class="relative z-10 flex items-center justify-center w-9 h-9 rounded-full bg-slate-900 border-2 border-white shadow-xl text-white font-bold text-base">
          🙋‍♂️
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export function createDestinationIcon() {
  return L.divIcon({
    className: 'custom-destination-pin',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8">
        <div class="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-red-600 border-2 border-white shadow-lg text-white font-bold text-xs">
          🏁
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export function createDriverIcon(taxiType: TaxiType, colorHex: string = '#dc2626') {
  const isPetit = taxiType === 'PETIT_TAXI';
  const label = isPetit ? 'Petit Taxi' : 'Grand Taxi';
  const bg = isPetit ? colorHex : '#0284c7'; // Red for Petit Taxi Rabat, Sky blue for Grand Taxi
  
  return L.divIcon({
    className: 'custom-taxi-pin',
    html: `
      <div class="relative flex flex-col items-center justify-center">
        <div class="px-2 py-1 rounded-md text-[10px] font-black uppercase text-white shadow-md flex items-center gap-1 border border-white/40" style="background-color: ${bg}">
          <span>🚖</span>
          <span>${label}</span>
        </div>
        <div class="w-2 h-2 bg-slate-900 border border-white rotate-45 -mt-1 shadow-md"></div>
      </div>
    `,
    iconSize: [80, 36],
    iconAnchor: [40, 32],
  });
}

export function createLandmarkIcon() {
  return L.divIcon({
    className: 'custom-landmark-pin',
    html: `
      <div class="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-300 text-xs shadow">
        🏛️
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/**
 * Web Audio API synthesizer for sound notification on new request or acceptance
 */
export function playSoundAlert(type: 'NEW_REQUEST' | 'ACCEPTED' | 'ARRIVED') {
  if (typeof window === 'undefined') return;
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'NEW_REQUEST') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'ACCEPTED') {
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.1); // C#5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.2); // E5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch (e) {
    console.log('Audio alert playback failed or muted', e);
  }
}
