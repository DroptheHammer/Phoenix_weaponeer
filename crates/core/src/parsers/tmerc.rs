//! Transverse Mercator on the WGS84 ellipsoid, in pure Rust.
//!
//! Every DCS theater's grid is a plain `+proj=tmerc` (see `THEATER_PARAMS`),
//! so this replaces the C++ PROJ library, which could not be built for the
//! browser (WebAssembly) and needed CMake on every CI runner.
//!
//! The math is the Krüger series in the third flattening `n`, as in Karney,
//! "Transverse Mercator with an accuracy of a few nanometers" (2011), which is
//! also what PROJ's default `tmerc` uses. Terms up to `n³` are kept: the first
//! term dropped is about 1e-11 of the radius, well under a millimetre anywhere
//! inside a DCS map. Latitude is recovered from the conformal latitude by
//! iteration, which is exact to machine precision.

use std::f64::consts::FRAC_PI_4;

/// WGS84 semi-major axis, metres.
const A: f64 = 6_378_137.0;
/// WGS84 flattening.
const F: f64 = 1.0 / 298.257_223_563;

/// A transverse Mercator grid: the parameters of a `+proj=tmerc` string.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tmerc {
    /// Central meridian, degrees.
    pub lon_0: f64,
    /// Scale factor on the central meridian.
    pub k_0: f64,
    /// False easting, metres.
    pub x_0: f64,
    /// False northing, metres.
    pub y_0: f64,
}

impl Tmerc {
    /// Read a proj4 string such as
    /// `+proj=tmerc +lon_0=33 +k_0=0.9996 +x_0=-99517 +y_0=-4998115`.
    ///
    /// Anything this implementation does not model is refused rather than
    /// ignored, so a new theater with, say, a non-zero `lat_0` or a different
    /// ellipsoid fails loudly instead of converting to the wrong place.
    pub fn from_proj4(s: &str) -> Result<Self, String> {
        let mut is_tmerc = false;
        let mut t = Tmerc { lon_0: 0.0, k_0: 1.0, x_0: 0.0, y_0: 0.0 };

        for token in s.split_whitespace() {
            let token = token.strip_prefix('+').ok_or_else(|| format!("unexpected '{token}' in '{s}'"))?;
            let (key, value) = match token.split_once('=') {
                Some((k, v)) => (k, Some(v)),
                None => (token, None),
            };
            let number = || -> Result<f64, String> {
                value
                    .and_then(|v| v.parse::<f64>().ok())
                    .filter(|v| v.is_finite())
                    .ok_or_else(|| format!("'{key}' needs a number in '{s}'"))
            };
            match key {
                "proj" if value == Some("tmerc") => is_tmerc = true,
                "lon_0" => t.lon_0 = number()?,
                // PROJ treats `+k` as an alias for `+k_0`.
                "k_0" | "k" => t.k_0 = number()?,
                "x_0" => t.x_0 = number()?,
                "y_0" => t.y_0 = number()?,
                "lat_0" if number()? == 0.0 => {}
                "ellps" | "datum" if value == Some("WGS84") => {}
                "units" if value == Some("m") => {}
                "no_defs" | "type=crs" => {}
                _ => return Err(format!("unsupported projection parameter '+{token}' in '{s}'")),
            }
        }

        if !is_tmerc {
            return Err(format!("not a transverse Mercator projection: '{s}'"));
        }
        if t.k_0 <= 0.0 {
            return Err(format!("scale factor must be positive in '{s}'"));
        }
        Ok(t)
    }

    /// Latitude/longitude (degrees) to grid easting/northing (metres).
    pub fn forward(&self, lat: f64, lon: f64) -> (f64, f64) {
        let s = Series::wgs84();
        let phi = lat.to_radians();
        let dlam = (lon - self.lon_0).to_radians();

        // Conformal latitude, as its tangent.
        let tau_c = (phi.sin().atanh() - s.e * (s.e * phi.sin()).atanh()).sinh();
        let xi_p = tau_c.atan2(dlam.cos());
        let eta_p = (dlam.sin() / (1.0 + tau_c * tau_c).sqrt()).atanh();

        let mut xi = xi_p;
        let mut eta = eta_p;
        for (j, alpha) in s.alpha.iter().enumerate() {
            let k = 2.0 * (j + 1) as f64;
            xi += alpha * (k * xi_p).sin() * (k * eta_p).cosh();
            eta += alpha * (k * xi_p).cos() * (k * eta_p).sinh();
        }

        let easting = self.x_0 + self.k_0 * s.big_a * eta;
        let northing = self.y_0 + self.k_0 * s.big_a * xi;
        (easting, northing)
    }

    /// Grid easting/northing (metres) to latitude/longitude (degrees).
    pub fn inverse(&self, easting: f64, northing: f64) -> (f64, f64) {
        let s = Series::wgs84();
        let xi = (northing - self.y_0) / (self.k_0 * s.big_a);
        let eta = (easting - self.x_0) / (self.k_0 * s.big_a);

        let mut xi_p = xi;
        let mut eta_p = eta;
        for (j, beta) in s.beta.iter().enumerate() {
            let k = 2.0 * (j + 1) as f64;
            xi_p -= beta * (k * xi).sin() * (k * eta).cosh();
            eta_p -= beta * (k * xi).cos() * (k * eta).sinh();
        }

        let chi = (xi_p.sin() / eta_p.cosh()).asin();
        let dlam = eta_p.sinh().atan2(xi_p.cos());

        // Conformal latitude back to geodetic latitude. Each pass shrinks the
        // error by about e², so this settles in a handful of iterations.
        let conformal = (FRAC_PI_4 + chi / 2.0).tan();
        let mut phi = chi;
        for _ in 0..20 {
            let es = s.e * phi.sin();
            let next = 2.0 * (conformal * ((1.0 + es) / (1.0 - es)).powf(s.e / 2.0)).atan()
                - std::f64::consts::FRAC_PI_2;
            let done = (next - phi).abs() < 1e-15;
            phi = next;
            if done {
                break;
            }
        }

        (phi.to_degrees(), self.lon_0 + dlam.to_degrees())
    }
}

/// The ellipsoid constants and series coefficients.
struct Series {
    e: f64,
    big_a: f64,
    alpha: [f64; 3],
    beta: [f64; 3],
}

impl Series {
    fn wgs84() -> Self {
        let n = F / (2.0 - F);
        let (n2, n3) = (n * n, n * n * n);
        Series {
            e: (F * (2.0 - F)).sqrt(),
            // Rectifying radius.
            big_a: A / (1.0 + n) * (1.0 + n2 / 4.0 + n2 * n2 / 64.0),
            alpha: [
                n / 2.0 - 2.0 * n2 / 3.0 + 5.0 * n3 / 16.0,
                13.0 * n2 / 48.0 - 3.0 * n3 / 5.0,
                61.0 * n3 / 240.0,
            ],
            beta: [
                n / 2.0 - 2.0 * n2 / 3.0 + 37.0 * n3 / 96.0,
                n2 / 48.0 + n3 / 15.0,
                17.0 * n3 / 480.0,
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_every_form_the_theater_table_uses() {
        let t = Tmerc::from_proj4("+proj=tmerc +lon_0=33 +k_0=0.9996 +x_0=-99517 +y_0=-4998115").unwrap();
        assert_eq!(t, Tmerc { lon_0: 33.0, k_0: 0.9996, x_0: -99517.0, y_0: -4998115.0 });

        let k_alias = Tmerc::from_proj4("+proj=tmerc +lon_0=21 +k=0.9996 +x_0=35427.62 +y_0=-6061633.128").unwrap();
        assert_eq!(k_alias.k_0, 0.9996);
        assert_eq!(k_alias.x_0, 35427.62);
    }

    #[test]
    fn refuses_what_it_does_not_model() {
        for bad in [
            "",
            "+proj=merc +lon_0=33",
            "+proj=tmerc +lat_0=10 +lon_0=33",
            "+proj=tmerc +ellps=intl +lon_0=33",
            "+proj=tmerc +lon_0=abc",
            "+proj=tmerc +k_0=0",
            "+proj=tmerc +towgs84=1,2,3",
            "proj=tmerc",
        ] {
            assert!(Tmerc::from_proj4(bad).is_err(), "should refuse '{bad}'");
        }
    }

    /// UTM zone 31N (lon_0 = 3, k_0 = 0.9996, x_0 = 500000) reference values.
    /// The origin of the zone maps to the false easting exactly, and the
    /// equator/central-meridian scale is k_0.
    #[test]
    fn central_meridian_and_equator() {
        let utm31 = Tmerc { lon_0: 3.0, k_0: 0.9996, x_0: 500_000.0, y_0: 0.0 };
        let (e, n) = utm31.forward(0.0, 3.0);
        assert!((e - 500_000.0).abs() < 1e-6 && n.abs() < 1e-6);

        // One degree of longitude along the equator, 3° from nothing: the arc
        // on the central meridian from 0° to 1° N is 110 574.389 m on WGS84.
        let (_, n1) = utm31.forward(1.0, 3.0);
        assert!((n1 - 0.9996 * 110_574.389).abs() < 0.01, "got {n1}");
    }

    #[test]
    fn round_trips_to_a_nanodegree_across_a_wide_band() {
        let t = Tmerc { lon_0: 57.0, k_0: 0.9996, x_0: 75_757.0, y_0: -2_894_931.0 };
        for lat in [-70.0, -45.0, -10.0, 0.0, 12.5, 26.0, 33.0, 51.0, 69.0] {
            for dlon in [-10.0, -4.0, -0.5, 0.0, 0.5, 4.0, 10.0] {
                let (e, n) = t.forward(lat, 57.0 + dlon);
                let (lat2, lon2) = t.inverse(e, n);
                assert!(
                    (lat2 - lat).abs() < 1e-9 && (lon2 - (57.0 + dlon)).abs() < 1e-9,
                    "({lat}, {dlon}) came back as ({lat2}, {lon2})"
                );
            }
        }
    }
}
