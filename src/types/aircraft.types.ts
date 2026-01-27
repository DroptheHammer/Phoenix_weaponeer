export interface Aircraft {
  id: string;
  name: string; // "F-16C Viper"
  dcsModuleName: string; // "F-16C_50"

  // Performance envelope
  maxSpeed_ktas: number;
  stallSpeed_ktas: number;
  maxG: number;
  serviceCeiling_ft: number;

  // Stations
  stations: WeaponStation[];

  // Available delivery modes
  deliveryModes: DeliveryMode[];

  // Kneeboard customization
  kneeboardPath: string; // Subfolder in DCS kneeboard directory
}

export interface WeaponStation {
  station: number;
  name: string; // "Sta 3 (Left Wing)"
  compatibleWeapons: string[]; // List of weapon IDs
  isPylon: boolean;
}

export type DeliveryMode =
  | 'CCIP' // Continuously Computed Impact Point
  | 'CCRP' // Continuously Computed Release Point
  | 'DTOS' // Dive Toss
  | 'LADD' // Low Angle Drogue Delivery
  | 'MAN' // Manual
  | 'VIS' // Visual
  | 'AUTO'; // Automatic (Hornet)
