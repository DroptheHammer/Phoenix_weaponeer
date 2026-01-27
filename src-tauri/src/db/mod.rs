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

impl Database {
    /// Open or create the database at the given path
    pub fn open<P: AsRef<Path>>(path: P) -> SqliteResult<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn: Mutex::new(conn) };
        db.initialize_tables()?;
        db.seed_data_if_empty()?;
        Ok(db)
    }

    /// Open an in-memory database (for testing)
    pub fn open_in_memory() -> SqliteResult<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn: Mutex::new(conn) };
        db.initialize_tables()?;
        db.seed_data_if_empty()?;
        Ok(db)
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
                INSERT INTO aircraft (id, name, dcs_module_name, max_speed_ktas, stall_speed_ktas, max_g, service_ceiling_ft, kneeboard_path) VALUES
                ('f16c', 'F-16C Viper', 'F-16C_50', 1200, 130, 9.0, 50000, 'F-16C'),
                ('f18c', 'F/A-18C Hornet', 'FA-18C_hornet', 1034, 125, 7.5, 50000, 'FA-18C'),
                ('a10c', 'A-10C Warthog', 'A-10C_2', 380, 120, 6.0, 45000, 'A-10C'),
                ('f15e', 'F-15E Strike Eagle', 'F-15ESE', 1434, 130, 9.0, 60000, 'F-15E');
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
        let mut stmt = conn.prepare(
            "SELECT id, name, category, weight_lbs, drag_index, guidance,
                    min_release_alt_ft, max_release_alt_ft, min_release_speed_ktas, max_release_speed_ktas,
                    frag_lethal_radius_ft, frag_effective_radius_ft, frag_min_safe_alt_ft,
                    dcs_weapon_name, notes
             FROM weapons ORDER BY category, name"
        )?;

        let weapons = stmt.query_map([], |row| {
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
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(weapons)
    }

    /// Get weapons for a specific aircraft
    pub fn get_weapons_for_aircraft(&self, aircraft_id: &str) -> SqliteResult<Vec<Weapon>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT DISTINCT w.id, w.name, w.category, w.weight_lbs, w.drag_index, w.guidance,
                    w.min_release_alt_ft, w.max_release_alt_ft, w.min_release_speed_ktas, w.max_release_speed_ktas,
                    w.frag_lethal_radius_ft, w.frag_effective_radius_ft, w.frag_min_safe_alt_ft,
                    w.dcs_weapon_name, w.notes
             FROM weapons w
             INNER JOIN aircraft_weapons aw ON w.id = aw.weapon_id
             WHERE aw.aircraft_id = ?
             ORDER BY w.category, w.name"
        )?;

        let weapons = stmt.query_map([aircraft_id], |row| {
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
            })
        })?.collect::<Result<Vec<_>, _>>()?;

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
}
