import { CityZone } from '../types';

export const CITY_ZONES: CityZone[] = [
  {
    id: 'rabat-medina-ocean',
    name: 'Medina + Océan',
    centerLat: 34.0259072,
    centerLng: -6.8364399,
    city: 'Rabat',
  },
  {
    id: 'rabat-hassan',
    name: 'Hassan (centrum)',
    centerLat: 34.02204,
    centerLng: -6.8380176,
    city: 'Rabat',
  },
  {
    id: 'rabat-agdal-ryad',
    name: 'Agdal-Ryad',
    centerLat: 33.9933499,
    centerLng: -6.8485009,
    city: 'Rabat',
  },
  {
    id: 'rabat-hay-riad',
    name: 'Hay Riad',
    centerLat: 33.9559463,
    centerLng: -6.8726295,
    city: 'Rabat',
  },
  {
    id: 'rabat-souissi',
    name: 'Souissi',
    centerLat: 33.9799302,
    centerLng: -6.84046,
    city: 'Rabat',
  },
  {
    id: 'rabat-yacoub-el-mansour',
    name: 'Yacoub El Mansour',
    centerLat: 33.9796455,
    centerLng: -6.8960959,
    city: 'Rabat',
  },
  {
    id: 'rabat-youssoufia-diour-jamaa',
    name: 'Youssoufia / Diour Jamaa',
    centerLat: 33.99747,
    centerLng: -6.8146774,
    city: 'Rabat',
  },
];

/**
 * Returns zones for a given city, falling back to Rabat if no zones match.
 */
export function getZonesForCity(cityName: string = 'Rabat'): CityZone[] {
  if (!cityName) return CITY_ZONES.filter((z) => z.city.toLowerCase() === 'rabat');
  
  const normCity = cityName.trim().toLowerCase();
  const matched = CITY_ZONES.filter(
    (z) => z.city.toLowerCase() === normCity
  );
  
  if (matched.length > 0) {
    return matched;
  }
  
  // Default fallback to Rabat
  return CITY_ZONES.filter((z) => z.city.toLowerCase() === 'rabat');
}
