//! Export module
//!
//! Handles rendering kneeboard cards to PNG and exporting to DCS folders.

use image::{Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

/// Kneeboard dimensions (DCS standard)
pub const KNEEBOARD_WIDTH: u32 = 768;
pub const KNEEBOARD_HEIGHT: u32 = 1024;

#[derive(Error, Debug)]
pub enum ExportError {
    #[error("Image error: {0}")]
    Image(#[from] image::ImageError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Render error: {0}")]
    Render(String),
}

/// Colors for kneeboard rendering
pub struct KneeboardColors {
    pub background: Rgba<u8>,
    pub text: Rgba<u8>,
    pub header_bg: Rgba<u8>,
    pub divider: Rgba<u8>,
    pub highlight: Rgba<u8>,
}

impl Default for KneeboardColors {
    fn default() -> Self {
        Self {
            background: Rgba([252, 250, 245, 255]), // Off-white
            text: Rgba([20, 20, 20, 255]),          // Near-black
            header_bg: Rgba([60, 60, 80, 255]),     // Dark blue-gray
            divider: Rgba([180, 180, 180, 255]),    // Light gray
            highlight: Rgba([200, 50, 50, 255]),    // Red accent
        }
    }
}

/// Kneeboard card data for rendering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KneeboardCardData {
    pub callsign: String,
    pub mission_date: String,
    pub target_name: String,
    pub target_coords: String,
    pub target_elevation_ft: i32,
    pub threats: Vec<ThreatItem>,
    pub attack_profile: String,
    pub attack_params: Vec<(String, String)>,
    pub weapon_name: String,
    pub weapon_quantity: i32,
    pub fuze: String,
    pub release_mode: String,
    pub egress_heading: i32,
    pub egress_waypoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatItem {
    pub name: String,
    pub bearing: i32,
    pub distance_nm: f64,
    pub range_nm: f64,
}

/// Render a kneeboard card to an image
pub fn render_kneeboard(card: &KneeboardCardData) -> Result<RgbaImage, ExportError> {
    let colors = KneeboardColors::default();
    let mut img = RgbaImage::new(KNEEBOARD_WIDTH, KNEEBOARD_HEIGHT);

    // Fill background
    fill_rect(&mut img, 0, 0, KNEEBOARD_WIDTH, KNEEBOARD_HEIGHT, colors.background);

    // Draw header (placeholder - would use rusttype for text)
    fill_rect(&mut img, 0, 0, KNEEBOARD_WIDTH, 60, colors.header_bg);

    // Draw section dividers
    let divider_y_positions = [60, 210, 360, 610, 760, 910];
    for &y in &divider_y_positions {
        draw_horizontal_line(&mut img, y, colors.divider);
    }

    // TODO: Add text rendering with rusttype
    // For now, this creates a template image

    let _ = card; // Suppress unused warning until text rendering is implemented

    Ok(img)
}

/// Save kneeboard image to file
pub fn save_kneeboard<P: AsRef<Path>>(
    img: &RgbaImage,
    path: P,
) -> Result<(), ExportError> {
    img.save(path)?;
    Ok(())
}

/// Export kneeboard to DCS folder
pub fn export_to_dcs<P: AsRef<Path>>(
    img: &RgbaImage,
    dcs_saved_games: P,
    aircraft: &str,
    filename: &str,
) -> Result<std::path::PathBuf, ExportError> {
    let kneeboard_dir = dcs_saved_games
        .as_ref()
        .join("Kneeboard")
        .join(aircraft);

    std::fs::create_dir_all(&kneeboard_dir)?;

    let full_path = kneeboard_dir.join(format!("{}.png", filename));
    save_kneeboard(img, &full_path)?;

    Ok(full_path)
}

/// Fill a rectangle with a solid color
fn fill_rect(img: &mut RgbaImage, x: u32, y: u32, width: u32, height: u32, color: Rgba<u8>) {
    for py in y..(y + height).min(img.height()) {
        for px in x..(x + width).min(img.width()) {
            img.put_pixel(px, py, color);
        }
    }
}

/// Draw a horizontal line
fn draw_horizontal_line(img: &mut RgbaImage, y: u32, color: Rgba<u8>) {
    if y < img.height() {
        for x in 0..img.width() {
            img.put_pixel(x, y, color);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_kneeboard() {
        let card = KneeboardCardData {
            callsign: "Viper 1".to_string(),
            mission_date: "2024-01-15".to_string(),
            target_name: "SA-10 Battery".to_string(),
            target_coords: "N 41°23'45\" E 044°12'34\"".to_string(),
            target_elevation_ft: 1500,
            threats: vec![ThreatItem {
                name: "SA-10".to_string(),
                bearing: 270,
                distance_nm: 15.0,
                range_nm: 47.0,
            }],
            attack_profile: "Popup CCIP".to_string(),
            attack_params: vec![
                ("Run-in Alt".to_string(), "200' AGL".to_string()),
                ("Pop Distance".to_string(), "3.0 nm".to_string()),
                ("Apex Alt".to_string(), "8000' AGL".to_string()),
            ],
            weapon_name: "Mk-82 LDGP".to_string(),
            weapon_quantity: 2,
            fuze: "M905 Tail (4s delay)".to_string(),
            release_mode: "Pair".to_string(),
            egress_heading: 270,
            egress_waypoint: Some("STPT 5".to_string()),
        };

        let img = render_kneeboard(&card).expect("Failed to render kneeboard");
        assert_eq!(img.width(), KNEEBOARD_WIDTH);
        assert_eq!(img.height(), KNEEBOARD_HEIGHT);
    }
}
