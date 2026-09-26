//! Database module
//!
//! Handles SQLite database operations for threat systems and weapon data.

use rusqlite::{Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

/// Thread-safe database wrapper
pub struct Database {
    conn: Mutex<Connection>,
}

/// Threat system from database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatSystem {
    pub id: String,
    pub name: String,
    pub nato_designation: Option<String>,
    pub threat_type: String,
    pub max_range_nm: f64,
    pub min_range_nm: f64,
    pub max_altitude_ft: f64,
    pub min_altitude_ft: f64,
    pub optimal_altitude_ft: Option<f64>,
    pub missile_speed_mach: Option<f64>,
    pub reload_time_sec: Option<f64>,
    pub simultaneous_engagements: Option<i32>,
    pub reaction_time_sec: Option<f64>,
    pub radar_info: Option<String>,
    pub gun_info: Option<String>,
    pub dcs_unit_name: Option<String>,
    pub notes: Option<String>,
}

/// Weapon from database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Weapon {
    pub id: String,
    pub name: String,
    pub category: String,
    pub weight_lbs: f64,
    pub drag_index: Option<f64>,
    pub guidance: String,
    pub min_release_alt_ft: Option<f64>,
    pub max_release_alt_ft: Option<f64>,
    pub min_release_speed_ktas: Option<f64>,
    pub max_release_speed_ktas: Option<f64>,
    pub frag_lethal_radius_ft: Option<f64>,
    pub frag_effective_radius_ft: Option<f64>,
    pub frag_min_safe_alt_ft: Option<f64>,
    pub dcs_weapon_name: Option<String>,
    pub notes: Option<String>,
    /// Aircraft ids mapped to this weapon in `aircraft_weapons`. The picker
    /// uses it for guns and rockets, which only their own aircraft carry.
    #[serde(default)]
    pub carried_by: Vec<String>,
}

/// Every weapon query selects these, in this order, from `weapons w`, for
/// `weapon_from_row`. The last column lists the aircraft that carry it.
const WEAPON_COLUMNS: &str = "w.id, w.name, w.category, w.weight_lbs, w.drag_index, w.guidance,
    w.min_release_alt_ft, w.max_release_alt_ft, w.min_release_speed_ktas, w.max_release_speed_ktas,
    w.frag_lethal_radius_ft, w.frag_effective_radius_ft, w.frag_min_safe_alt_ft,
    w.dcs_weapon_name, w.notes,
    (SELECT GROUP_CONCAT(DISTINCT aw.aircraft_id) FROM aircraft_weapons aw WHERE aw.weapon_id = w.id)";

fn weapon_from_row(row: &rusqlite::Row) -> SqliteResult<Weapon> {
    let carried_by: Option<String> = row.get(15)?;
    Ok(Weapon {
        id: row.get(0)?,
        name: row.get(1)?,
        category: row.get(2)?,
        weight_lbs: row.get(3)?,
        drag_index: row.get(4)?,
        guidance: row.get(5)?,
        min_release_alt_ft: row.get(6)?,
        max_release_alt_ft: row.get(7)?,
        min_release_speed_ktas: row.get(8)?,
        max_release_speed_ktas: row.get(9)?,
        frag_lethal_radius_ft: row.get(10)?,
        frag_effective_radius_ft: row.get(11)?,
        frag_min_safe_alt_ft: row.get(12)?,
        dcs_weapon_name: row.get(13)?,
        notes: row.get(14)?,
        carried_by: carried_by.map(|s| s.split(',').map(str::to_string).collect()).unwrap_or_default(),
    })
}

/// Fuze option from database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuzeOption {
    pub id: String,
    pub weapon_id: String,
    pub name: String,
    pub fuze_type: String,
    pub arming_delay_sec: Option<f64>,
    pub burst_height_ft: Option<f64>,
}

/// Aircraft from database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aircraft {
    pub id: String,
    pub name: String,
    pub dcs_module_name: String,
    pub max_speed_ktas: f64,
    pub stall_speed_ktas: f64,
    pub max_g: f64,
    pub service_ceiling_ft: f64,
    pub kneeboard_path: String,
}

/// Bump this whenever the schema or the seed data changes.
///
/// The database holds reference data only — threats, weapons, aircraft.
/// Missions live in JSON files. So an out-of-date database is simply dropped
/// and rebuilt from the seed; there is nothing in it to migrate. Without this,
/// new seed rows (say, an aircraft) never reach a database that already
/// exists, because seeding only runs on empty tables.
const SCHEMA_VERSION: i32 = 4;

impl Database {
    /// Open or create the database at the given path
    pub fn open<P: AsRef<Path>>(path: P) -> SqliteResult<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn: Mutex::new(conn) };
        db.migrate()?;
        Ok(db)
    }

    /// Open an in-memory database (for testing)
    pub fn open_in_memory() -> SqliteResult<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn: Mutex::new(conn) };
        db.migrate()?;
        Ok(db)
    }

    /// Bring the database to `SCHEMA_VERSION`: rebuild from seed if stale.
    fn migrate(&self) -> SqliteResult<()> {
        let stale = {
            let conn = self.conn.lock().unwrap();
            let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
            if version < SCHEMA_VERSION {
                println!("Reference database is v{version}, rebuilding as v{SCHEMA_VERSION}");
                conn.execute_batch(
                    r#"
                    DROP TABLE IF EXISTS aircraft_weapons;
                    DROP TABLE IF EXISTS fuze_options;
                    DROP TABLE IF EXISTS aircraft;
                    DROP TABLE IF EXISTS weapons;
                    DROP TABLE IF EXISTS threat_systems;
                    "#,
                )?;
            }
            version < SCHEMA_VERSION
        };

        self.initialize_tables()?;
        self.seed_data_if_empty()?;

        if stale {
            let conn = self.conn.lock().unwrap();
            conn.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION}"))?;
        }
        Ok(())
    }

    /// Initialize database tables
    fn initialize_tables(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS threat_systems (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                nato_designation TEXT,
                type TEXT NOT NULL,
                max_range_nm REAL NOT NULL,
                min_range_nm REAL DEFAULT 0,
                max_altitude_ft REAL NOT NULL,
                min_altitude_ft REAL DEFAULT 0,
                optimal_altitude_ft REAL,
                missile_speed_mach REAL,
                reload_time_sec REAL,
                simultaneous_engagements INTEGER,
                reaction_time_sec REAL,
                radar_info TEXT,
                gun_info TEXT,
                dcs_unit_name TEXT,
                notes TEXT
            );

            CREATE TABLE IF NOT EXISTS weapons (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                weight_lbs REAL NOT NULL,
                drag_index REAL,
                guidance TEXT NOT NULL,
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

            CREATE TABLE IF NOT EXISTS fuze_options (
                id TEXT PRIMARY KEY,
                weapon_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                arming_delay_sec REAL,
                burst_height_ft REAL,
                FOREIGN KEY (weapon_id) REFERENCES weapons(id)
            );

            CREATE TABLE IF NOT EXISTS aircraft (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                dcs_module_name TEXT NOT NULL,
                max_speed_ktas REAL NOT NULL,
                stall_speed_ktas REAL NOT NULL,
                max_g REAL NOT NULL,
                service_ceiling_ft REAL NOT NULL,
                kneeboard_path TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS aircraft_weapons (
                aircraft_id TEXT NOT NULL,
                weapon_id TEXT NOT NULL,
                station INTEGER NOT NULL,
                max_quantity INTEGER DEFAULT 1,
                PRIMARY KEY (aircraft_id, weapon_id, station),
                FOREIGN KEY (aircraft_id) REFERENCES aircraft(id),
                FOREIGN KEY (weapon_id) REFERENCES weapons(id)
            );
            "#,
        )?;
        Ok(())
    }

    /// Seed database with initial data if tables are empty
    fn seed_data_if_empty(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();

        // Check if threats table is empty
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM threat_systems",
            [],
            |row| row.get(0),
        )?;

        if count == 0 {
            // Seed threat systems
            conn.execute_batch(r#"
                -- Soviet/Russian SAMs
                INSERT INTO threat_systems (id, name, nato_designation, type, max_range_nm, min_range_nm, max_altitude_ft, min_altitude_ft, missile_speed_mach, reload_time_sec, simultaneous_engagements, reaction_time_sec, radar_info, dcs_unit_name) VALUES
                ('sa2', 'S-75 Dvina', 'SA-2 Guideline', 'SAM', 24, 3, 82000, 3000, 3.5, 60, 1, 8, '{"type":"CW","trackWhileScan":false}', 'S-75'),
                ('sa3', 'S-125 Neva', 'SA-3 Goa', 'SAM', 15, 1, 59000, 160, 3.5, 30, 1, 6, '{"type":"CW","trackWhileScan":false}', 'S-125'),
                ('sa6', '2K12 Kub', 'SA-6 Gainful', 'SAM', 13, 2, 46000, 160, 2.8, 20, 2, 8, '{"type":"CW","trackWhileScan":true}', 'Kub'),
                ('sa8', '9K33 Osa', 'SA-8 Gecko', 'SHORAD', 6, 0.1, 16400, 80, 2.4, 5, 2, 8, '{"type":"PD","trackWhileScan":true}', 'Osa'),
                ('sa10', 'S-300PS', 'SA-10 Grumble', 'SAM', 47, 3, 98000, 80, 6.0, 10, 6, 10, '{"type":"PD","trackWhileScan":true}', 'S-300PS'),
                ('sa11', '9K37 Buk', 'SA-11 Gadfly', 'SAM', 19, 2, 72000, 50, 3.0, 12, 2, 12, '{"type":"PD","trackWhileScan":true}', 'Buk'),
                ('sa15', '9K331 Tor', 'SA-15 Gauntlet', 'SHORAD', 7.5, 0.5, 20000, 30, 2.8, 8, 2, 8, '{"type":"PD","trackWhileScan":true}', 'Tor'),
                ('sa19', '2K22 Tunguska', 'SA-19 Grison', 'SHORAD', 5, 0.1, 11500, 50, 2.5, 8, 2, 5, '{"type":"PD","trackWhileScan":true}', 'Tunguska');

                -- AAA systems
                INSERT INTO threat_systems (id, name, nato_designation, type, max_range_nm, min_range_nm, max_altitude_ft, min_altitude_ft, gun_info, dcs_unit_name) VALUES
                ('zsu23', 'ZSU-23-4 Shilka', 'ZSU-23-4', 'AAA', 1.5, 0, 5000, 0, '{"caliber_mm":23,"rateOfFire_rpm":3400,"muzzleVelocity_mps":970,"effectiveRange_m":2500,"radarGuided":true}', 'ZSU-23-4'),
                ('zsu57', 'ZSU-57-2', NULL, 'AAA', 2.2, 0, 8500, 0, '{"caliber_mm":57,"rateOfFire_rpm":240,"muzzleVelocity_mps":1000,"effectiveRange_m":4000,"radarGuided":false}', 'ZSU-57-2'),
                ('s60', 'S-60 57mm', NULL, 'AAA', 3.2, 0, 13000, 0, '{"caliber_mm":57,"rateOfFire_rpm":120,"muzzleVelocity_mps":1000,"effectiveRange_m":6000,"radarGuided":false}', 'S-60');

                -- MANPADS
                INSERT INTO threat_systems (id, name, nato_designation, type, max_range_nm, min_range_nm, max_altitude_ft, min_altitude_ft, missile_speed_mach, dcs_unit_name) VALUES
                ('sa18', '9K38 Igla', 'SA-18 Grouse', 'MANPADS', 2.8, 0.1, 11500, 30, 2.0, 'SA-18 Igla'),
                ('stinger', 'FIM-92 Stinger', 'Stinger', 'MANPADS', 2.5, 0.1, 12500, 30, 2.2, 'Stinger');

                -- EWR
                INSERT INTO threat_systems (id, name, nato_designation, type, max_range_nm, min_range_nm, max_altitude_ft, min_altitude_ft, radar_info, dcs_unit_name) VALUES
                ('ewr1l13', '1L13 Nebo-SV', 'Tall Rack', 'EWR', 200, 0, 100000, 0, '{"type":"PD","trackWhileScan":true}', '1L13'),
                ('ewr55g6', '55G6 Nebo', 'Tall Rack', 'EWR', 220, 0, 100000, 0, '{"type":"PD","trackWhileScan":true}', '55G6');

                -- ── Reference DB v3 ────────────────────────────────────────
                -- Two kinds of gap. Some of these are in the NTTR mission and
                -- the tool could not name them; the rest were already named by
                -- DCS_THREAT_RULES but had no row here, so they imported as
                -- Unknown and the frontend dropped them. A test now asserts
                -- every rule resolves to a row, so the two cannot drift again.
                --
                -- Only the five fields anything reads are filled: name, NATO
                -- designation, type, max range, max altitude. Speculative
                -- columns are left NULL rather than invented -- no number here
                -- should read as fact when it is a guess. Ranges are DCS
                -- in-game performance, which is what a DCS planner needs;
                -- real-world figures differ by variant and source.
                INSERT INTO threat_systems (id, name, nato_designation, type, max_range_nm, min_range_nm, max_altitude_ft, min_altitude_ft, radar_info, dcs_unit_name, notes) VALUES
                ('sa5', 'S-200 Vega', 'SA-5 Gammon', 'SAM', 130, 9, 130000, 1000, '{"type":"CW","trackWhileScan":false}', 'S-200', 'DCS site: S-200_Launcher + RPC_5N62V (Square Pair FCR) + RLS_19J6. Range/altitude from DCS in-game performance. min_range_nm is stored but nothing draws it yet.'),
                ('sa13', '9K35 Strela-10', 'SA-13 Gopher', 'SHORAD', 2.7, 0.4, 11500, 30, '{"type":"IR","trackWhileScan":false}', 'Strela-10', 'DCS Strela-10M3. IR-guided, no engagement radar -- it can shoot without warning you.'),
                ('hawk', 'MIM-23 Hawk', NULL, 'SAM', 22, 1, 59000, 100, '{"type":"CW","trackWhileScan":false}', 'Hawk', 'DCS Hawk battery (launcher + PCP + TR/SR). Envelope from DCS in-game performance.'),
                ('patriot', 'MIM-104 Patriot', NULL, 'SAM', 86, 2, 78000, 200, '{"type":"PD","trackWhileScan":true}', 'Patriot', 'DCS Patriot battery. Envelope from DCS in-game performance.'),
                ('nasams', 'NASAMS', NULL, 'SHORAD', 13, 0.5, 49000, 100, '{"type":"PD","trackWhileScan":true}', 'NASAMS', 'DCS NASAMS with AIM-120B/C. Envelope from DCS in-game performance.'),
                ('roland', 'Roland ADS', NULL, 'SHORAD', 3.4, 0.3, 18000, 60, '{"type":"PD","trackWhileScan":true}', 'Roland', 'DCS Roland ADS. Envelope from DCS in-game performance.'),
                ('rapier', 'Rapier FSA', NULL, 'SHORAD', 3.8, 0.3, 10000, 50, '{"type":"PD","trackWhileScan":false}', 'Rapier', 'DCS Rapier FSA (launcher + blindfire/optical tracker). Envelope from DCS in-game performance.'),
                ('chaparral', 'MIM-72 Chaparral', NULL, 'SHORAD', 4.3, 0.3, 9800, 50, '{"type":"IR","trackWhileScan":false}', 'Chaparral', 'DCS M48 Chaparral. IR-guided, no engagement radar.');

                INSERT INTO threat_systems (id, name, nato_designation, type, max_range_nm, min_range_nm, max_altitude_ft, min_altitude_ft, gun_info, dcs_unit_name, notes) VALUES
                ('zu23', 'ZU-23-2', NULL, 'AAA', 1.35, 0, 5000, 0, '{"caliber_mm":23,"rateOfFire_rpm":2000,"muzzleVelocity_mps":970,"effectiveRange_m":2500,"radarGuided":false}', 'ZU-23', 'Towed and truck-mounted (DCS Ural-375 ZU-23, and the Insurgent variant). Optically aimed.'),
                ('gepard', 'Flakpanzer Gepard', NULL, 'AAA', 1.9, 0, 9800, 0, '{"caliber_mm":35,"rateOfFire_rpm":1100,"muzzleVelocity_mps":1175,"effectiveRange_m":3500,"radarGuided":true}', 'Gepard', 'DCS Gepard. Radar-directed twin 35 mm.'),
                ('vulcan', 'M163 VADS', NULL, 'AAA', 1.1, 0, 4000, 0, '{"caliber_mm":20,"rateOfFire_rpm":3000,"muzzleVelocity_mps":1030,"effectiveRange_m":2000,"radarGuided":true}', 'Vulcan', 'DCS M163 Vulcan. Radar-ranged M61.');

                INSERT INTO threat_systems (id, name, nato_designation, type, max_range_nm, min_range_nm, max_altitude_ft, min_altitude_ft, radar_info, dcs_unit_name, notes) VALUES
                ('p19', 'P-19 Danube', 'Flat Face', 'EWR', 86, 0, 100000, 0, '{"type":"pulse","trackWhileScan":false}', 'P-19', 'Acquisition radar for S-75 and S-125 sites, so it usually sits ON a SAM site rather than alone. max_range_nm is DETECTION range, not an engagement envelope -- it cannot shoot at you, and the card ranks it behind anything that can.');
            "#)?;

            // Seed weapons
            conn.execute_batch(r#"
                INSERT INTO weapons (id, name, category, weight_lbs, drag_index, guidance, min_release_alt_ft, max_release_alt_ft, min_release_speed_ktas, max_release_speed_ktas, frag_lethal_radius_ft, frag_effective_radius_ft, frag_min_safe_alt_ft, dcs_weapon_name, notes) VALUES
                ('mk82', 'Mk-82 LDGP', 'bomb_unguided', 500, 0.027, 'none', 3000, 40000, 350, 550, 150, 400, 3000, 'Mk_82', '500lb low-drag GP bomb'),
                ('mk82air', 'Mk-82 AIR', 'bomb_unguided', 570, 0.032, 'none', 200, 20000, 350, 550, 150, 400, 500, 'Mk_82AIR', 'High-drag retarded delivery'),
                ('mk82se', 'Mk-82 Snakeye', 'bomb_unguided', 560, 0.030, 'none', 200, 20000, 350, 550, 150, 400, 500, 'Mk_82SE', 'Retarded bomb with fins'),
                ('mk84', 'Mk-84 LDGP', 'bomb_unguided', 2000, 0.024, 'none', 4500, 40000, 350, 550, 300, 800, 4500, 'Mk_84', '2000lb low-drag GP bomb'),
                ('gbu12', 'GBU-12 Paveway II', 'bomb_guided', 600, 0.028, 'laser', 3000, 35000, 350, 550, 150, 400, 3000, 'GBU_12', '500lb LGB'),
                ('gbu10', 'GBU-10 Paveway II', 'bomb_guided', 2100, 0.025, 'laser', 4500, 40000, 350, 550, 300, 800, 4500, 'GBU_10', '2000lb LGB'),
                ('gbu24', 'GBU-24 Paveway III', 'bomb_guided', 2100, 0.025, 'laser', 4500, 45000, 350, 550, 300, 800, 4500, 'GBU_24', '2000lb LGB with improved guidance'),
                ('gbu31', 'GBU-31 JDAM', 'bomb_gps', 2115, 0.024, 'gps', 3000, 45000, 350, 550, 300, 800, 4500, 'GBU_31', '2000lb GPS guided'),
                ('gbu38', 'GBU-38 JDAM', 'bomb_gps', 550, 0.027, 'gps', 2500, 45000, 350, 550, 150, 400, 3000, 'GBU_38', '500lb GPS guided'),
                ('cbu87', 'CBU-87 CEM', 'cluster', 950, 0.030, 'none', 500, 40000, 350, 550, NULL, 1000, 500, 'CBU_87', 'Combined Effects Munition'),
                ('cbu97', 'CBU-97 SFW', 'cluster', 920, 0.030, 'none', 500, 40000, 350, 550, NULL, 1200, 500, 'CBU_97', 'Sensor Fuzed Weapon'),
                ('agm65d', 'AGM-65D Maverick', 'missile_agm', 485, NULL, 'ir', 500, 25000, 300, 500, 100, 300, NULL, 'AGM_65D', 'IR Maverick'),
                ('agm65g', 'AGM-65G Maverick', 'missile_agm', 670, NULL, 'ir', 500, 25000, 300, 500, 200, 500, NULL, 'AGM_65G', 'Heavy warhead IR Maverick'),
                ('agm65h', 'AGM-65H Maverick', 'missile_agm', 485, NULL, 'tv', 500, 25000, 300, 500, 100, 300, NULL, 'AGM_65H', 'CCD TV Maverick'),
                ('agm65k', 'AGM-65K Maverick', 'missile_agm', 793, NULL, 'tv', 500, 25000, 300, 500, 200, 500, NULL, 'AGM_65K', 'Heavy CCD Maverick'),
                ('agm88c', 'AGM-88C HARM', 'missile_agm', 800, NULL, 'radar', 1000, 45000, 400, 600, 50, 150, NULL, 'AGM_88', 'Anti-radiation missile'),
                ('agm154a', 'AGM-154A JSOW', 'standoff', 1000, NULL, 'gps', 5000, 40000, 400, 550, NULL, 800, NULL, 'AGM_154A', 'GPS glide weapon with submunitions'),
                ('agm154c', 'AGM-154C JSOW', 'standoff', 1100, NULL, 'gps', 5000, 40000, 400, 550, 200, 600, NULL, 'AGM_154C', 'GPS glide weapon with unitary warhead');

                -- Guns and rockets (DB v4), for the strafe and rocket profiles.
                -- Name and class only: every release, speed and frag column is
                -- NULL, so the delivery profile's own numbers stand, and weight 0
                -- means "not tracked". Which aircraft carries which is in
                -- aircraft_weapons below.
                INSERT INTO weapons (id, name, category, weight_lbs, drag_index, guidance, min_release_alt_ft, max_release_alt_ft, min_release_speed_ktas, max_release_speed_ktas, frag_lethal_radius_ft, frag_effective_radius_ft, frag_min_safe_alt_ft, dcs_weapon_name, notes) VALUES
                ('gau8', 'GAU-8/A 30 mm', 'gun', 0, NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'A-10C internal gun'),
                ('mk12gun', 'Mk 12 20 mm', 'gun', 0, NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'A-4E-C internal guns'),
                ('defa553', 'DEFA 553 30 mm', 'gun', 0, NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Mirage F1 internal guns'),
                ('m39', 'M39A2 20 mm', 'gun', 0, NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'F-5E internal guns'),
                ('hydra70', 'Hydra 70 2.75" rockets', 'rocket', 0, NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'LAU-68 / LAU-131 pods'),
                ('ffar275', '2.75" FFAR rockets (LAU-3/A)', 'rocket', 0, NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Mk 4 FFAR in LAU-3/A pods'),
                ('zuni', 'Zuni 5" rockets (LAU-10)', 'rocket', 0, NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'LAU-10 pods'),
                ('sneb68', 'SNEB 68 mm rockets', 'rocket', 0, NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Matra pods');
            "#)?;

            // Seed fuze options
            conn.execute_batch(r#"
                INSERT INTO fuze_options (id, weapon_id, name, type, arming_delay_sec, burst_height_ft) VALUES
                ('mk82_nose', 'mk82', 'M904 Nose', 'nose', NULL, NULL),
                ('mk82_tail', 'mk82', 'M905 Tail', 'tail', 4.0, NULL),
                ('mk82_tail_8', 'mk82', 'M905 Tail (8s)', 'tail', 8.0, NULL),
                ('mk82_prox', 'mk82', 'FMU-113 Proximity', 'proximity', NULL, 50),
                ('mk84_nose', 'mk84', 'M904 Nose', 'nose', NULL, NULL),
                ('mk84_tail', 'mk84', 'M905 Tail', 'tail', 6.0, NULL),
                ('mk84_tail_14', 'mk84', 'M905 Tail (14s)', 'tail', 14.0, NULL),
                ('gbu12_nose', 'gbu12', 'M904 Nose', 'nose', NULL, NULL),
                ('gbu12_tail', 'gbu12', 'M905 Tail', 'tail', 4.0, NULL);
            "#)?;

            // Seed aircraft
            conn.execute_batch(r#"
                -- ids must match normalizeAircraftType in src/stores/missionStore.ts
                -- and the aircraftId in each src-tauri/resources/profiles/*.json
                INSERT INTO aircraft (id, name, dcs_module_name, max_speed_ktas, stall_speed_ktas, max_g, service_ceiling_ft, kneeboard_path) VALUES
                ('f16c', 'F-16C Viper', 'F-16C_50', 1200, 130, 9.0, 50000, 'F-16C'),
                ('f18c', 'F/A-18C Hornet', 'FA-18C_hornet', 1034, 125, 7.5, 50000, 'FA-18C'),
                ('a10c', 'A-10C II Warthog', 'A-10C_2', 380, 120, 6.0, 45000, 'A-10C'),
                ('f15e', 'F-15E Strike Eagle', 'F-15ESE', 1434, 130, 9.0, 60000, 'F-15E'),
                ('f4e', 'F-4E Phantom II', 'F-4E-45MC', 1260, 150, 7.0, 55000, 'F-4E-45MC'),
                ('a4ec', 'A-4E-C Skyhawk', 'A-4E-C', 585, 120, 7.0, 40000, 'A-4E-C'),
                ('f5e', 'F-5E Tiger II', 'F-5E-3', 940, 140, 7.3, 50000, 'F-5E-3'),
                ('f14', 'F-14A/B Tomcat', 'F-14B', 1350, 120, 7.5, 50000, 'F-14B'),
                ('f1', 'Mirage F1', 'Mirage-F1CE', 1250, 140, 7.0, 52000, 'Mirage-F1CE'),
                ('av8b', 'AV-8B Harrier II', 'AV8BNA', 585, 100, 7.0, 43000, 'AV8BNA');
            "#)?;

            // Seed aircraft-weapon compatibility (F-16C)
            conn.execute_batch(r#"
                INSERT INTO aircraft_weapons (aircraft_id, weapon_id, station, max_quantity) VALUES
                ('f16c', 'mk82', 3, 3), ('f16c', 'mk82', 4, 1), ('f16c', 'mk82', 6, 1), ('f16c', 'mk82', 7, 3),
                ('f16c', 'mk84', 3, 1), ('f16c', 'mk84', 4, 1), ('f16c', 'mk84', 6, 1), ('f16c', 'mk84', 7, 1),
                ('f16c', 'gbu12', 3, 2), ('f16c', 'gbu12', 4, 1), ('f16c', 'gbu12', 6, 1), ('f16c', 'gbu12', 7, 2),
                ('f16c', 'gbu10', 3, 1), ('f16c', 'gbu10', 7, 1),
                ('f16c', 'gbu24', 4, 1), ('f16c', 'gbu24', 6, 1),
                ('f16c', 'gbu31', 4, 1), ('f16c', 'gbu31', 6, 1),
                ('f16c', 'gbu38', 3, 2), ('f16c', 'gbu38', 4, 1), ('f16c', 'gbu38', 6, 1), ('f16c', 'gbu38', 7, 2),
                ('f16c', 'cbu87', 3, 2), ('f16c', 'cbu87', 7, 2),
                ('f16c', 'cbu97', 3, 2), ('f16c', 'cbu97', 7, 2),
                ('f16c', 'agm65d', 3, 3), ('f16c', 'agm65d', 7, 3),
                ('f16c', 'agm65g', 3, 3), ('f16c', 'agm65g', 7, 3),
                ('f16c', 'agm65h', 3, 3), ('f16c', 'agm65h', 7, 3),
                ('f16c', 'agm65k', 3, 3), ('f16c', 'agm65k', 7, 3),
                ('f16c', 'agm88c', 3, 1), ('f16c', 'agm88c', 4, 1), ('f16c', 'agm88c', 6, 1), ('f16c', 'agm88c', 7, 1),
                ('f16c', 'agm154a', 3, 1), ('f16c', 'agm154a', 7, 1),
                ('f16c', 'agm154c', 3, 1), ('f16c', 'agm154c', 7, 1);

                -- Guns and rockets per aircraft (DB v4). Station 0 = not
                -- modelled; the row only says the aircraft carries it.
                INSERT INTO aircraft_weapons (aircraft_id, weapon_id, station) VALUES
                ('a10c', 'gau8', 0), ('a10c', 'hydra70', 0),
                ('a4ec', 'mk12gun', 0), ('a4ec', 'ffar275', 0), ('a4ec', 'zuni', 0),
                ('f1', 'defa553', 0), ('f1', 'sneb68', 0),
                ('f5e', 'm39', 0), ('f5e', 'hydra70', 0),
                ('f4e', 'hydra70', 0), ('f4e', 'ffar275', 0), ('f4e', 'zuni', 0);
            "#)?;
        }

        Ok(())
    }

    // =========================================================================
    // Query methods
    // =========================================================================

    /// Get all threat systems
    pub fn get_all_threats(&self) -> SqliteResult<Vec<ThreatSystem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, nato_designation, type, max_range_nm, min_range_nm,
                    max_altitude_ft, min_altitude_ft, optimal_altitude_ft, missile_speed_mach,
                    reload_time_sec, simultaneous_engagements, reaction_time_sec,
                    radar_info, gun_info, dcs_unit_name, notes
             FROM threat_systems ORDER BY type, name"
        )?;

        let threats = stmt.query_map([], |row| {
            Ok(ThreatSystem {
                id: row.get(0)?,
                name: row.get(1)?,
                nato_designation: row.get(2)?,
                threat_type: row.get(3)?,
                max_range_nm: row.get(4)?,
                min_range_nm: row.get(5)?,
                max_altitude_ft: row.get(6)?,
                min_altitude_ft: row.get(7)?,
                optimal_altitude_ft: row.get(8)?,
                missile_speed_mach: row.get(9)?,
                reload_time_sec: row.get(10)?,
                simultaneous_engagements: row.get(11)?,
                reaction_time_sec: row.get(12)?,
                radar_info: row.get(13)?,
                gun_info: row.get(14)?,
                dcs_unit_name: row.get(15)?,
                notes: row.get(16)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(threats)
    }

    /// Get threats by type
    pub fn get_threats_by_type(&self, threat_type: &str) -> SqliteResult<Vec<ThreatSystem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, nato_designation, type, max_range_nm, min_range_nm,
                    max_altitude_ft, min_altitude_ft, optimal_altitude_ft, missile_speed_mach,
                    reload_time_sec, simultaneous_engagements, reaction_time_sec,
                    radar_info, gun_info, dcs_unit_name, notes
             FROM threat_systems WHERE type = ? ORDER BY name"
        )?;

        let threats = stmt.query_map([threat_type], |row| {
            Ok(ThreatSystem {
                id: row.get(0)?,
                name: row.get(1)?,
                nato_designation: row.get(2)?,
                threat_type: row.get(3)?,
                max_range_nm: row.get(4)?,
                min_range_nm: row.get(5)?,
                max_altitude_ft: row.get(6)?,
                min_altitude_ft: row.get(7)?,
                optimal_altitude_ft: row.get(8)?,
                missile_speed_mach: row.get(9)?,
                reload_time_sec: row.get(10)?,
                simultaneous_engagements: row.get(11)?,
                reaction_time_sec: row.get(12)?,
                radar_info: row.get(13)?,
                gun_info: row.get(14)?,
                dcs_unit_name: row.get(15)?,
                notes: row.get(16)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(threats)
    }

    /// Get threat by ID
    pub fn get_threat_by_id(&self, id: &str) -> SqliteResult<Option<ThreatSystem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, nato_designation, type, max_range_nm, min_range_nm,
                    max_altitude_ft, min_altitude_ft, optimal_altitude_ft, missile_speed_mach,
                    reload_time_sec, simultaneous_engagements, reaction_time_sec,
                    radar_info, gun_info, dcs_unit_name, notes
             FROM threat_systems WHERE id = ?"
        )?;

        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(ThreatSystem {
                id: row.get(0)?,
                name: row.get(1)?,
                nato_designation: row.get(2)?,
                threat_type: row.get(3)?,
                max_range_nm: row.get(4)?,
                min_range_nm: row.get(5)?,
                max_altitude_ft: row.get(6)?,
                min_altitude_ft: row.get(7)?,
                optimal_altitude_ft: row.get(8)?,
                missile_speed_mach: row.get(9)?,
                reload_time_sec: row.get(10)?,
                simultaneous_engagements: row.get(11)?,
                reaction_time_sec: row.get(12)?,
                radar_info: row.get(13)?,
                gun_info: row.get(14)?,
                dcs_unit_name: row.get(15)?,
                notes: row.get(16)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get all weapons
    pub fn get_all_weapons(&self) -> SqliteResult<Vec<Weapon>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!("SELECT {WEAPON_COLUMNS} FROM weapons w ORDER BY w.category, w.name"))?;
        let weapons = stmt.query_map([], weapon_from_row)?.collect::<Result<Vec<_>, _>>()?;
        Ok(weapons)
    }

    /// Get a specific weapon by ID
    pub fn get_weapon_by_id(&self, id: &str) -> SqliteResult<Option<Weapon>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!("SELECT {WEAPON_COLUMNS} FROM weapons w WHERE w.id = ?1"))?;
        let mut rows = stmt.query([id])?;
        match rows.next()? {
            Some(row) => Ok(Some(weapon_from_row(row)?)),
            None => Ok(None),
        }
    }

    /// Get weapons for a specific aircraft
    pub fn get_weapons_for_aircraft(&self, aircraft_id: &str) -> SqliteResult<Vec<Weapon>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!(
            "SELECT {WEAPON_COLUMNS} FROM weapons w
             WHERE w.id IN (SELECT weapon_id FROM aircraft_weapons WHERE aircraft_id = ?)
             ORDER BY w.category, w.name"
        ))?;
        let weapons = stmt.query_map([aircraft_id], weapon_from_row)?.collect::<Result<Vec<_>, _>>()?;
        Ok(weapons)
    }

    /// Get fuze options for a weapon
    pub fn get_fuze_options(&self, weapon_id: &str) -> SqliteResult<Vec<FuzeOption>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, weapon_id, name, type, arming_delay_sec, burst_height_ft
             FROM fuze_options WHERE weapon_id = ? ORDER BY name"
        )?;

        let fuzes = stmt.query_map([weapon_id], |row| {
            Ok(FuzeOption {
                id: row.get(0)?,
                weapon_id: row.get(1)?,
                name: row.get(2)?,
                fuze_type: row.get(3)?,
                arming_delay_sec: row.get(4)?,
                burst_height_ft: row.get(5)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(fuzes)
    }

    /// Get all aircraft
    pub fn get_all_aircraft(&self) -> SqliteResult<Vec<Aircraft>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, dcs_module_name, max_speed_ktas, stall_speed_ktas, max_g,
                    service_ceiling_ft, kneeboard_path
             FROM aircraft ORDER BY name"
        )?;

        let aircraft = stmt.query_map([], |row| {
            Ok(Aircraft {
                id: row.get(0)?,
                name: row.get(1)?,
                dcs_module_name: row.get(2)?,
                max_speed_ktas: row.get(3)?,
                stall_speed_ktas: row.get(4)?,
                max_g: row.get(5)?,
                service_ceiling_ft: row.get(6)?,
                kneeboard_path: row.get(7)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(aircraft)
    }

    /// Get aircraft by ID
    pub fn get_aircraft_by_id(&self, id: &str) -> SqliteResult<Option<Aircraft>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, dcs_module_name, max_speed_ktas, stall_speed_ktas, max_g,
                    service_ceiling_ft, kneeboard_path
             FROM aircraft WHERE id = ?"
        )?;

        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Aircraft {
                id: row.get(0)?,
                name: row.get(1)?,
                dcs_module_name: row.get(2)?,
                max_speed_ktas: row.get(3)?,
                stall_speed_ktas: row.get(4)?,
                max_g: row.get(5)?,
                service_ceiling_ft: row.get(6)?,
                kneeboard_path: row.get(7)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get threat system by DCS unit name
    ///
    /// Looks up a threat system by its dcs_unit_name field, which should match
    /// the normalized name from threat_mapping module.
    pub fn get_threat_by_dcs_name(&self, dcs_name: &str) -> SqliteResult<Option<ThreatSystem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, nato_designation, type, max_range_nm, min_range_nm,
                    max_altitude_ft, min_altitude_ft, optimal_altitude_ft, missile_speed_mach,
                    reload_time_sec, simultaneous_engagements, reaction_time_sec,
                    radar_info, gun_info, dcs_unit_name, notes
             FROM threat_systems WHERE dcs_unit_name = ? COLLATE NOCASE"
        )?;

        let mut rows = stmt.query([dcs_name])?;
        if let Some(row) = rows.next()? {
            Ok(Some(ThreatSystem {
                id: row.get(0)?,
                name: row.get(1)?,
                nato_designation: row.get(2)?,
                threat_type: row.get(3)?,
                max_range_nm: row.get(4)?,
                min_range_nm: row.get(5)?,
                max_altitude_ft: row.get(6)?,
                min_altitude_ft: row.get(7)?,
                optimal_altitude_ft: row.get(8)?,
                missile_speed_mach: row.get(9)?,
                reload_time_sec: row.get(10)?,
                simultaneous_engagements: row.get(11)?,
                reaction_time_sec: row.get(12)?,
                radar_info: row.get(13)?,
                gun_info: row.get(14)?,
                dcs_unit_name: row.get(15)?,
                notes: row.get(16)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Search for threat systems by partial DCS name match
    ///
    /// Useful for fuzzy matching when exact match fails
    pub fn search_threats_by_dcs_name(&self, search_term: &str) -> SqliteResult<Vec<ThreatSystem>> {
        let conn = self.conn.lock().unwrap();
        let search_pattern = format!("%{}%", search_term);
        let mut stmt = conn.prepare(
            "SELECT id, name, nato_designation, type, max_range_nm, min_range_nm,
                    max_altitude_ft, min_altitude_ft, optimal_altitude_ft, missile_speed_mach,
                    reload_time_sec, simultaneous_engagements, reaction_time_sec,
                    radar_info, gun_info, dcs_unit_name, notes
             FROM threat_systems
             WHERE dcs_unit_name LIKE ? COLLATE NOCASE
                OR name LIKE ? COLLATE NOCASE
                OR nato_designation LIKE ? COLLATE NOCASE
             ORDER BY name"
        )?;

        let threats = stmt.query_map([&search_pattern, &search_pattern, &search_pattern], |row| {
            Ok(ThreatSystem {
                id: row.get(0)?,
                name: row.get(1)?,
                nato_designation: row.get(2)?,
                threat_type: row.get(3)?,
                max_range_nm: row.get(4)?,
                min_range_nm: row.get(5)?,
                max_altitude_ft: row.get(6)?,
                min_altitude_ft: row.get(7)?,
                optimal_altitude_ft: row.get(8)?,
                missile_speed_mach: row.get(9)?,
                reload_time_sec: row.get(10)?,
                simultaneous_engagements: row.get(11)?,
                reaction_time_sec: row.get(12)?,
                radar_info: row.get(13)?,
                gun_info: row.get(14)?,
                dcs_unit_name: row.get(15)?,
                notes: row.get(16)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(threats)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_database_and_seed() {
        let db = Database::open_in_memory().expect("Failed to create database");

        let threats = db.get_all_threats().expect("Failed to get threats");
        assert!(!threats.is_empty(), "Threats should be seeded");

        let weapons = db.get_all_weapons().expect("Failed to get weapons");
        assert!(!weapons.is_empty(), "Weapons should be seeded");

        let aircraft = db.get_all_aircraft().expect("Failed to get aircraft");
        assert!(!aircraft.is_empty(), "Aircraft should be seeded");
    }

    #[test]
    fn test_get_weapons_for_f16() {
        let db = Database::open_in_memory().expect("Failed to create database");
        let weapons = db.get_weapons_for_aircraft("f16c").expect("Failed to get F-16 weapons");
        assert!(!weapons.is_empty(), "F-16 should have weapons");
    }

    #[test]
    fn test_get_threat_by_dcs_name() {
        let db = Database::open_in_memory().expect("Failed to create database");

        // Test exact match
        let threat = db.get_threat_by_dcs_name("Buk").expect("Query failed");
        assert!(threat.is_some(), "Should find Buk by dcs_unit_name");
        let threat = threat.unwrap();
        assert_eq!(threat.id, "sa11");

        // Test case insensitivity
        let threat = db.get_threat_by_dcs_name("buk").expect("Query failed");
        assert!(threat.is_some(), "Should find buk case-insensitively");
    }

    /// The reference database and the DCS unit-name rules are two tables that
    /// have to agree, and they had silently drifted: eight systems (Gepard,
    /// Roland, Hawk, Patriot, NASAMS, Rapier, Strela-10, P-19) were named by
    /// the rules with no row here, so they imported as Unknown and the frontend
    /// dropped them. Discipline did not prevent that. This does.
    #[test]
    fn every_mapping_rule_resolves_to_a_database_row() {
        let db = Database::open_in_memory().expect("Failed to create database");
        let mut missing: Vec<&str> = Vec::new();
        for (pattern, normalized) in crate::parsers::threat_mapping::DCS_THREAT_RULES {
            match db.get_threat_by_dcs_name(normalized) {
                Ok(Some(_)) => {}
                _ => missing.push(pattern),
            }
        }
        assert!(
            missing.is_empty(),
            "these DCS_THREAT_RULES patterns name a system with no threat_systems row: {missing:?}"
        );
    }

    /// What the "Reference database is v2, rebuilding as v3" console line is
    /// really claiming: that new seed rows actually reach a database that
    /// already exists. Seeding only runs on empty tables, so without the
    /// version bump an existing install would keep its old 15 threats forever.
    #[test]
    fn a_stale_database_is_rebuilt_with_the_v3_threat_rows() {
        let path = std::env::temp_dir().join(format!("pw_v3_upgrade_{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);

        // Stand up a database that looks like an existing v2 install: the new
        // rows absent, and user_version pinned back to 2.
        {
            let db = Database::open(&path).expect("create");
            let conn = db.conn.lock().unwrap();
            conn.execute_batch(
                "DELETE FROM threat_systems WHERE id IN ('sa5','sa13','zu23','p19','hawk','patriot','nasams','roland','rapier','gepard','chaparral','vulcan');
                 PRAGMA user_version = 2;",
            )
            .unwrap();
            assert!(
                conn.query_row("SELECT COUNT(*) FROM threat_systems WHERE id = 'sa5'", [], |r| r.get::<_, i32>(0)).unwrap() == 0,
                "test setup: the v2 database must not already have the SA-5"
            );
        }

        // Reopening must notice the stale version, drop and reseed.
        let db = Database::open(&path).expect("reopen");
        let version: i32 = db
            .conn
            .lock()
            .unwrap()
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION, "user_version was not bumped");
        for name in ["S-200", "Strela-10", "ZU-23", "P-19"] {
            assert!(
                db.get_threat_by_dcs_name(name).unwrap().is_some(),
                "{name} did not reach the rebuilt database"
            );
        }
        let _ = std::fs::remove_file(&path);
    }

    /// Every ground unit the real NTTR Red Flag mission carries that is a
    /// threat, in DCS's exact spelling, must reach a named row. Before DB v3
    /// the S-200 site, the Strela-10s, the ZU-23 trucks and the P-19s all fell
    /// out here -- and `RPC_5N62V`, the Square Pair that does the shooting, was
    /// not even flagged as a threat.
    #[test]
    fn every_threat_unit_in_the_nttr_mission_resolves_to_a_row() {
        use crate::parsers::threat_mapping::normalize_dcs_unit_name;
        let db = Database::open_in_memory().expect("Failed to create database");
        let units = [
            "S_75M_Volhov", "SNR_75V",
            "5p73 s-125 ln", "snr s-125 tr", "p-19 s-125 sr",
            "Kub 2P25 ln", "Kub 1S91 str",
            "S-300PS 5P85D ln", "S-300PS 5P85C ln", "S-300PS 40B6M tr",
            "S-300PS 40B6MD sr", "S-300PS 64H6E sr", "S-300PS 54K6 cp",
            "SA-11 Buk LN 9A310M1", "SA-11 Buk SR 9S18M1", "SA-11 Buk CC 9S470M1",
            "Tor 9A331",
            "S-200_Launcher", "RPC_5N62V", "RLS_19J6",
            "Strela-10M3",
            "Ural-375 ZU-23", "Ural-375 ZU-23 Insurgent",
            "ZSU-23-4 Shilka", "ZSU_57_2",
            "SA-18 Igla-S manpad", "SA-18 Igla-S comm",
        ];
        let mut unresolved: Vec<&str> = Vec::new();
        for unit in units {
            let row = normalize_dcs_unit_name(unit)
                .and_then(|n| db.get_threat_by_dcs_name(n).ok().flatten());
            if row.is_none() {
                unresolved.push(unit);
            }
        }
        assert!(
            unresolved.is_empty(),
            "these real NTTR threat units do not reach a database row: {unresolved:?}"
        );
    }

    #[test]
    fn test_search_threats_by_dcs_name() {
        let db = Database::open_in_memory().expect("Failed to create database");

        // Search by partial name
        let threats = db.search_threats_by_dcs_name("SA-").expect("Query failed");
        assert!(!threats.is_empty(), "Should find threats with SA- prefix");

        // Search by partial NATO designation
        let threats = db.search_threats_by_dcs_name("Guideline").expect("Query failed");
        assert!(!threats.is_empty(), "Should find SA-2 Guideline");
    }
}
