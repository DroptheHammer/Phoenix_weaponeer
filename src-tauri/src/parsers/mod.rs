//! File parsers module
//!
//! Handles parsing of DCS .miz files and other import formats.

pub mod coordinate_conversion;
pub mod fragorders;
pub mod threat_mapping;

use std::fs::File;
use std::io::Read;
use std::path::Path;
use thiserror::Error;
use zip::ZipArchive;

pub use coordinate_conversion::{
    all_theater_params, dcs_to_latlon, get_theater_params, meters_to_feet, mps_to_ktas,
    normalize_theater_name, supported_theater_names, TheaterCoordParams,
};
pub use fragorders::{
    parse_fragorders_json, FragOrdersMission, ProcessedCoordinates, ProcessedFragOrdersData,
    ProcessedPlayerGroup, ProcessedThreat, ProcessedTriggerZone, ProcessedUnit, ProcessedWaypoint,
    ThreatMatchConfidence,
};
pub use threat_mapping::{get_threat_info, is_threat_unit, normalize_dcs_unit_name};

#[derive(Error, Debug)]
pub enum ParseError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("ZIP error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("Lua parse error: {0}")]
    Lua(String),

    #[error("Invalid mission file: {0}")]
    InvalidMission(String),
}

/// Parser for DCS .miz files
pub struct MizParser {
    archive: ZipArchive<File>,
}

impl MizParser {
    /// Open a .miz file for parsing
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, ParseError> {
        let file = File::open(path)?;
        let archive = ZipArchive::new(file)?;
        Ok(Self { archive })
    }

    /// Read the main mission Lua file
    pub fn read_mission_lua(&mut self) -> Result<String, ParseError> {
        let mut mission_file = self.archive.by_name("mission")?;
        let mut contents = String::new();
        mission_file.read_to_string(&mut contents)?;
        Ok(contents)
    }

    /// Get list of files in the archive
    pub fn list_files(&mut self) -> Vec<String> {
        let mut names = Vec::new();
        for i in 0..self.archive.len() {
            if let Ok(file) = self.archive.by_index(i) {
                names.push(file.name().to_string());
            }
        }
        names
    }

    /// Extract waypoints for a specific group
    pub fn extract_waypoints(&mut self, _group_name: &str) -> Result<Vec<RawWaypoint>, ParseError> {
        // TODO: Implement Lua parsing with mlua
        // For now, return empty vec
        Ok(vec![])
    }

    /// Extract threat units from the mission
    pub fn extract_threats(&mut self) -> Result<Vec<RawThreat>, ParseError> {
        // TODO: Implement threat extraction
        Ok(vec![])
    }

    /// Get the theater/map name
    pub fn get_theater(&mut self) -> Result<String, ParseError> {
        let lua = self.read_mission_lua()?;
        // Simple string search for theatre field
        // TODO: Proper Lua parsing
        if lua.contains("Caucasus") {
            Ok("caucasus".to_string())
        } else if lua.contains("PersianGulf") {
            Ok("persian_gulf".to_string())
        } else if lua.contains("Syria") {
            Ok("syria".to_string())
        } else if lua.contains("Nevada") {
            Ok("nevada".to_string())
        } else {
            Ok("unknown".to_string())
        }
    }
}

/// Raw waypoint data extracted from .miz file
#[derive(Debug, Clone)]
pub struct RawWaypoint {
    pub x: f64,
    pub y: f64,
    pub alt: f64,
    pub name: String,
    pub wp_type: String,
    pub speed: f64,
}

/// Raw threat data extracted from .miz file
#[derive(Debug, Clone)]
pub struct RawThreat {
    pub x: f64,
    pub y: f64,
    pub unit_type: String,
    pub group_name: String,
}
