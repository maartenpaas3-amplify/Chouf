import { SupabasePin, getDistanceMeters } from './supabase';

export interface RouteStop {
  id: string;
  type: 'pickup' | 'dropoff';
  passengerId: string;
  passengerName: string;
  isHurry: boolean;
  name: string;
  lat: number;
  lng: number;
  stepNumber: number;
}

export interface OptimizedRoute {
  passengers: SupabasePin[];
  stops: RouteStop[];
  totalDistanceMeters: number;
  detourDistanceMeters: number;
  capacityUsed: number;
  maxCapacity: number;
  score: number;
  explanation: string;
  googleMapsUrl: string;
  roadGeometry?: [number, number][];
  roadDurationSeconds?: number;
  roadDistanceMeters?: number;
  isRoadRoute?: boolean;
}

/**
 * Calculates bearing angle (0 - 360 deg) between two coordinates
 */
export function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLng = toRad(lng2 - lng1);

  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Calculates smallest angle difference between two bearings (0 - 180 deg)
 */
export function angleDifference(bearing1: number, bearing2: number): number {
  const diff = Math.abs(bearing1 - bearing2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Calculate total path length connecting an array of coordinates
 */
function calculatePathDistance(coords: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += getDistanceMeters(coords[i].lat, coords[i].lng, coords[i + 1].lat, coords[i + 1].lng);
  }
  return total;
}

/**
 * Finds optimal multi-passenger route for Petit Taxi (Max 3 passengers total)
 */
export function findOptimizedDriverRoute(
  driverLoc: { lat: number; lng: number },
  activePins: SupabasePin[],
  onboardPassengersCount: number = 0,
  lang: 'fr' | 'en' | 'ar' = 'fr'
): OptimizedRoute | null {
  const MAX_TAXI_CAPACITY = 3;
  const availableSeats = Math.max(0, MAX_TAXI_CAPACITY - onboardPassengersCount);

  if (availableSeats === 0 || activePins.length === 0) {
    return null;
  }

  // Localized words helper
  const passengerWord = lang === 'en' ? 'Passenger' : lang === 'ar' ? 'راكب' : 'Passager';
  const destWord = lang === 'en' ? 'Destination' : lang === 'ar' ? 'الوجهة' : 'Destination';

  // Filter valid candidate pins within 2km
  const candidatePins = activePins.filter((pin) => {
    const dist = getDistanceMeters(driverLoc.lat, driverLoc.lng, pin.lat, pin.lng);
    return dist <= 2500; // max 2.5km distance
  });

  if (candidatePins.length === 0) {
    return null;
  }

  let bestRoute: OptimizedRoute | null = null;
  let highestScore = -Infinity;

  // Generate subsets of size 1, up to availableSeats (max 3)
  const maxToPick = Math.min(candidatePins.length, availableSeats);

  // Helper to evaluate a specific chosen combination of passengers
  const evaluateCombination = (chosenPins: SupabasePin[]) => {
    // For these chosen pins, we need a valid stop sequence:
    // Every pickup MUST occur before its dropoff.
    // Build array of required stops:
    interface RawStop {
      passengerId: string;
      type: 'pickup' | 'dropoff';
      name: string;
      lat: number;
      lng: number;
      isHurry: boolean;
    }

    const pickups: RawStop[] = chosenPins.map((pin) => ({
      passengerId: pin.id,
      type: 'pickup',
      name: `${passengerWord} (${(getDistanceMeters(driverLoc.lat, driverLoc.lng, pin.lat, pin.lng) / 1000).toFixed(1)} km)`,
      lat: pin.lat,
      lng: pin.lng,
      isHurry: !!pin.haast,
    }));

    const dropoffs: RawStop[] = chosenPins
      .filter((pin) => pin.bestemming_lat && pin.bestemming_lng)
      .map((pin) => ({
        passengerId: pin.id,
        type: 'dropoff',
        name: pin.bestemming_tekst || destWord,
        lat: pin.bestemming_lat!,
        lng: pin.bestemming_lng!,
        isHurry: !!pin.haast,
      }));

    // Find valid permutations of stops where pickup comes before dropoff for each passenger
    const allStopsToSequence = [...pickups, ...dropoffs];

    // Simple brute-force permutation solver for small sets (<= 6 items)
    const validSequences: RawStop[][] = [];

    const permute = (currentSeq: RawStop[], remaining: RawStop[]) => {
      if (remaining.length === 0) {
        validSequences.push(currentSeq);
        return;
      }

      for (let i = 0; i < remaining.length; i++) {
        const nextStop = remaining[i];
        
        // Rule: If nextStop is a dropoff, its corresponding pickup MUST already be in currentSeq
        if (nextStop.type === 'dropoff') {
          const hasPickedUp = currentSeq.some(
            (s) => s.type === 'pickup' && s.passengerId === nextStop.passengerId
          );
          if (!hasPickedUp) continue; // Skip invalid sequence
        }

        const nextRemaining = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
        permute([...currentSeq, nextStop], nextRemaining);
      }
    };

    permute([], allStopsToSequence);

    // Evaluate each valid sequence
    for (const seq of validSequences) {
      const fullPathCoords = [driverLoc, ...seq.map((s) => ({ lat: s.lat, lng: s.lng }))];
      const totalDist = calculatePathDistance(fullPathCoords);

      // Compare with direct route for the first passenger
      const firstPin = chosenPins[0];
      const directDistFirst =
        getDistanceMeters(driverLoc.lat, driverLoc.lng, firstPin.lat, firstPin.lng) +
        (firstPin.bestemming_lat
          ? getDistanceMeters(firstPin.lat, firstPin.lng, firstPin.bestemming_lat, firstPin.bestemming_lng)
          : 0);

      const detourDist = Math.max(0, totalDist - directDistFirst);

      // Check directional compatibility if there are multiple passengers with destinations
      let directionBonus = 0;
      if (chosenPins.length > 1) {
        const bearings: number[] = [];
        chosenPins.forEach((p) => {
          if (p.bestemming_lat && p.bestemming_lng) {
            bearings.push(calculateBearing(p.lat, p.lng, p.bestemming_lat, p.bestemming_lng));
          }
        });

        if (bearings.length >= 2) {
          const diff = angleDifference(bearings[0], bearings[1]);
          if (diff > 80) {
            // Opposite or perpendicular directions - heavy penalty
            continue;
          } else {
            directionBonus = Math.max(0, 80 - diff) * 2;
          }
        }
      }

      // Calculate score
      const totalPassengers = chosenPins.length;
      const hurryBonus = chosenPins.filter((p) => p.haast).length * 40;
      const detourKm = detourDist / 1000;

      // Reject if detour is over 3km for extra pickup
      if (chosenPins.length > 1 && detourKm > 3.0) {
        continue;
      }

      const score =
        totalPassengers * 150 +
        hurryBonus +
        directionBonus -
        detourKm * 50;

      if (score > highestScore) {
        highestScore = score;

        const formattedStops: RouteStop[] = seq.map((s, idx) => ({
          id: `${s.passengerId}_${s.type}_${idx}`,
          type: s.type,
          passengerId: s.passengerId,
          passengerName: `${passengerWord} #${s.passengerId.slice(-4)}`,
          isHurry: s.isHurry,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          stepNumber: idx + 1,
        }));

        // Build Google Maps multi-waypoint URL
        let googleMapsUrl = '';
        if (formattedStops.length > 0) {
          const originStr = `${driverLoc.lat},${driverLoc.lng}`;
          const lastStop = formattedStops[formattedStops.length - 1];
          const destStr = `${lastStop.lat},${lastStop.lng}`;

          if (formattedStops.length > 1) {
            const waypoints = formattedStops
              .slice(0, formattedStops.length - 1)
              .map((st) => `${st.lat},${st.lng}`)
              .join('|');
            googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&waypoints=${waypoints}&travelmode=driving`;
          } else {
            googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=driving`;
          }
        }

        const totalDistKm = (totalDist / 1000).toFixed(1);
        const detourKmStr = (detourDist / 1000).toFixed(1);

        let explanation = '';
        if (totalPassengers === 1) {
          if (lang === 'en') {
            explanation = `Direct passenger (${totalDistKm} km)`;
          } else if (lang === 'ar') {
            explanation = `راكب مباشر (${totalDistKm} كم)`;
          } else {
            explanation = `Passager direct (${totalDistKm} km)`;
          }
        } else {
          if (lang === 'en') {
            explanation = `Optimal shared trip: ${totalPassengers} passengers in same area (+${detourKmStr} km detour)`;
          } else if (lang === 'ar') {
            explanation = `مسار مشترك مثالي: ${totalPassengers} ركاب في نفس المنطقة (+${detourKmStr} كم انحراف)`;
          } else {
            explanation = `Trajet partagé optimal : ${totalPassengers} passagers dans le même secteur (+${detourKmStr} km détour)`;
          }
        }

        bestRoute = {
          passengers: chosenPins,
          stops: formattedStops,
          totalDistanceMeters: totalDist,
          detourDistanceMeters: detourDist,
          capacityUsed: onboardPassengersCount + totalPassengers,
          maxCapacity: MAX_TAXI_CAPACITY,
          score,
          explanation,
          googleMapsUrl,
        };
      }
    }
  };

  // Helper to generate combinations of array
  const combinations = (arr: SupabasePin[], k: number): SupabasePin[][] => {
    if (k === 1) return arr.map((x) => [x]);
    const res: SupabasePin[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const head = arr[i];
      const tailCombs = combinations(arr.slice(i + 1), k - 1);
      for (const tail of tailCombs) {
        res.push([head, ...tail]);
      }
    }
    return res;
  };

  // Evaluate 1-passenger, 2-passenger, and 3-passenger combinations
  for (let count = 1; count <= maxToPick; count++) {
    const combis = combinations(candidatePins, count);
    for (const combi of combis) {
      evaluateCombination(combi);
    }
  }

  return bestRoute;
}
