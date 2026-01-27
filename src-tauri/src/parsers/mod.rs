//! File parsers module
//!
//! Handles parsing of DCS .miz files and other import formats.

use std::fs::File;
use std::io::Read;
use std::path::Path;
use thiserror::Error;
use zip::ZipArchive;

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

/// Theater coordinate parameters for DCS map conversion
#[derive(Debug, Clone)]
pub struct TheaterParams {
    pub lat_origin: f64,
    pub lon_origin: f64,
    pub meters_per_deg_lat: f64,
    pub meters_per_deg_lon: f64,
}

impl TheaterParams {
    /// Get parameters for a specific theater
    pub fn for_theater(theater: &str) -> Option<Self> {
        match theater {
            "caucasus" => Some(Self {
                lat_origin: 42.0,
                lon_origin: 43.0,
                meters_per_deg_lat: 111000.0,
                meters_per_deg_lon: 82000.0,
            }),
            "persian_gulf" => Some(Self {
                lat_origin: 26.0,
                lon_origin: 56.0,
                meters_per_deg_lat: 111000.0,
                meters_per_deg_lon: 100000.0,
            }),
            "syria" => Some(Self {
                lat_origin: 35.0,
                lon_origin: 36.0,
                meters_per_deg_lat: 111000.0,
                meters_per_deg_lon: 91000.0,
            }),
            _ => None,
        }
    }
}

/// Convert DCS map coordinates to lat/lon
pub fn dcs_to_latlon(x: f64, y: f64, params: &TheaterParams) -> (f64, f64) {
    let lat = params.lat_origin + (y / params.meters_per_deg_lat);
    let lon = params.lon_origin + (x / params.meters_per_deg_lon);
    (lat, lon)
}
