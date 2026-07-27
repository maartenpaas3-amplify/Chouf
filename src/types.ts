export type TaxiType = 'PETIT_TAXI' | 'GRAND_TAXI';

export type RideStatus = 'PENDING' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Location {
  lat: number;
  lng: number;
  name?: string;
}

export interface Landmark {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  category: 'station' | 'monument' | 'neighborhood' | 'airport' | 'shopping';
}

export interface City {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  petitTaxiColor: string; // e.g. "red" for Rabat, "blue" for Tangier, "yellow" for Marrakech
  petitTaxiHex: string;
}

export interface RideRequest {
  id: string;
  passengerName: string;
  passengerPhone?: string;
  pickup: Location;
  destination?: Location;
  destinationNote?: string;
  taxiType: TaxiType;
  passengerCount: number;
  status: RideStatus;
  createdAt: number;
  driverId?: string;
  driverLocation?: Location;
  driverName?: string;
  driverPhone?: string;
  driverTaxiType?: TaxiType;
  estimatedFareMad: number;
  distanceKm: number;
}

export interface DriverState {
  id: string;
  name: string;
  phone: string;
  isOnline: boolean;
  taxiType: TaxiType;
  location: Location;
  city: string;
}

export interface CityZone {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  city: string;
}

export interface ActiveTripDestination {
  zoneId: string;
  zoneName: string;
  centerLat: number;
  centerLng: number;
  exactLat: number;
  exactLng: number;
  isCustomPinSet: boolean;
  selectedAt: number;
  hasPassengerOnboard: boolean;
}

