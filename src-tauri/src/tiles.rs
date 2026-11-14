//! Map and terrain tiles for the 3D strike playback, fetched and cached here.
//!
//! The playback draws real ground: OpenStreetMap tiles for the picture and
//! Terrarium elevation tiles for the heights. They come through these desktop
//! commands rather than the webview's `fetch`, so the app's content security
//! policy needs no new hosts, the cache works the same on every OS (and in a
//! release build, not only in `tauri dev`), and the heights are decoded here,
//! where `cargo test` pins the decode on exact pixel values instead of trusting
//! a canvas's colour handling.
//!
//! Tiles are kept in the app's cache folder, one PNG per tile:
//! `<app cache dir>/tiles/osm/z/x/y.png` and `<app cache dir>/tiles/terrarium/z/x/y.png`.
//! A copy that is too old is fetched again; with no network, the old copy is
//! still used.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};

/// The picture: the same OpenStreetMap host the kneeboard map layer uses.
pub const OSM_URL: &str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/// The heights: Mapzen's Terrarium tiles, a public dataset on AWS.
pub const TERRARIUM_URL: &str = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

/// What the JS side gets when the server has no such tile (403 or 404).
pub const MISSING: &str = "missing";

/// What the JS side gets when the tile server can't be reached: no network,
/// the host not found, or too slow. There was no cached copy to fall back on.
pub const OFFLINE: &str = "offline";

/// OpenStreetMap's tile policy asks for an agent that names the app. Only the
/// app and its version: nothing about the user or the machine.
const USER_AGENT: &str = concat!("PhoenixWeaponeer/", env!("CARGO_PKG_VERSION"));

const TIMEOUT: Duration = Duration::from_secs(15);

/// Real tiles are tens to a few hundred KB. Anything over this is not a tile.
const MAX_BODY_BYTES: u64 = 1_000_000;

/// Deeper than the playback ever asks for; it keeps a bad request from
/// building an absurd path or a flood of fetches.
pub const MAX_ZOOM: u32 = 15;

/// Terrarium tiles are 256 x 256 pixels, one height each.
pub const TILE_PIXELS: u32 = 256;

const DAY: Duration = Duration::from_secs(24 * 60 * 60);

/// The eight bytes every PNG file starts with.
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// The two kinds of tile, each with its own server, folder and shelf life.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TileKind {
    /// An OpenStreetMap picture tile, handed to the webview as PNG bytes.
    Map,
    /// A Terrarium elevation tile, handed over as decoded heights.
    Terrain,
}

impl TileKind {
    fn url_template(self) -> &'static str {
        match self {
            TileKind::Map => OSM_URL,
            TileKind::Terrain => TERRARIUM_URL,
        }
    }

    fn folder(self) -> &'static str {
        match self {
            TileKind::Map => "osm",
            TileKind::Terrain => "terrarium",
        }
    }

    /// OpenStreetMap asks clients to keep tiles at least 7 days; the ground's
    /// heights don't change, so a year is plenty.
    pub fn max_age(self) -> Duration {
        match self {
            TileKind::Map => 7 * DAY,
            TileKind::Terrain => 365 * DAY,
        }
    }

    /// Turn a tile's PNG into what the webview gets, refusing anything that
    /// isn't a real tile, so a broken download is never cached or drawn.
    fn prepare(self, png: &[u8]) -> Result<Vec<u8>, String> {
        match self {
            TileKind::Map => {
                if png.starts_with(PNG_SIGNATURE) {
                    Ok(png.to_vec())
                } else {
                    Err("The map tile was not a PNG image".to_string())
                }
            }
            TileKind::Terrain => terrain_tile_bytes(png),
        }
    }
}

/// A tile's address, checked. The only way to make one is `TileKey::new`, so
/// every path and URL is built from numbers known to be in range.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TileKey {
    z: u32,
    x: u32,
    y: u32,
}

impl TileKey {
    /// A tile exists only when x and y are below 2^z.
    pub fn new(z: u32, x: u32, y: u32) -> Result<TileKey, String> {
        if z > MAX_ZOOM {
            return Err(format!("Tile zoom {z} is deeper than {MAX_ZOOM}"));
        }
        let side = 1u32 << z;
        if x >= side || y >= side {
            return Err(format!("There is no tile {z}/{x}/{y}"));
        }
        Ok(TileKey { z, x, y })
    }

    fn url(self, template: &str) -> String {
        template
            .replace("{z}", &self.z.to_string())
            .replace("{x}", &self.x.to_string())
            .replace("{y}", &self.y.to_string())
    }
}

/// Where a tile lives in the cache: `<root>/tiles/<osm|terrarium>/z/x/y.png`.
pub fn cache_path(root: &Path, kind: TileKind, key: TileKey) -> PathBuf {
    root.join("tiles")
        .join(kind.folder())
        .join(key.z.to_string())
        .join(key.x.to_string())
        .join(format!("{}.png", key.y))
}

/// What to do about one tile request.
#[derive(Debug, PartialEq)]
pub enum Decision<T> {
    /// The cached copy is young enough; nothing was fetched.
    Fresh,
    /// A new copy came down: use it and cache it.
    Fetched(T),
    /// The fetch failed (the reason is kept), but there is an older copy: use that.
    Stale(String),
    /// The fetch failed and there is no copy at all.
    Fail(String),
}

/// The whole caching rule, with no files or network in it so it can be tested
/// case by case. `cache_age` is `None` when there is no usable copy. `fetch`
/// is only called when the copy is missing or too old.
pub fn decide<T>(
    cache_age: Option<Duration>,
    fetch: impl FnOnce() -> Result<T, String>,
    max_age: Duration,
) -> Decision<T> {
    if matches!(cache_age, Some(age) if age < max_age) {
        return Decision::Fresh;
    }
    match fetch() {
        Ok(tile) => Decision::Fetched(tile),
        Err(reason) if cache_age.is_some() => Decision::Stale(reason),
        Err(reason) => Decision::Fail(reason),
    }
}

/// The cached copy, if there is one that still reads as a real tile, with its
/// age and what the webview gets from it. A file dated in the future (the
/// clock was changed) counts as old, so it is fetched again rather than kept
/// for ever.
fn read_cached(path: &Path, kind: TileKind) -> Option<(Duration, Vec<u8>)> {
    let png = std::fs::read(path).ok()?;
    let prepared = kind.prepare(&png).ok()?;
    let modified = std::fs::metadata(path).and_then(|m| m.modified()).ok();
    let age = modified
        .and_then(|m| SystemTime::now().duration_since(m).ok())
        .unwrap_or(Duration::MAX);
    Some((age, prepared))
}

/// Written to a temporary file and renamed into place, so a crash mid-write
/// can't leave half a tile that then reads as damaged. The temporary name is
/// unique, because the webview asks for many tiles at once and the same tile
/// can be asked for twice.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let tmp = path.with_extension(format!("png.{}.{n}.tmp", std::process::id()));
    std::fs::write(&tmp, bytes).map_err(|e| format!("Cannot write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Cannot replace {}: {e}", path.display())
    })
}

/// One tile, from the cache or the server. `download` is the network GET
/// (`download` below in the app; a stand-in in tests). Failing to cache a tile
/// that did download isn't an error: the playback still gets it.
pub fn get_tile(
    cache_root: &Path,
    kind: TileKind,
    key: TileKey,
    download: impl FnOnce(&str) -> Result<Vec<u8>, String>,
) -> Result<Vec<u8>, String> {
    let path = cache_path(cache_root, kind, key);
    let cached = read_cached(&path, kind);
    let fetch = || {
        let png = download(&key.url(kind.url_template()))?;
        let prepared = kind.prepare(&png)?;
        Ok((png, prepared))
    };
    match decide(cached.as_ref().map(|(age, _)| *age), fetch, kind.max_age()) {
        Decision::Fresh | Decision::Stale(_) => Ok(cached.map(|(_, prepared)| prepared).unwrap_or_default()),
        Decision::Fetched((png, prepared)) => {
            if let Err(e) = write_atomic(&path, &png) {
                eprintln!("tile not cached: {e}");
            }
            Ok(prepared)
        }
        Decision::Fail(reason) => Err(reason),
    }
}

/// One agent for every tile, so connections to the two hosts are reused
/// across the many tiles a playback asks for. Set up like the FragOrders link
/// download: HTTPS only, no redirects, and HTTP errors read as status codes.
fn agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::Agent::config_builder()
            .timeout_global(Some(TIMEOUT))
            .https_only(true)
            .max_redirects(0)
            .http_status_as_error(false)
            .user_agent(USER_AGENT)
            .build()
            .into()
    })
}

/// The status words JS branches on; any other failure is a plain sentence.
fn status_error(status: u16) -> Option<String> {
    match status {
        200..=299 => None,
        403 | 404 => Some(MISSING.to_string()),
        other => Some(format!("The tile server answered {other}")),
    }
}

/// The network failures that mean "no connection" rather than a fault.
fn is_offline(error: &ureq::Error) -> bool {
    matches!(
        error,
        ureq::Error::HostNotFound | ureq::Error::ConnectionFailed | ureq::Error::Io(_) | ureq::Error::Timeout(_)
    )
}

/// One HTTPS GET of a tile's PNG.
pub fn download(url: &str) -> Result<Vec<u8>, String> {
    let mut response = agent().get(url).call().map_err(|e| {
        if is_offline(&e) {
            OFFLINE.to_string()
        } else {
            format!("Couldn't download the tile: {e}")
        }
    })?;
    if let Some(error) = status_error(response.status().as_u16()) {
        return Err(error);
    }
    response
        .body_mut()
        .with_config()
        .limit(MAX_BODY_BYTES)
        .read_to_vec()
        .map_err(|e| match e {
            ureq::Error::BodyExceedsLimit(_) => "The tile was too large".to_string(),
            e if is_offline(&e) => OFFLINE.to_string(),
            other => format!("The tile download was cut short: {other}"),
        })
}

/// A decoded Terrarium tile: heights in metres, row by row from the top-left.
#[derive(Debug, PartialEq)]
pub struct Heights {
    pub width: u32,
    pub height: u32,
    pub metres: Vec<f32>,
}

/// Terrarium packs a height into a pixel's colour:
/// `metres = r*256 + g + b/256 - 32768`. Only plain 8-bit RGB or RGBA is
/// accepted: a palette or 16-bit image would decode to colours that are not
/// that packing, and give wrong heights silently. No clamping here: below sea
/// level stays negative, and the playback decides what to do with it.
///
/// Every step is exact in f32 (at most 16 whole bits plus 8 fractional ones),
/// so the tests can compare with `==`.
pub fn decode_terrarium(png_bytes: &[u8]) -> Result<Heights, String> {
    let mut decoder = png::Decoder::new(png_bytes);
    // No conversions: what is checked below is what the pixels are.
    decoder.set_transformations(png::Transformations::IDENTITY);
    let mut reader = decoder.read_info().map_err(|e| format!("The terrain tile is not a readable PNG: {e}"))?;
    let info = reader.info();
    let channels = match (info.color_type, info.bit_depth) {
        (png::ColorType::Rgb, png::BitDepth::Eight) => 3,
        (png::ColorType::Rgba, png::BitDepth::Eight) => 4,
        (color, depth) => {
            return Err(format!(
                "The terrain tile is {color:?} at {depth:?} bits; heights need 8-bit RGB or RGBA"
            ))
        }
    };
    let mut buffer = vec![0u8; reader.output_buffer_size()];
    let frame = reader
        .next_frame(&mut buffer)
        .map_err(|e| format!("The terrain tile is damaged: {e}"))?;
    let (width, height) = (frame.width, frame.height);
    let mut metres = Vec::with_capacity(width as usize * height as usize);
    for row in buffer.chunks_exact(frame.line_size).take(height as usize) {
        for pixel in row.chunks_exact(channels).take(width as usize) {
            let (r, g, b) = (pixel[0] as f32, pixel[1] as f32, pixel[2] as f32);
            metres.push(r * 256.0 + g + b / 256.0 - 32768.0);
        }
    }
    Ok(Heights { width, height, metres })
}

/// What `get_terrain_tile` hands the webview: 256 x 256 heights as
/// little-endian f32, row by row from the top-left, which JS reads straight
/// into a `Float32Array`. A tile of any other size is refused, so the JS side
/// can count on 65536 values.
pub fn terrain_tile_bytes(png_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let heights = decode_terrarium(png_bytes)?;
    if heights.width != TILE_PIXELS || heights.height != TILE_PIXELS {
        return Err(format!(
            "The terrain tile is {} x {} pixels, not {TILE_PIXELS} x {TILE_PIXELS}",
            heights.width, heights.height
        ));
    }
    Ok(heights.metres.iter().flat_map(|m| m.to_le_bytes()).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    /// A fresh, empty scratch folder per test.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("phoenix_tiles_{}_{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A PNG made here, so the decode is checked on known bytes, not on a
    /// file that could drift.
    fn encode(width: u32, height: u32, color: png::ColorType, depth: png::BitDepth, data: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut out, width, height);
            encoder.set_color(color);
            encoder.set_depth(depth);
            if color == png::ColorType::Indexed {
                encoder.set_palette(vec![128u8, 0, 0, 129, 2, 128]);
            }
            let mut writer = encoder.write_header().unwrap();
            writer.write_image_data(data).unwrap();
        }
        out
    }

    /// The four reference pixels, as a 2 x 2 image, in the given layout.
    fn reference_png(color: png::ColorType) -> Vec<u8> {
        let pixels: [[u8; 3]; 4] = [[128, 0, 0], [129, 2, 128], [128, 0, 1], [0, 0, 0]];
        let data: Vec<u8> = pixels
            .iter()
            .flat_map(|p| match color {
                png::ColorType::Rgba => vec![p[0], p[1], p[2], 255],
                _ => p.to_vec(),
            })
            .collect();
        encode(2, 2, color, png::BitDepth::Eight, &data)
    }

    // Proven red: with `- 32768.0` changed to `- 32767.0` in decode_terrarium,
    // "assertion `left == right` failed: Rgb  left: [1.0, 259.5, 1.0039063, -32767.0]".
    #[test]
    fn terrarium_decodes_exactly_from_rgb_and_rgba() {
        for color in [png::ColorType::Rgb, png::ColorType::Rgba] {
            let heights = decode_terrarium(&reference_png(color)).expect("decodes");
            assert_eq!((heights.width, heights.height), (2, 2));
            // (128,0,0) is sea level, (129,2,128) 258.5 m, (128,0,1) one
            // 256th of a metre, and black the lowest height there is.
            assert_eq!(heights.metres, vec![0.0, 258.5, 1.0 / 256.0, -32768.0], "{color:?}");
        }
    }

    // Proven red: with the Rgba arm reading `=> 3` instead of `=> 4`,
    // "assertion `left == right` failed  left: 32641.008  right: 258.5" (the
    // alpha byte read as colour).
    #[test]
    fn rgba_skips_the_alpha_byte() {
        let heights = decode_terrarium(&reference_png(png::ColorType::Rgba)).unwrap();
        assert_eq!(heights.metres[1], 258.5);
        assert_eq!(heights.metres[3], -32768.0);
    }

    // Proven red: with the Rgb arm matching any depth, "a 16-bit tile was
    // accepted"; with `| (png::ColorType::Indexed, _)` added to it, "a palette
    // tile was accepted".
    #[test]
    fn a_16_bit_palette_or_grey_tile_is_refused() {
        let sixteen = encode(1, 1, png::ColorType::Rgb, png::BitDepth::Sixteen, &[128, 0, 0, 0, 0, 0]);
        assert!(decode_terrarium(&sixteen).is_err(), "a 16-bit tile was accepted");
        let palette = encode(2, 1, png::ColorType::Indexed, png::BitDepth::Eight, &[0, 1]);
        assert!(decode_terrarium(&palette).is_err(), "a palette tile was accepted");
        let grey = encode(1, 1, png::ColorType::Grayscale, png::BitDepth::Eight, &[128]);
        assert!(decode_terrarium(&grey).is_err(), "a grey tile was accepted");
        assert!(decode_terrarium(b"not a png").is_err());
    }

    /// A whole 256 x 256 tile of one colour.
    fn full_tile(rgb: [u8; 3]) -> Vec<u8> {
        let data: Vec<u8> = (0..TILE_PIXELS * TILE_PIXELS).flat_map(|_| rgb).collect();
        encode(TILE_PIXELS, TILE_PIXELS, png::ColorType::Rgb, png::BitDepth::Eight, &data)
    }

    // Proven red: with `to_le_bytes` changed to `to_be_bytes`,
    // "left: [67, 129, 64, 0]  right: [0, 64, 129, 67]"; with the size check's
    // `||` changed to `&&`, "a 256 x 2 tile was accepted".
    #[test]
    fn a_terrain_tile_is_65536_little_endian_floats() {
        let bytes = terrain_tile_bytes(&full_tile([129, 2, 128])).expect("a full tile");
        assert_eq!(bytes.len(), 65536 * 4);
        assert_eq!(bytes[..4], 258.5f32.to_le_bytes());
        assert_eq!(f32::from_le_bytes(bytes[bytes.len() - 4..].try_into().unwrap()), 258.5);
        // A tile of the wrong size is refused, so JS can count on 65536 values.
        assert!(terrain_tile_bytes(&reference_png(png::ColorType::Rgb)).is_err(), "a 2 x 2 tile was accepted");
        let wide: Vec<u8> = (0..TILE_PIXELS * 2).flat_map(|_| [128u8, 0, 0]).collect();
        let wide = encode(TILE_PIXELS, 2, png::ColorType::Rgb, png::BitDepth::Eight, &wide);
        assert!(terrain_tile_bytes(&wide).is_err(), "a 256 x 2 tile was accepted");
    }

    // Proven red: with `x >= side || y >= side` changed to `x > side || y > side`,
    // "x = 2^z was accepted"; with `z > MAX_ZOOM` changed to `z > MAX_ZOOM + 1`,
    // "zoom 16 was accepted".
    #[test]
    fn a_tile_key_must_be_a_real_tile() {
        assert!(TileKey::new(0, 0, 0).is_ok());
        assert!(TileKey::new(15, 32767, 32767).is_ok());
        assert!(TileKey::new(16, 0, 0).is_err(), "zoom 16 was accepted");
        assert!(TileKey::new(3, 8, 0).is_err(), "x = 2^z was accepted");
        assert!(TileKey::new(3, 0, 8).is_err(), "y = 2^z was accepted");
        assert!(TileKey::new(3, 7, 7).is_ok());
        assert!(TileKey::new(u32::MAX, 0, 0).is_err(), "a huge zoom was accepted");
    }

    const WEEK: Duration = Duration::from_secs(7 * 24 * 60 * 60);

    /// A fetch that remembers it was called.
    fn counted<'a, T: 'a>(calls: &'a Cell<u32>, result: Result<T, String>) -> impl FnOnce() -> Result<T, String> + 'a {
        move || {
            calls.set(calls.get() + 1);
            result
        }
    }

    // Proven red: with `age < max_age` changed to `age <= max_age`,
    // "a copy exactly max_age old must be fetched again  left: Fresh  right:
    // Fetched(3)"; with the stale arm returning `Decision::Fail(reason)`,
    // "left: Fail(\"offline\")  right: Stale(\"offline\")".
    #[test]
    fn decide_covers_every_case() {
        let calls = Cell::new(0);
        let young = Some(WEEK - Duration::from_secs(1));
        let old = Some(WEEK + Duration::from_secs(1));

        // A fresh copy is used and the network is never touched.
        assert_eq!(decide(young, counted(&calls, Ok(1)), WEEK), Decision::Fresh);
        assert_eq!(calls.get(), 0);

        // Old, or exactly as old as allowed: fetched again.
        assert_eq!(decide(old, counted(&calls, Ok(2)), WEEK), Decision::Fetched(2));
        assert_eq!(
            decide(Some(WEEK), counted(&calls, Ok(3)), WEEK),
            Decision::Fetched(3),
            "a copy exactly max_age old must be fetched again"
        );
        // No copy: fetched.
        assert_eq!(decide(None, counted(&calls, Ok(4)), WEEK), Decision::Fetched(4));
        assert_eq!(calls.get(), 3);

        // Fetch failed: the old copy if there is one, else the error.
        assert_eq!(
            decide::<u8>(old, counted(&calls, Err(OFFLINE.into())), WEEK),
            Decision::Stale(OFFLINE.into())
        );
        assert_eq!(
            decide::<u8>(None, counted(&calls, Err(MISSING.into())), WEEK),
            Decision::Fail(MISSING.into())
        );
    }

    // Proven red: with `.join(kind.folder())` removed from cache_path,
    // "left: \"cache-root/tiles/12/2470/1497.png\"  right:
    // \"cache-root/tiles/osm/12/2470/1497.png\"".
    #[test]
    fn the_cache_layout_is_tiles_kind_z_x_y() {
        let root = Path::new("cache-root");
        let key = TileKey::new(12, 2470, 1497).unwrap();
        assert_eq!(
            cache_path(root, TileKind::Map, key),
            Path::new("cache-root/tiles/osm/12/2470/1497.png")
        );
        assert_eq!(
            cache_path(root, TileKind::Terrain, key),
            Path::new("cache-root/tiles/terrarium/12/2470/1497.png")
        );
        assert_eq!(key.url(OSM_URL), "https://tile.openstreetmap.org/12/2470/1497.png");
        assert_eq!(
            key.url(TERRARIUM_URL),
            "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/2470/1497.png"
        );
        assert_eq!(TileKind::Map.max_age(), WEEK);
        assert_eq!(TileKind::Terrain.max_age(), Duration::from_secs(365 * 24 * 60 * 60));
    }

    /// A pretend map tile: just enough to pass the PNG check.
    fn map_png(tag: &[u8]) -> Vec<u8> {
        [PNG_SIGNATURE, tag].concat()
    }

    fn age_file(path: &Path, by: Duration) {
        let file = std::fs::File::options().write(true).open(path).unwrap();
        file.set_modified(SystemTime::now() - by).unwrap();
    }

    // Proven red: with get_tile's Stale arm split off to return
    // `Err(OFFLINE.to_string())`, "called `Result::unwrap()` on an `Err` value:
    // \"offline\"" at the old-and-offline step; with the map PNG check changed
    // to `!png.is_empty()`, "left: [60, 104, 116, 109, 108, 62]" (the "<html>"
    // download drawn instead of the old tile).
    #[test]
    fn a_tile_is_cached_reused_refetched_when_old_and_kept_when_offline() {
        let root = scratch("flow");
        let key = TileKey::new(3, 1, 2).unwrap();
        let path = root.join("tiles/osm/3/1/2.png");

        // First time: downloaded from the right address and cached, with no
        // temporary file left behind.
        let got = get_tile(&root, TileKind::Map, key, |url| {
            assert_eq!(url, "https://tile.openstreetmap.org/3/1/2.png");
            Ok(map_png(b"one"))
        })
        .unwrap();
        assert_eq!(got, map_png(b"one"));
        assert_eq!(std::fs::read(&path).unwrap(), map_png(b"one"));
        let left: Vec<_> = std::fs::read_dir(path.parent().unwrap()).unwrap().collect();
        assert_eq!(left.len(), 1, "only the tile itself is in its folder");

        // Second time: from the cache, no network.
        let got = get_tile(&root, TileKind::Map, key, |_| panic!("fetched a fresh tile")).unwrap();
        assert_eq!(got, map_png(b"one"));

        // Eight days on: fetched again, and the new copy replaces the old.
        age_file(&path, Duration::from_secs(8 * 24 * 60 * 60));
        let got = get_tile(&root, TileKind::Map, key, |_| Ok(map_png(b"two"))).unwrap();
        assert_eq!(got, map_png(b"two"));
        assert_eq!(std::fs::read(&path).unwrap(), map_png(b"two"));

        // Old and offline: the old copy is still used.
        age_file(&path, Duration::from_secs(8 * 24 * 60 * 60));
        let got = get_tile(&root, TileKind::Map, key, |_| Err(OFFLINE.to_string())).unwrap();
        assert_eq!(got, map_png(b"two"));

        // A broken download is neither drawn nor cached: the old copy stays.
        let got = get_tile(&root, TileKind::Map, key, |_| Ok(b"<html>".to_vec())).unwrap();
        assert_eq!(got, map_png(b"two"));
        assert_eq!(std::fs::read(&path).unwrap(), map_png(b"two"));

        // No copy and offline: the word JS branches on.
        let other = TileKey::new(3, 2, 2).unwrap();
        assert_eq!(get_tile(&root, TileKind::Map, other, |_| Err(OFFLINE.to_string())), Err(OFFLINE.to_string()));
    }

    // Proven red: with read_cached skipping `kind.prepare` (returning the raw
    // PNG), "left: 1941  right: 262144" (the PNG's length, not the heights').
    #[test]
    fn a_cached_terrain_tile_comes_back_as_heights_and_a_damaged_one_is_fetched_again() {
        let root = scratch("terrain");
        let key = TileKey::new(1, 1, 0).unwrap();
        get_tile(&root, TileKind::Terrain, key, |url| {
            assert_eq!(url, "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/1/1/0.png");
            Ok(full_tile([128, 0, 0]))
        })
        .unwrap();
        let path = root.join("tiles/terrarium/1/1/0.png");
        assert!(path.exists());
        let cached = get_tile(&root, TileKind::Terrain, key, |_| panic!("fetched a fresh tile")).unwrap();
        assert_eq!(cached.len(), 262144);

        // A cached file that no longer reads as a tile is not trusted.
        std::fs::write(&path, b"half a file").unwrap();
        let fixed = get_tile(&root, TileKind::Terrain, key, |_| Ok(full_tile([129, 2, 128]))).unwrap();
        assert_eq!(fixed[..4], 258.5f32.to_le_bytes());
    }

    // Proven red: with `403 | 404` changed to `404`, "left: Some(\"The tile
    // server answered 403\")".
    #[test]
    fn missing_tiles_and_other_server_answers_are_told_apart() {
        assert_eq!(status_error(200), None);
        assert_eq!(status_error(404), Some(MISSING.to_string()));
        assert_eq!(status_error(403), Some(MISSING.to_string()));
        assert_eq!(status_error(500), Some("The tile server answered 500".to_string()));
        assert!(USER_AGENT.starts_with("PhoenixWeaponeer/"));
        assert_eq!(USER_AGENT, format!("PhoenixWeaponeer/{}", env!("CARGO_PKG_VERSION")));
    }

    /// The slippy-map tile holding a point.
    fn tile_for(lat: f64, lon: f64, z: u32) -> TileKey {
        let n = f64::from(1u32 << z);
        let x = ((lon + 180.0) / 360.0 * n).floor() as u32;
        let phi = lat.to_radians();
        let y = ((1.0 - (phi.tan() + 1.0 / phi.cos()).ln() / std::f64::consts::PI) / 2.0 * n).floor() as u32;
        TileKey::new(z, x, y).unwrap()
    }

    fn heights_of(bytes: &[u8]) -> Vec<f32> {
        bytes.chunks_exact(4).map(|b| f32::from_le_bytes(b.try_into().unwrap())).collect()
    }

    /// Both servers, live. Run by hand:
    /// `cargo test --manifest-path src-tauri/Cargo.toml -- --ignored live_tiles`.
    #[test]
    #[ignore = "needs the network"]
    fn live_tiles_fetch_and_decode() {
        let root = scratch("live");

        // Mid-Atlantic, far from any island: every height is at or below sea level.
        let sea = tile_for(30.0, -40.0, 8);
        let sea_heights = heights_of(&get_tile(&root, TileKind::Terrain, sea, download).expect("sea tile"));
        assert_eq!(sea_heights.len(), 65536);
        let highest = sea_heights.iter().cloned().fold(f32::MIN, f32::max);
        assert!(highest <= 0.0, "open sea tile rises to {highest} m");

        // Mount Elbrus (5642 m), in the DCS Caucasus map. A 12 zoom pixel is
        // about 28 m, so the highest pixel should be close to the summit.
        let elbrus = tile_for(43.3499, 42.4453, 12);
        let peak = heights_of(&get_tile(&root, TileKind::Terrain, elbrus, download).expect("Elbrus tile"))
            .into_iter()
            .fold(f32::MIN, f32::max);
        assert!((5300.0..=5750.0).contains(&peak), "Elbrus tile tops out at {peak} m");

        // The same tile from OpenStreetMap is a PNG, and is cached.
        let map = get_tile(&root, TileKind::Map, elbrus, download).expect("map tile");
        assert!(map.starts_with(PNG_SIGNATURE));
        let again = get_tile(&root, TileKind::Map, elbrus, |_| panic!("fetched a fresh tile")).unwrap();
        assert_eq!(again, map);
    }
}
