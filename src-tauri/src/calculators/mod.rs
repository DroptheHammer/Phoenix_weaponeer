//! Attack profile calculators module
//!
//! Provides calculations for various attack profiles including popup CCIP,
//! level CCRP, dive bombing, and threat exposure analysis.

use serde::{Deserialize, Serialize};

/// Result of popup CCIP attack calculation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PopupCCIPResult {
    pub climb_angle_deg: f64,
    pub apex_altitude_msl: f64,
    pub roll_in_altitude_agl: f64,
    pub release_altitude_agl: f64,
    pub release_speed_ktas: f64,
    pub min_safe_altitude_agl: f64,
    pub pullout_altitude_agl: f64,
    pub time_to_release_sec: f64,
}

/// Weapon parameters for ballistic calculations
#[derive(Debug, Clone)]
pub struct WeaponParams {
    pub weight_lbs: f64,
    pub drag_index: f64,
    pub min_release_alt_ft: f64,
    pub frag_min_safe_alt_ft: Option<f64>,
}

/// Calculate popup CCIP attack profile parameters
pub fn calculate_popup_ccip(
    target_elevation_ft: f64,
    run_in_altitude_agl: f64,
    run_in_speed_ktas: f64,
    pop_distance_nm: f64,
    apex_altitude_agl: f64,
    dive_angle_deg: f64,
    weapon: &WeaponParams,
) -> PopupCCIPResult {
    // Convert to consistent units
    let apex_alt_msl = target_elevation_ft + apex_altitude_agl;

    // Calculate climb parameters
    let altitude_gain = apex_altitude_agl - run_in_altitude_agl;
    let pop_distance_ft = pop_distance_nm * 6076.0;
    let climb_angle_deg = (altitude_gain / pop_distance_ft).atan().to_degrees();

    // Calculate roll-in point (typically 85% of apex)
    let roll_in_altitude_agl = apex_altitude_agl * 0.85;

    // Calculate release parameters based on dive angle and weapon ballistics
    let release_altitude_agl = calculate_release_altitude(dive_angle_deg, run_in_speed_ktas, weapon);

    // Minimum safe altitude (frag deconfliction)
    let min_safe_altitude_agl = weapon
        .frag_min_safe_alt_ft
        .unwrap_or(release_altitude_agl * 0.9);

    // Pullout altitude (buffer for recovery)
    let pullout_altitude_agl = release_altitude_agl - 500.0;

    // Speed builds in dive
    let release_speed_ktas = run_in_speed_ktas + 30.0;

    // Estimate time to release (simplified)
    let time_to_release_sec = estimate_time_to_release(
        pop_distance_nm,
        apex_altitude_agl,
        release_altitude_agl,
        run_in_speed_ktas,
    );

    PopupCCIPResult {
        climb_angle_deg,
        apex_altitude_msl: apex_alt_msl,
        roll_in_altitude_agl,
        release_altitude_agl,
        release_speed_ktas,
        min_safe_altitude_agl,
        pullout_altitude_agl,
        time_to_release_sec,
    }
}

/// Calculate release altitude based on dive angle and weapon
fn calculate_release_altitude(
    dive_angle_deg: f64,
    speed_ktas: f64,
    weapon: &WeaponParams,
) -> f64 {
    // Simplified ballistic calculation
    // In reality, this would use detailed drag coefficients and integration
    let base_altitude = match dive_angle_deg as i32 {
        0..=15 => 1500.0,  // Shallow dive
        16..=30 => 3500.0, // Medium dive
        31..=45 => 4500.0, // Steep dive
        _ => 6000.0,       // Very steep dive
    };

    // Adjust for speed (faster = lower release possible)
    let speed_factor = speed_ktas / 450.0;
    let adjusted = base_altitude / speed_factor;

    // Ensure above minimum
    adjusted.max(weapon.min_release_alt_ft)
}

/// Estimate time from pop to release
fn estimate_time_to_release(
    pop_distance_nm: f64,
    apex_altitude_agl: f64,
    release_altitude_agl: f64,
    speed_ktas: f64,
) -> f64 {
    // Convert speed to ft/sec
    let speed_fps = speed_ktas * 6076.0 / 3600.0;

    // Climb phase
    let climb_distance_ft = pop_distance_nm * 6076.0;
    let climb_time = climb_distance_ft / speed_fps;

    // Dive phase (simplified)
    let dive_altitude = apex_altitude_agl - release_altitude_agl;
    let dive_speed_fps = speed_fps * 1.1; // Speed increases in dive
    let dive_time = dive_altitude / (dive_speed_fps * 0.7); // Factor for dive angle

    climb_time + dive_time
}

/// Risk level assessment
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Extreme,
}

impl RiskLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            RiskLevel::Low => "low",
            RiskLevel::Medium => "medium",
            RiskLevel::High => "high",
            RiskLevel::Extreme => "extreme",
        }
    }
}

/// Assess risk level based on distance to threat
pub fn assess_risk_level(distance_nm: f64, max_range_nm: f64) -> RiskLevel {
    let ratio = distance_nm / max_range_nm;
    match ratio {
        r if r > 0.8 => RiskLevel::Low,
        r if r > 0.5 => RiskLevel::Medium,
        r if r > 0.3 => RiskLevel::High,
        _ => RiskLevel::Extreme,
    }
}

/// Threat exposure calculation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatExposure {
    pub threat_id: String,
    pub threat_name: String,
    pub min_distance_nm: f64,
    pub exposure_time_sec: f64,
    pub risk_level: RiskLevel,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_popup_ccip_calculation() {
        let weapon = WeaponParams {
            weight_lbs: 500.0,
            drag_index: 0.027,
            min_release_alt_ft: 3000.0,
            frag_min_safe_alt_ft: Some(3000.0),
        };

        let result = calculate_popup_ccip(
            1000.0,  // target elevation
            200.0,   // run-in altitude AGL
            450.0,   // run-in speed
            3.0,     // pop distance nm
            8000.0,  // apex altitude AGL
            30.0,    // dive angle
            &weapon,
        );

        assert!(result.climb_angle_deg > 0.0);
        assert!(result.release_altitude_agl >= weapon.min_release_alt_ft);
    }

    #[test]
    fn test_risk_assessment() {
        assert_eq!(assess_risk_level(45.0, 50.0), RiskLevel::Low);
        assert_eq!(assess_risk_level(30.0, 50.0), RiskLevel::Medium);
        assert_eq!(assess_risk_level(20.0, 50.0), RiskLevel::High);
        assert_eq!(assess_risk_level(10.0, 50.0), RiskLevel::Extreme);
    }
}
