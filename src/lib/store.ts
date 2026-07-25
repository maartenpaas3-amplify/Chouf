import { DriverState, RideRequest, RideStatus, Location, TaxiType } from '../types';

const STORAGE_KEY = 'chouf_ride_requests_v1';
const DRIVER_KEY = 'chouf_driver_state_v1';
const SYNC_CHANNEL = 'chouf_taxi_channel';

// Default initial mock requests in Rabat so the app displays active map markers immediately upon open!
const INITIAL_MOCK_REQUESTS: RideRequest[] = [
  {
    id: 'req-rabat-1',
    passengerName: 'Youssef (Avenue Fal Ould Oumeir)',
    passengerPhone: '+212 661 234567',
    pickup: {
      lat: 34.0028,
      lng: -6.8482,
      name: 'Agdal - Av. Fal Ould Oumeir'
    },
    destination: {
      lat: 34.0175,
      lng: -6.8368,
      name: 'Gare Rabat Ville'
    },
    destinationNote: 'Naar Treinstation Rabat Ville',
    taxiType: 'PETIT_TAXI',
    passengerCount: 2,
    status: 'PENDING',
    createdAt: Date.now() - 1000 * 60 * 3, // 3 minutes ago
    estimatedFareMad: 18,
    distanceKm: 2.4
  },
  {
    id: 'req-rabat-2',
    passengerName: 'Fatima Zohra (Bab El Had)',
    passengerPhone: '+212 663 987654',
    pickup: {
      lat: 34.0205,
      lng: -6.8385,
      name: 'Bab El Had (Medina)'
    },
    destination: {
      lat: 33.9989,
      lng: -6.8561,
      name: 'Gare Rabat Agdal'
    },
    destinationNote: 'Aan de hoofdingang van Bab El Had',
    taxiType: 'PETIT_TAXI',
    passengerCount: 1,
    status: 'PENDING',
    createdAt: Date.now() - 1000 * 60 * 1, // 1 minute ago
    estimatedFareMad: 22,
    distanceKm: 3.1
  }
];

class TaxiStore {
  private listeners: Set<() => void> = new Set();
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(SYNC_CHANNEL);
      this.channel.onmessage = () => {
        this.notifyListeners();
      };
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY || e.key === DRIVER_KEY) {
          this.notifyListeners();
        }
      });
    }

    // Initialize mock data if empty
    if (typeof window !== 'undefined' && !localStorage.getItem(STORAGE_KEY)) {
      this.saveRequests(INITIAL_MOCK_REQUESTS);
    }
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(fn => fn());
  }

  public getRequests(): RideRequest[] {
    if (typeof window === 'undefined') return INITIAL_MOCK_REQUESTS;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : INITIAL_MOCK_REQUESTS;
    } catch {
      return INITIAL_MOCK_REQUESTS;
    }
  }

  public saveRequests(requests: RideRequest[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
      if (this.channel) this.channel.postMessage({ type: 'UPDATE' });
      this.notifyListeners();
    } catch (e) {
      console.error('Failed to save requests', e);
    }
  }

  public addRequest(req: Omit<RideRequest, 'createdAt' | 'status'> & { id?: string }): RideRequest {
    const newRequest: RideRequest = {
      ...req,
      id: req.id || ('req-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6)),
      createdAt: Date.now(),
      status: 'PENDING'
    };

    const current = this.getRequests();
    const updated = [newRequest, ...current];
    this.saveRequests(updated);
    return newRequest;
  }

  public updateRequestStatus(
    id: string,
    status: RideStatus,
    driverInfo?: {
      driverId?: string;
      driverName?: string;
      driverPhone?: string;
      driverLocation?: Location;
      driverTaxiType?: TaxiType;
    }
  ): void {
    const current = this.getRequests();
    const updated = current.map(req => {
      if (req.id === id) {
        return {
          ...req,
          status,
          ...(driverInfo || {})
        };
      }
      return req;
    });
    this.saveRequests(updated);
  }

  public updateDriverLocation(requestId: string, location: Location): void {
    const current = this.getRequests();
    const updated = current.map(req => {
      if (req.id === requestId) {
        return {
          ...req,
          driverLocation: location
        };
      }
      return req;
    });
    this.saveRequests(updated);
  }

  public cancelRequest(id: string): void {
    this.updateRequestStatus(id, 'CANCELLED');
  }

  public clearAllRequests(): void {
    this.saveRequests([]);
  }

  public resetToMockData(): void {
    this.saveRequests(INITIAL_MOCK_REQUESTS);
  }

  public getDriverState(): DriverState {
    const defaultState: DriverState = {
      id: 'driver-rabat-01',
      name: 'Chauffeur Mohammed',
      phone: '+212 661 889900',
      isOnline: true,
      taxiType: 'PETIT_TAXI',
      location: {
        lat: 34.0150,
        lng: -6.8320,
        name: 'Centrum Rabat'
      },
      city: 'rabat'
    };

    if (typeof window === 'undefined') return defaultState;
    try {
      const data = localStorage.getItem(DRIVER_KEY);
      return data ? JSON.parse(data) : defaultState;
    } catch {
      return defaultState;
    }
  }

  public saveDriverState(state: DriverState): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(DRIVER_KEY, JSON.stringify(state));
      if (this.channel) this.channel.postMessage({ type: 'DRIVER_UPDATE' });
      this.notifyListeners();
    } catch (e) {
      console.error('Failed to save driver state', e);
    }
  }
}

export const taxiStore = new TaxiStore();
