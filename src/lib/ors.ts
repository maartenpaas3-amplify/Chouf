export interface ORSRouteResult {
  geometry: [number, number][]; // Array of [lat, lng] for Leaflet polyline
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * Fetches real road navigation route using OpenRouteService API.
 * If API key is missing or request fails, returns null so caller can fallback to straight lines.
 */
export async function fetchORSDirections(
  coordinates: { lat: number; lng: number }[]
): Promise<ORSRouteResult | null> {
  if (!coordinates || coordinates.length < 2) return null;

  // Read OpenRouteService API Key from environment variable
  const apiKey = import.meta.env.VITE_OPENROUTESERVICE_API_KEY;

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    console.warn('[ORS] VITE_OPENROUTESERVICE_API_KEY is missing or empty. Falling back to straight line route.');
    return null;
  }

  const formattedCoords = coordinates.map((c) => [c.lng, c.lat]);
  console.log(`[ORS] Route request started for ${coordinates.length} coordinates:`, formattedCoords);

  try {
    const response = await fetch(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey.trim(),
        },
        body: JSON.stringify({
          coordinates: formattedCoords,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const errMsg = `HTTP ${response.status} ${response.statusText}: ${errorText}`;
      console.error(`[ORS] Route request failed: ${errMsg}. Falling back to straight line.`);
      return null;
    }

    const data = await response.json();
    const feature = data?.features?.[0];
    if (!feature || !feature.geometry || !feature.geometry.coordinates) {
      console.error('[ORS] Route request failed: Invalid or empty route geometry in response. Falling back to straight line.');
      return null;
    }

    // Convert GeoJSON [longitude, latitude] array to Leaflet [latitude, longitude] array
    const leafletCoords: [number, number][] = feature.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );

    const distanceMeters = feature.properties?.summary?.distance ?? 0;
    const durationSeconds = feature.properties?.summary?.duration ?? 0;

    console.log(`[ORS] Route request succeeded! Received ${leafletCoords.length} route points (${(distanceMeters / 1000).toFixed(1)} km).`);

    return {
      geometry: leafletCoords,
      distanceMeters,
      durationSeconds,
    };
  } catch (err: any) {
    console.error(`[ORS] Route request failed: ${err?.message || err}. Falling back to straight line.`);
    return null;
  }
}

/**
 * Utility to format seconds into readable duration (e.g., "12 min", "1 h 15 min")
 */
export function formatDuration(seconds: number, lang: 'fr' | 'en' | 'ar' = 'fr'): string {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 1) {
    return lang === 'en' ? '< 1 min' : lang === 'ar' ? 'أقل من دقيقة' : '< 1 min';
  }
  if (totalMin < 60) {
    return `${totalMin} min`;
  }
  const hours = Math.floor(totalMin / 60);
  const remainingMin = totalMin % 60;
  if (remainingMin === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${remainingMin} min`;
}

