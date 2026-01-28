# DCS Attack Planner - Architecture Document

## 1. System Overview

### 1.1 Purpose
A desktop application for tactical mission planning in DCS World, focused on:
- Planning attack runs against defended targets
- Calculating employment parameters for various attack profiles
- Generating pilot briefing cards (kneeboards) with actionable data

### 1.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         TAURI APP                               │
├─────────────────────────────────────────────────────────────────┤
│  FRONTEND (React + TypeScript)                                  │
│  ├── Mission Manager (create/load/save missions)                │
│  ├── Waypoint Editor (import/edit steerpoints)                  │
│  ├── Threat Editor (place threats on map)                       │
│  ├── Attack Planner (assign attacks, set parameters)            │
│  ├── Flight Roster (manage flight members, loadouts)            │
│  ├── Map View (Leaflet - visualize everything)                  │
│  └── Kneeboard Generator (preview and export cards)             │
├─────────────────────────────────────────────────────────────────┤
│  BACKEND (Rust via Tauri Commands)                              │
│  ├── File I/O (save/load mission JSON files)                    │
│  ├── Threat Database (SQLite - built-in threat library)         │
│  ├── Weapon Database (SQLite - aircraft loadout options)        │
│  ├── .miz Parser (extract DCS mission data)                     │
│  ├── Attack Calculators (release params, threat exposure)       │
│  └── Kneeboard Renderer (PNG generation)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Models

### 2.1 Mission (Root Container)

```typescript
interface Mission {
  id: string;                      // UUID
  name: string;
  date: string;                    // Mission date (YYYY-MM-DD)
  theater: Theater;
  bullseye: Coordinates;           // Reference point for bullseye calls
  
  waypoints: Waypoint[];
  threats: ThreatInstance[];
  flight: FlightMember[];
  attacks: Attack[];
  
  notes: string;                   // General mission notes
  createdAt: string;               // ISO timestamp
  updatedAt: string;
}

type Theater = 
  | "caucasus"
  | "persian_gulf"
  | "syria"
  | "nevada"
  | "normandy"
  | "channel"
  | "south_atlantic"
  | "sinai"
  | "kola";
```

### 2.2 Waypoints

```typescript
interface Waypoint {
  id: string;
  steerpoint: number;              // DCS steerpoint number (1-99)
  name: string;                    // e.g., "IP ALPHA", "TGT 1"
  type: WaypointType;
  
  coordinates: Coordinates;
  elevation_ft: number;            // MSL
  
  // Optional timing
  tos?: string;                    // Time on station (HH:MM:SS)
  
  // For target waypoints
  targetInfo?: TargetInfo;
}

type WaypointType = 
  | "nav"           // Navigation waypoint
  | "ip"            // Initial Point
  | "target"        // Target
  | "cap"           // Combat Air Patrol point
  | "marshal"       // Marshal/holding point
  | "tanker"        // Tanker track
  | "divert"        // Divert airfield
  | "bullseye";     // Bullseye reference

interface Coordinates {
  lat: number;                     // Decimal degrees (positive = North)
  lon: number;                     // Decimal degrees (positive = East)
}

interface TargetInfo {
  description: string;             // What's at the target
  priority: 1 | 2 | 3;             // Target priority
  dmpiCount?: number;              // Number of DMPIs (Desired Mean Points of Impact)
}
```

### 2.3 Threats

```typescript
// Threat system definition (from database)
interface ThreatSystem {
  id: string;
  name: string;                    // "S-300PS (SA-10 Grumble)"
  natoDesignation: string;         // "SA-10"
  type: ThreatType;
  
  // Engagement envelope
  maxRange_nm: number;
  minRange_nm: number;
  maxAltitude_ft: number;
  minAltitude_ft: number;
  optimalAltitude_ft?: number;     // Where it's most effective
  
  // Performance
  missileSpeed_mach?: number;
  reloadTime_sec?: number;
  simultaneousEngagements?: number;
  reactionTime_sec?: number;
  
  // Radar (for SAMs)
  radar?: RadarInfo;
  
  // Gun data (for AAA)
  gun?: GunInfo;
  
  // DCS-specific
  dcsUnitName: string;             // For pydcs/miz parsing
}

type ThreatType = "SAM" | "AAA" | "MANPADS" | "SHORAD" | "EWR";

interface RadarInfo {
  type: "CW" | "PD" | "TWS" | "MTI";
  trackWhileScan: boolean;
  searchAltitude_ft?: number;      // Max search altitude
  burnThroughRange_nm?: number;    // Range where jamming is ineffective
}

interface GunInfo {
  caliber_mm: number;
  rateOfFire_rpm: number;
  muzzleVelocity_mps: number;
  effectiveRange_m: number;
  radarGuided: boolean;
}

// Placed threat instance on the map
interface ThreatInstance {
  id: string;
  systemId: string;                // Reference to ThreatSystem
  
  position: Coordinates;
  
  status: ThreatStatus;
  orientationDeg?: number;         // Facing direction (for directional systems)
  
  notes?: string;
}

type ThreatStatus = 
  | "active"        // Fully operational
  | "degraded"      // Reduced capability
  | "suppressed"    // Temporarily neutralized
  | "destroyed"     // Confirmed kill
  | "unknown";      // Intel uncertain
```

### 2.4 Aircraft and Loadouts

```typescript
interface Aircraft {
  id: string;
  name: string;                    // "F-16C Viper"
  dcsModuleName: string;           // "F-16C_50"
  
  // Performance envelope
  maxSpeed_ktas: number;
  stallSpeed_ktas: number;
  maxG: number;
  servicesCeiling_ft: number;
  
  // Stations
  stations: WeaponStation[];
  
  // Available delivery modes
  deliveryModes: DeliveryMode[];
  
  // Kneeboard customization
  kneeboardPath: string;           // Subfolder in DCS kneeboard directory
}

interface WeaponStation {
  station: number;
  name: string;                    // "Sta 3 (Left Wing)"
  compatibleWeapons: string[];     // List of weapon IDs
  isPylon: boolean;
}

type DeliveryMode = 
  | "CCIP"          // Continuously Computed Impact Point
  | "CCRP"          // Continuously Computed Release Point
  | "DTOS"          // Dive Toss
  | "LADD"          // Low Angle Drogue Delivery
  | "MAN"           // Manual
  | "VIS"           // Visual
  | "AUTO";         // Automatic (Hornet)
```

### 2.5 Weapons

```typescript
interface Weapon {
  id: string;
  name: string;                    // "Mk-82 LDGP"
  category: WeaponCategory;
  
  // Physical properties
  weight_lbs: number;
  dragIndex?: number;              // For ballistic calculations
  
  // Guidance
  guidance: GuidanceType;
  
  // Delivery constraints
  minReleaseAlt_ft: number;
  maxReleaseAlt_ft: number;
  minReleaseSpeed_ktas: number;
  maxReleaseSpeed_ktas: number;
  
  // Fuzing options
  fuzeOptions: FuzeOption[];
  
  // Fragmentation data
  fragPattern?: FragPattern;
  
  // DCS-specific
  dcsWeaponName: string;
}

type WeaponCategory = 
  | "bomb_unguided"
  | "bomb_guided"
  | "bomb_gps"
  | "missile_agm"
  | "rocket"
  | "gun"
  | "cluster"
  | "standoff";

type GuidanceType = 
  | "none"
  | "laser"
  | "gps"
  | "ir"
  | "tv"
  | "radar";

interface FuzeOption {
  id: string;
  name: string;                    // "M904 Nose"
  type: "nose" | "tail" | "proximity";
  armingDelay_sec?: number;
  burstHeight_ft?: number;         // For proximity fuzes
}

interface FragPattern {
  lethalRadius_ft: number;
  effectiveRadius_ft: number;
  minSafeAlt_ft: number;           // Minimum release altitude for safety
}
```

### 2.6 Flight Members

```typescript
interface FlightMember {
  id: string;
  callsign: string;                // "Viper 1"
  position: 1 | 2 | 3 | 4;
  role: FlightRole;
  
  aircraftId: string;              // Reference to Aircraft
  loadout: LoadoutItem[];
  
  pilotName?: string;              // Optional real name
}

type FlightRole = 
  | "flight_lead"
  | "element_lead"
  | "wingman";

interface LoadoutItem {
  station: number;
  weaponId: string;
  quantity: number;
  fuzeId?: string;
}
```

### 2.7 Attacks

```typescript
interface Attack {
  id: string;
  
  // What
  targetWaypointId: string;        // Reference to target waypoint
  attackerId: string;              // Reference to FlightMember
  
  // How
  profileType: AttackProfileType;
  profile: AttackProfile;          // Type-specific parameters
  
  // With what
  weaponId: string;
  fuzeId?: string;
  releaseQuantity: number;
  releaseMode: "single" | "pair" | "ripple";
  rippleInterval_ft?: number;      // Spacing for ripple
  
  // Sequence
  sequenceNumber: number;          // Order in attack flow
  
  notes?: string;
}

type AttackProfileType = 
  | "level_ccrp"
  | "dive_ccip"
  | "popup_ccip"
  | "loft_ccrp"
  | "low_angle_low_drag"
  | "high_angle_strafe"
  | "standoff";

// Union type for profile-specific parameters
type AttackProfile = 
  | LevelCCRPProfile
  | DiveCCIPProfile
  | PopupCCIPProfile
  | LoftCCRPProfile
  | StandoffProfile;

interface LevelCCRPProfile {
  type: "level_ccrp";
  ingressHeading_deg: number;
  releaseAltitude_ft: number;      // MSL
  releaseSpeed_ktas: number;
  egressHeading_deg: number;
}

interface DiveCCIPProfile {
  type: "dive_ccip";
  ingressHeading_deg: number;
  rollInAltitude_ft: number;       // AGL
  diveAngle_deg: number;
  releaseAltitude_ft: number;      // AGL
  releaseSpeed_ktas: number;
  pulloutG: number;
  egressDirection: "left" | "right" | "straight";
}

interface PopupCCIPProfile {
  type: "popup_ccip";
  
  // Run-in
  ipWaypointId: string;            // Initial Point waypoint
  runInHeading_deg: number;
  runInAltitude_ft: number;        // AGL
  runInSpeed_ktas: number;
  
  // Pop maneuver
  popDistance_nm: number;          // Distance from target to begin pop
  climbAngle_deg: number;
  apexAltitude_ft: number;         // AGL
  
  // Attack
  rollInAltitude_ft: number;       // AGL
  diveAngle_deg: number;
  releaseAltitude_ft: number;      // AGL
  releaseSpeed_ktas: number;
  
  // Egress
  minAltitude_ft: number;          // Hard deck
  egressDirection: "left" | "right";
  egressHeading_deg: number;
}

interface LoftCCRPProfile {
  type: "loft_ccrp";
  ingressHeading_deg: number;
  ingressAltitude_ft: number;
  ingressSpeed_ktas: number;
  pullUpDistance_nm: number;
  pullUpAngle_deg: number;
  releaseAltitude_ft: number;
  egressHeading_deg: number;
}

interface StandoffProfile {
  type: "standoff";
  releasePoint: Coordinates;
  releaseAltitude_ft: number;
  releaseSpeed_ktas: number;
  releaseHeading_deg: number;
  standoffDistance_nm: number;
}
```

### 2.8 Kneeboard Card

```typescript
interface KneeboardCard {
  id: string;
  
  flightMemberId: string;
  attackId: string;
  
  // Rendered content sections
  header: KneeboardHeader;
  targetSection: KneeboardTargetSection;
  threatSection: KneeboardThreatSection;
  attackSection: KneeboardAttackSection;
  weaponSection: KneeboardWeaponSection;
  egressSection: KneeboardEgressSection;
  
  // Output
  renderedImage?: string;          // Base64 PNG or file path
}

interface KneeboardHeader {
  callsign: string;
  missionDate: string;
  targetName: string;
}

interface KneeboardTargetSection {
  name: string;
  coordinates: string;             // Formatted (N 41°23'45" E 044°12'34")
  coordinatesMGRS: string;         // MGRS format
  elevation_ft: number;
  description: string;
}

interface KneeboardThreatSection {
  threats: KneeboardThreatItem[];
}

interface KneeboardThreatItem {
  name: string;                    // "SA-10"
  bearing_deg: number;             // From target
  distance_nm: number;             // From target
  maxRange_nm: number;
  notes?: string;
}

interface KneeboardAttackSection {
  profileType: string;             // Human readable
  parameters: Record<string, string>;  // Key-value pairs to display
}

interface KneeboardWeaponSection {
  weaponName: string;
  quantity: number;
  fuze: string;
  armingDelay?: string;
  releaseMode: string;
  minSafeAlt_ft?: number;
}

interface KneeboardEgressSection {
  direction: string;
  heading_deg: number;
  fenceOutWaypoint?: string;
  abortProcedure?: string;
  rescueBullseye?: string;
}
```

---

## 3. Database Schemas

### 3.1 Threat Database (SQLite)

```sql
CREATE TABLE threat_systems (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    nato_designation TEXT,
    type TEXT NOT NULL,  -- 'SAM', 'AAA', 'MANPADS', 'SHORAD', 'EWR'
    
    max_range_nm REAL NOT NULL,
    min_range_nm REAL DEFAULT 0,
    max_altitude_ft REAL NOT NULL,
    min_altitude_ft REAL DEFAULT 0,
    optimal_altitude_ft REAL,
    
    missile_speed_mach REAL,
    reload_time_sec REAL,
    simultaneous_engagements INTEGER,
    reaction_time_sec REAL,
    
    -- Radar info (JSON)
    radar_info TEXT,
    
    -- Gun info (JSON)
    gun_info TEXT,
    
    dcs_unit_name TEXT,
    
    notes TEXT
);

-- Initial data: Soviet/Russian SAMs
INSERT INTO threat_systems VALUES 
('sa2', 'S-75 Dvina', 'SA-2 Guideline', 'SAM', 24, 3, 82000, 3000, NULL, 3.5, 60, 1, 8, '{"type":"CW","trackWhileScan":false}', NULL, 'SA-2', NULL),
('sa3', 'S-125 Neva', 'SA-3 Goa', 'SAM', 15, 1, 59000, 160, NULL, 3.5, 30, 1, 6, '{"type":"CW","trackWhileScan":false}', NULL, 'SA-3', NULL),
('sa6', '2K12 Kub', 'SA-6 Gainful', 'SAM', 13, 2, 46000, 160, NULL, 2.8, 20, 2, 8, '{"type":"CW","trackWhileScan":true}', NULL, 'SA-6', NULL),
('sa8', '9K33 Osa', 'SA-8 Gecko', 'SHORAD', 6, 0.1, 16400, 80, NULL, 2.4, 5, 2, 8, '{"type":"PD","trackWhileScan":true}', NULL, 'SA-8', NULL),
('sa10', 'S-300PS', 'SA-10 Grumble', 'SAM', 47, 3, 98000, 80, NULL, 6.0, 10, 6, 10, '{"type":"PD","trackWhileScan":true}', NULL, 'SA-10', NULL),
('sa11', '9K37 Buk', 'SA-11 Gadfly', 'SAM', 19, 2, 72000, 50, NULL, 3.0, 12, 2, 12, '{"type":"PD","trackWhileScan":true}', NULL, 'SA-11', NULL),
('sa15', '9K331 Tor', 'SA-15 Gauntlet', 'SHORAD', 7.5, 0.5, 20000, 30, NULL, 2.8, 8, 2, 8, '{"type":"PD","trackWhileScan":true}', NULL, 'SA-15', NULL),
('sa19', '2K22 Tunguska', 'SA-19 Grison', 'SHORAD', 5, 0.1, 11500, 50, NULL, 2.5, 8, 2, 5, '{"type":"PD","trackWhileScan":true}', '{"caliber_mm":30,"rateOfFire_rpm":5000,"muzzleVelocity_mps":960,"effectiveRange_m":4000,"radarGuided":true}', 'SA-19', NULL);

-- AAA systems
INSERT INTO threat_systems VALUES
('zsu23', 'ZSU-23-4 Shilka', 'ZSU-23-4', 'AAA', 1.5, 0, 5000, 0, 1500, NULL, NULL, NULL, NULL, '{"type":"PD","trackWhileScan":false}', '{"caliber_mm":23,"rateOfFire_rpm":3400,"muzzleVelocity_mps":970,"effectiveRange_m":2500,"radarGuided":true}', 'ZSU-23-4', NULL),
('zsu57', 'ZSU-57-2', NULL, 'AAA', 2.2, 0, 8500, 0, 4000, NULL, NULL, NULL, NULL, NULL, '{"caliber_mm":57,"rateOfFire_rpm":240,"muzzleVelocity_mps":1000,"effectiveRange_m":4000,"radarGuided":false}', 'ZSU-57-2', NULL),
('s60', 'S-60 57mm', NULL, 'AAA', 3.2, 0, 13000, 0, 6000, NULL, NULL, NULL, NULL, NULL, '{"caliber_mm":57,"rateOfFire_rpm":120,"muzzleVelocity_mps":1000,"effectiveRange_m":6000,"radarGuided":false}', 'S-60', NULL);
```

### 3.2 Weapon Database (SQLite)

```sql
CREATE TABLE weapons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    
    weight_lbs REAL NOT NULL,
    drag_index REAL,
    
    guidance TEXT NOT NULL,  -- 'none', 'laser', 'gps', 'ir', 'tv', 'radar'
    
    min_release_alt_ft REAL,
    max_release_alt_ft REAL,
    min_release_speed_ktas REAL,
    max_release_speed_ktas REAL,
    
    frag_lethal_radius_ft REAL,
    frag_effective_radius_ft REAL,
    frag_min_safe_alt_ft REAL,
    
    dcs_weapon_name TEXT,
    
    notes TEXT
);

CREATE TABLE fuze_options (
    id TEXT PRIMARY KEY,
    weapon_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- 'nose', 'tail', 'proximity'
    arming_delay_sec REAL,
    burst_height_ft REAL,
    
    FOREIGN KEY (weapon_id) REFERENCES weapons(id)
);

CREATE TABLE aircraft_weapons (
    aircraft_id TEXT NOT NULL,
    weapon_id TEXT NOT NULL,
    station INTEGER NOT NULL,
    max_quantity INTEGER DEFAULT 1,
    
    PRIMARY KEY (aircraft_id, weapon_id, station),
    FOREIGN KEY (weapon_id) REFERENCES weapons(id)
);

-- F-16 weapons
INSERT INTO weapons VALUES
('mk82', 'Mk-82 LDGP', 'bomb_unguided', 500, 0.027, 'none', 3000, 40000, 350, 550, 150, 400, 3000, 'Mk_82', NULL),
('mk82air', 'Mk-82 AIR', 'bomb_unguided', 570, 0.032, 'none', 200, 20000, 350, 550, 150, 400, 500, 'Mk_82AIR', 'High-drag retarded delivery'),
('mk84', 'Mk-84 LDGP', 'bomb_unguided', 2000, 0.024, 'none', 4500, 40000, 350, 550, 300, 800, 4500, 'Mk_84', NULL),
('gbu12', 'GBU-12 Paveway II', 'bomb_guided', 600, 0.028, 'laser', 3000, 35000, 350, 550, 150, 400, 3000, 'GBU_12', '500lb LGB'),
('gbu10', 'GBU-10 Paveway II', 'bomb_guided', 2100, 0.025, 'laser', 4500, 40000, 350, 550, 300, 800, 4500, 'GBU_10', '2000lb LGB'),
('gbu31', 'GBU-31 JDAM', 'bomb_gps', 2115, 0.024, 'gps', 3000, 45000, 350, 550, 300, 800, 4500, 'GBU_31', '2000lb GPS'),
('gbu38', 'GBU-38 JDAM', 'bomb_gps', 550, 0.027, 'gps', 2500, 45000, 350, 550, 150, 400, 3000, 'GBU_38', '500lb GPS'),
('cbu87', 'CBU-87 CEM', 'cluster', 950, 0.030, 'none', 500, 40000, 350, 550, NULL, 1000, 500, 'CBU_87', 'Combined Effects Munition'),
('agm65d', 'AGM-65D Maverick', 'missile_agm', 485, NULL, 'ir', 500, 25000, 300, 500, 100, 300, NULL, 'AGM_65D', 'IR Maverick');

-- Fuze options
INSERT INTO fuze_options VALUES
('m904', 'mk82', 'M904 Nose', 'nose', NULL, NULL),
('m905', 'mk82', 'M905 Tail', 'tail', 4.0, NULL),
('fmU83', 'mk82', 'FMU-113 Prox', 'proximity', NULL, 50),
('m904_84', 'mk84', 'M904 Nose', 'nose', NULL, NULL),
('m905_84', 'mk84', 'M905 Tail', 'tail', 6.0, NULL);
```

---

## 4. Attack Profile Calculations

### 4.1 Popup CCIP Calculator

```rust
/// Calculate popup attack profile parameters
pub fn calculate_popup_ccip(
    target_elevation_ft: f64,
    run_in_altitude_agl: f64,
    run_in_speed_ktas: f64,
    pop_distance_nm: f64,
    apex_altitude_agl: f64,
    dive_angle_deg: f64,
    weapon: &Weapon,
) -> PopupCCIPResult {
    // Convert to consistent units
    let run_in_alt_msl = target_elevation_ft + run_in_altitude_agl;
    let apex_alt_msl = target_elevation_ft + apex_altitude_agl;
    
    // Calculate climb parameters
    let altitude_gain = apex_altitude_agl - run_in_altitude_agl;
    let climb_angle_deg = calculate_climb_angle(
        altitude_gain,
        pop_distance_nm * 6076.0,  // Convert nm to feet
        run_in_speed_ktas,
    );
    
    // Calculate roll-in point
    let roll_in_altitude_agl = apex_altitude_agl * 0.85;  // Typical 85% of apex
    
    // Calculate release parameters based on dive angle and weapon ballistics
    let release_altitude_agl = calculate_release_altitude(
        dive_angle_deg,
        run_in_speed_ktas,
        &weapon,
    );
    
    // Calculate minimum safe altitude (frag deconfliction)
    let min_safe_altitude_agl = weapon.frag_min_safe_alt_ft.unwrap_or(release_altitude_agl * 0.9);
    
    // Calculate pullout altitude
    let pullout_altitude_agl = release_altitude_agl - 500.0;  // Buffer for recovery
    
    PopupCCIPResult {
        climb_angle_deg,
        apex_altitude_msl: apex_alt_msl,
        roll_in_altitude_agl,
        release_altitude_agl,
        release_speed_ktas: run_in_speed_ktas + 30.0,  // Speed builds in dive
        min_safe_altitude_agl,
        pullout_altitude_agl,
        time_to_release_sec: estimate_time_to_release(/* ... */),
    }
}
```

### 4.2 Threat Exposure Calculator

```rust
/// Calculate threat exposure during attack run
pub fn calculate_threat_exposure(
    attack: &Attack,
    threats: &[ThreatInstance],
    target_position: &Coordinates,
) -> ThreatExposureResult {
    let mut exposures = Vec::new();
    
    for threat in threats {
        let threat_system = get_threat_system(&threat.system_id);
        
        // Calculate distance from attack path to threat
        let min_distance_nm = calculate_min_distance_to_path(
            &attack.profile,
            &threat.position,
            target_position,
        );
        
        // Check if within engagement envelope
        let in_range = min_distance_nm <= threat_system.max_range_nm;
        let in_altitude = /* altitude check against threat envelope */;
        
        if in_range && in_altitude {
            let exposure_time = calculate_exposure_time(
                &attack.profile,
                &threat,
                &threat_system,
            );
            
            exposures.push(ThreatExposure {
                threat_id: threat.id.clone(),
                threat_name: threat_system.nato_designation.clone(),
                min_distance_nm,
                exposure_time_sec: exposure_time,
                risk_level: assess_risk_level(min_distance_nm, &threat_system),
            });
        }
    }
    
    ThreatExposureResult { exposures }
}
```

---

## 5. .miz File Parser

DCS .miz files are ZIP archives containing Lua files:

```
mission.miz (ZIP)
├── mission           # Main mission data (Lua table)
├── options           # Mission options
├── warehouses        # Logistics data
├── dictionary        # Localized strings
└── l10n/
    └── DEFAULT/
        └── dictionary  # More strings
```

### 5.1 Key Data Extraction

```rust
pub struct MizParser {
    zip: ZipArchive<File>,
}

impl MizParser {
    pub fn extract_waypoints(&self, group_name: &str) -> Vec<Waypoint> {
        let mission_lua = self.read_mission_lua();
        
        // Parse Lua to find:
        // mission.coalition.blue.country[].plane.group[].route.points[]
        
        // Each point has:
        // - x, y (map coordinates - need conversion to lat/lon)
        // - alt (meters)
        // - name
        // - type (e.g., "Turning Point", "Fly Over Point")
        // - speed (m/s)
        // - ETA (seconds from mission start)
    }
    
    pub fn extract_threats(&self) -> Vec<ThreatInstance> {
        // Parse mission.coalition.red.country[].vehicle.group[]
        // Match unit types against threat database
    }
    
    pub fn get_theater(&self) -> Theater {
        // Parse mission.theatre
    }
    
    pub fn get_bullseye(&self) -> Coordinates {
        // Parse mission.coalition.blue.bullseye
    }
}
```

### 5.2 Coordinate Conversion

DCS uses a local Cartesian coordinate system per map. Conversion to lat/lon:

```rust
/// Convert DCS map coordinates to lat/lon
/// Each theater has different origin points and scale factors
pub fn dcs_to_latlon(x: f64, y: f64, theater: &Theater) -> Coordinates {
    let params = get_theater_params(theater);
    
    // Apply theater-specific transformation
    let lat = params.lat_origin + (y / params.meters_per_deg_lat);
    let lon = params.lon_origin + (x / params.meters_per_deg_lon);
    
    Coordinates { lat, lon }
}

struct TheaterParams {
    lat_origin: f64,
    lon_origin: f64,
    meters_per_deg_lat: f64,
    meters_per_deg_lon: f64,
}
```

---

## 6. Kneeboard Renderer

### 6.1 Layout Specification

```
┌────────────────────────────────────────┐  ← 768px width
│░░░░░░░░░░ HEADER (60px) ░░░░░░░░░░░░░░│
├────────────────────────────────────────┤
│                                        │
│  TARGET SECTION (150px)                │
│                                        │
├────────────────────────────────────────┤
│                                        │
│  THREAT SECTION (150px)                │
│                                        │
├────────────────────────────────────────┤
│                                        │
│  ATTACK PROFILE (250px)                │
│                                        │
├────────────────────────────────────────┤
│                                        │
│  WEAPON SECTION (150px)                │
│                                        │
├────────────────────────────────────────┤
│                                        │
│  EGRESS / ABORT (150px)                │
│                                        │
├────────────────────────────────────────┤
│░░░░░░░░░░ FOOTER (64px) ░░░░░░░░░░░░░░│
└────────────────────────────────────────┘  ← 1024px height
```

### 6.2 Rendering Pipeline

```rust
pub fn render_kneeboard_card(card: &KneeboardCard) -> Result<Vec<u8>, Error> {
    // Create image buffer (768 x 1024, RGBA)
    let mut img = RgbaImage::new(768, 1024);
    
    // Fill background (off-white)
    fill_rect(&mut img, 0, 0, 768, 1024, Rgba([252, 250, 245, 255]));
    
    // Draw sections
    draw_header(&mut img, &card.header);
    draw_target_section(&mut img, &card.target_section, 60);
    draw_threat_section(&mut img, &card.threat_section, 210);
    draw_attack_section(&mut img, &card.attack_section, 360);
    draw_weapon_section(&mut img, &card.weapon_section, 610);
    draw_egress_section(&mut img, &card.egress_section, 760);
    draw_footer(&mut img, 960);
    
    // Draw section divider lines
    draw_dividers(&mut img);
    
    // Encode as PNG
    let mut buffer = Vec::new();
    img.write_to(&mut Cursor::new(&mut buffer), ImageOutputFormat::Png)?;
    
    Ok(buffer)
}
```

---

## 7. File Formats

### 7.1 Mission Plan File (.attackplan)

JSON format, gzipped for smaller size:

```json
{
  "version": "1.0",
  "mission": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Strike Package Alpha",
    "date": "2024-01-15",
    "theater": "caucasus",
    "bullseye": { "lat": 42.0, "lon": 44.0 },
    "waypoints": [],
    "threats": [],
    "flight": [],
    "attacks": [],
    "notes": "",
    "createdAt": "2024-01-14T20:30:00Z",
    "updatedAt": "2024-01-14T22:15:00Z"
  }
}
```

---

## 8. UI Component Structure

```
App
├── Sidebar
│   ├── MissionList
│   └── MissionActions (New, Open, Save)
├── MainPanel
│   ├── TabBar (Map | Waypoints | Threats | Flight | Attacks | Kneeboards)
│   └── TabContent
│       ├── MapView
│       │   ├── LeafletMap
│       │   ├── WaypointMarkers
│       │   ├── ThreatRings
│       │   └── AttackVectors
│       ├── WaypointEditor
│       │   ├── WaypointTable
│       │   └── WaypointForm
│       ├── ThreatEditor
│       │   ├── ThreatPicker
│       │   └── ThreatTable
│       ├── FlightEditor
│       │   ├── FlightMemberList
│       │   └── LoadoutEditor
│       ├── AttackPlanner
│       │   ├── AttackList
│       │   ├── ProfileSelector
│       │   └── ParameterEditor
│       └── KneeboardPreview
│           ├── CardPreview
│           └── ExportActions
└── StatusBar
```

---

## 9. Tauri Commands (Backend API)

```rust
// File operations
#[tauri::command]
fn new_mission(name: String, theater: String) -> Result<Mission, String>;

#[tauri::command]
fn save_mission(mission: Mission, path: String) -> Result<(), String>;

#[tauri::command]
fn load_mission(path: String) -> Result<Mission, String>;

// Import
#[tauri::command]
fn parse_miz_file(path: String) -> Result<MizData, String>;

#[tauri::command]
fn scrape_fragorders(url: String) -> Result<FragOrdersData, String>;

// Database queries
#[tauri::command]
fn get_all_threats() -> Result<Vec<ThreatSystem>, String>;

#[tauri::command]
fn get_weapons_for_aircraft(aircraft_id: String) -> Result<Vec<Weapon>, String>;

// Calculations
#[tauri::command]
fn calculate_attack_profile(
    profile_type: String,
    params: Value,
    weapon_id: String,
    target_elevation: f64,
) -> Result<AttackCalculationResult, String>;

#[tauri::command]
fn calculate_threat_exposure(
    attack: Attack,
    threats: Vec<ThreatInstance>,
    target: Coordinates,
) -> Result<ThreatExposureResult, String>;

// Export
#[tauri::command]
fn render_kneeboard(card: KneeboardCard) -> Result<Vec<u8>, String>;

#[tauri::command]
fn export_kneeboard_cards(
    cards: Vec<KneeboardCard>,
    output_path: String,
) -> Result<(), String>;

#[tauri::command]
fn get_default_dcs_kneeboard_path(aircraft: String) -> Result<String, String>;
```

---

## 10. Development Setup

### 10.1 Prerequisites

- Node.js 18+
- Rust 1.70+
- pnpm (preferred) or npm

### 10.2 Initial Setup

```bash
# Install Tauri CLI
cargo install tauri-cli

# Create project
pnpm create tauri-app attack-planner --template react-ts

# Install frontend dependencies
cd attack-planner
pnpm install

# Add key dependencies
pnpm add zustand @tanstack/react-query leaflet react-leaflet
pnpm add -D @types/leaflet tailwindcss postcss autoprefixer

# Initialize Tailwind
pnpm exec tailwindcss init -p

# Run development
pnpm tauri dev
```

### 10.3 Rust Dependencies (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
zip = "0.6"
mlua = { version = "0.9", features = ["lua54", "vendored"] }
image = "0.25"
rusttype = "0.9"
thiserror = "1"
uuid = { version = "1", features = ["v4", "serde"] }
```
