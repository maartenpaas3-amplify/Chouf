import { SupabasePin, getDistanceMeters } from './supabase';
import { fetchORSDirections } from './ors';

export interface SuperModeCandidate {
  passenger: SupabasePin;
  detourMinutes: number;
  detourMeters: number;
  colorCategory: 'green' | 'orange' | 'red'; // green <= 3m, orange 3-7m, red > 7m
  pickupDistanceMeters: number;
  dropoffDistanceMeters?: number;
  totalDurationSeconds: number;
  routeGeometry?: [number, number][];
}

/**
 * Calculates perpendicular distance from point P to line segment AB in meters.
 */
export function getPerpendicularDistanceMeters(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number
): number {
  const rad = Math.PI / 180;
  const avgLat = ((aLat + bLat) / 2) * rad;
  const cosLat = Math.cos(avgLat);

  const ax = aLng * cosLat * 111320;
  const ay = aLat * 111320;
  const bx = bLng * cosLat * 111320;
  const by = bLat * 111320;
  const px = pLng * cosLat * 111320;
  const py = pLat * 111320;

  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;

  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let t = (wx * vx + wy * vy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * vx;
  const projY = ay + t * vy;

  const dx = px - projX;
  const dy = py - projY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Evaluates candidate 2nd passengers for Super Mode detour calculation
 */
export async function calculateSuperModeCandidates(
  driverLoc: { lat: number; lng: number },
  dest1Loc: { lat: number; lng: number },
  activePins: SupabasePin[]
): Promise<SuperModeCandidate[]> {
  if (!activePins || activePins.length === 0) return [];

  // 1. Pre-filter candidates within 3.5km of driver or segment
  const candidatesWithOffset = activePins.map((pin) => {
    const perpDist = getPerpendicularDistanceMeters(
      pin.lat, pin.lng,
      driverLoc.lat, driverLoc.lng,
      dest1Loc.lat, dest1Loc.lng
    );
    const pickupDist = getDistanceMeters(driverLoc.lat, driverLoc.lng, pin.lat, pin.lng);
    return { pin, perpDist, pickupDist, scoreOffset: perpDist * 0.7 + pickupDist * 0.3 };
  });

  const validCandidates = candidatesWithOffset
    .filter((c) => c.perpDist <= 3500 && c.pickupDist <= 3500)
    .sort((a, b) => a.scoreOffset - b.scoreOffset)
    .slice(0, 5);

  if (validCandidates.length === 0) return [];

  // 2. Fetch baseline direct route: Driver -> Dest1
  const directRoute = await fetchORSDirections([driverLoc, dest1Loc]);
  const baselineDurationSec = directRoute?.durationSeconds ?? 
    (getDistanceMeters(driverLoc.lat, driverLoc.lng, dest1Loc.lat, dest1Loc.lng) / 500) * 60;
  const baselineDistMeters = directRoute?.distanceMeters ??
    getDistanceMeters(driverLoc.lat, driverLoc.lng, dest1Loc.lat, dest1Loc.lng);

  // 3. Evaluate combined routes for shortlisted candidates
  const candidateResults: SuperModeCandidate[] = [];

  for (const { pin, pickupDist } of validCandidates) {
    const waypoints: { lat: number; lng: number }[] = [driverLoc, { lat: pin.lat, lng: pin.lng }];

    if (pin.bestemming_lat && pin.bestemming_lng) {
      const distPickToCandDest = getDistanceMeters(pin.lat, pin.lng, pin.bestemming_lat, pin.bestemming_lng);
      const distPickToDest1 = getDistanceMeters(pin.lat, pin.lng, dest1Loc.lat, dest1Loc.lng);

      if (distPickToCandDest < distPickToDest1) {
        waypoints.push({ lat: pin.bestemming_lat, lng: pin.bestemming_lng });
        waypoints.push(dest1Loc);
      } else {
        waypoints.push(dest1Loc);
        waypoints.push({ lat: pin.bestemming_lat, lng: pin.bestemming_lng });
      }
    } else {
      waypoints.push(dest1Loc);
    }

    const combRoute = await fetchORSDirections(waypoints);

    let durationSec = combRoute?.durationSeconds;
    let distanceMet = combRoute?.distanceMeters;

    if (!durationSec) {
      let totalDist = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        totalDist += getDistanceMeters(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng);
      }
      distanceMet = totalDist;
      durationSec = (totalDist / 500) * 60;
    }

    const detourSec = Math.max(0, durationSec - baselineDurationSec);
    const detourMeters = Math.max(0, (distanceMet || 0) - baselineDistMeters);
    const detourMin = Math.max(0, Math.round(detourSec / 60));

    let colorCat: 'green' | 'orange' | 'red' = 'green';
    if (detourMin <= 3) {
      colorCat = 'green';
    } else if (detourMin <= 7) {
      colorCat = 'orange';
    } else {
      colorCat = 'red';
    }

    candidateResults.push({
      passenger: pin,
      detourMinutes: detourMin,
      detourMeters,
      colorCategory: colorCat,
      pickupDistanceMeters: pickupDist,
      dropoffDistanceMeters: pin.bestemming_lat && pin.bestemming_lng ? getDistanceMeters(pin.lat, pin.lng, pin.bestemming_lat, pin.bestemming_lng) : undefined,
      totalDurationSeconds: durationSec,
      routeGeometry: combRoute?.geometry,
    });
  }

  candidateResults.sort((a, b) => a.detourMinutes - b.detourMinutes);

  return candidateResults;
}
