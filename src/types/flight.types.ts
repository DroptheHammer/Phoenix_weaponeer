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
  weaponType: string; // e.g. "Mk-82", "GBU-12", free text
  quantity: number;
}
