export interface FlightMember {
  id: string;
  callsign: string; // "Viper 1"
  position: 1 | 2 | 3 | 4;
  role: FlightRole;

  aircraftId: string; // Reference to Aircraft
  loadout: LoadoutItem[];

  pilotName?: string; // Optional real name
}

export type FlightRole = 'flight_lead' | 'element_lead' | 'wingman';

export interface LoadoutItem {
  station: number;
  weaponId: string;
  quantity: number;
  fuzeId?: string;
}
