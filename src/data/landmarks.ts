import { City, Landmark } from '../types';

export const MOROCCAN_CITIES: City[] = [
  {
    id: 'rabat',
    name: 'Rabat (Hoofdstad)',
    lat: 34.0209,
    lng: -6.8416,
    zoom: 14,
    petitTaxiColor: 'Rood (Rouge)',
    petitTaxiHex: '#dc2626' // Red taxis in Rabat
  },
  {
    id: 'casablanca',
    name: 'Casablanca',
    lat: 33.5731,
    lng: -7.5898,
    zoom: 13,
    petitTaxiColor: 'Rood (Rouge)',
    petitTaxiHex: '#dc2626'
  },
  {
    id: 'marrakech',
    name: 'Marrakech',
    lat: 31.6295,
    lng: -7.9811,
    zoom: 13,
    petitTaxiColor: 'Oker geel (Ocre)',
    petitTaxiHex: '#d97706'
  },
  {
    id: 'tangier',
    name: 'Tanger (Tangier)',
    lat: 35.7596,
    lng: -5.8340,
    zoom: 13,
    petitTaxiColor: 'Lichtblauw (Bleu)',
    petitTaxiHex: '#0284c7'
  },
  {
    id: 'fes',
    name: 'Fès',
    lat: 34.0331,
    lng: -5.0003,
    zoom: 13,
    petitTaxiColor: 'Rood (Rouge)',
    petitTaxiHex: '#dc2626'
  },
  {
    id: 'agadir',
    name: 'Agadir',
    lat: 30.4278,
    lng: -9.5981,
    zoom: 13,
    petitTaxiColor: 'Sinaasappel oranje (Orange)',
    petitTaxiHex: '#ea580c'
  }
];

export const RABAT_LANDMARKS: Landmark[] = [
  {
    id: 'gare-rabat-ville',
    name: 'Gare Rabat Ville (Treinstation)',
    city: 'rabat',
    lat: 34.0175,
    lng: -6.8368,
    category: 'station'
  },
  {
    id: 'tour-hassan',
    name: 'Tour Hassan & Mausoleum',
    city: 'rabat',
    lat: 34.0242,
    lng: -6.8227,
    category: 'monument'
  },
  {
    id: 'bab-el-had',
    name: 'Bab El Had (Medina Ingang)',
    city: 'rabat',
    lat: 34.0205,
    lng: -6.8385,
    category: 'monument'
  },
  {
    id: 'kasbah-oudayas',
    name: 'Kasbah des Oudayas',
    city: 'rabat',
    lat: 34.0318,
    lng: -6.8358,
    category: 'monument'
  },
  {
    id: 'agdal-center',
    name: 'Agdal (Avenue Fal Ould Oumeir)',
    city: 'rabat',
    lat: 34.0028,
    lng: -6.8482,
    category: 'neighborhood'
  },
  {
    id: 'gare-rabat-agdal',
    name: 'Gare Rabat Agdal (TGV Station)',
    city: 'rabat',
    lat: 33.9989,
    lng: -6.8561,
    category: 'station'
  },
  {
    id: 'hay-riad',
    name: 'Hay Riad (Mahaj Riad)',
    city: 'rabat',
    lat: 33.9558,
    lng: -6.8835,
    category: 'neighborhood'
  },
  {
    id: 'megamall',
    name: 'Mega Mall Rabat',
    city: 'rabat',
    lat: 33.9682,
    lng: -6.8286,
    category: 'shopping'
  },
  {
    id: 'rabat-salé-airport',
    name: 'Luchthaven Rabat-Salé (RBA)',
    city: 'rabat',
    lat: 34.0515,
    lng: -6.7516,
    category: 'airport'
  }
];
