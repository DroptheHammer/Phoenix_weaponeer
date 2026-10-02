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
  /** The weapon row's name for a store the table knows ("Mk-82 LDGP"), else free text, or the DCS name of an unrecognised store. */
  weaponType: string;
  quantity: number;
  /**
   * The weapon row this line is, when known (an import, or a pick in the loadout
   * editor). Wins over the name; older saves have only the name, which still matches.
   */
  weaponId?: string;
}
