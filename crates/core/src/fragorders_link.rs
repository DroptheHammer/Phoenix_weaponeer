//! Fetching a FragOrders public link
//!
//! A pilot pastes `http(s)://fragorders.com/public_frag_order/{id}`. That page is
//! a single-page app shell, so the mission is fetched the way the page itself
//! does it, in two hops:
//!
//! 1. The publish manifest, a Firestore document named by the link's id. It
//!    holds the mission's title, the publisher's options, and the address of
//!    the published bundle.
//! 2. The bundle: the `TaskingState` JSON, on CloudFront. Its file name is a
//!    content hash that changes on every republish, so it is always looked up
//!    through the manifest and never stored.
//!
//! Neither needs a credential. What comes back is whatever the publisher chose
//! to share; `import::import_link` imports it.
//!
//! Everything fetched is untrusted. The bundle address comes out of the
//! manifest, so it is only followed to CloudFront over HTTPS, and redirects
//! are never followed at all.
//!
//! This module is the checks and the parsing. The two GETs themselves belong
//! to each platform: `src-tauri/src/link_fetch.rs` on the desktop, the
//! browser's `fetch` in the web build. Both go through the functions here, in
//! this order: `link_id` → `manifest_url` → `read_manifest` →
//! `check_bundle_address` → fetch the bundle.

/// Firestore document holding each public link's publish manifest.
pub const MANIFEST_URL: &str =
    "https://firestore.googleapis.com/v1/projects/dcsmmp/databases/(default)/documents/PublishManifests/";

/// Larger than any real bundle (the biggest captured is about 320 KB) by a
/// wide margin, and small enough that a hostile answer can't exhaust memory.
pub const MAX_BODY_BYTES: u64 = 25 * 1024 * 1024;

/// The manifest to fetch for a link id (from `link_id`).
pub fn manifest_url(id: &str) -> String {
    format!("{MANIFEST_URL}{id}")
}

/// What a public link resolves to.
pub struct LinkPayload {
    /// The link in its canonical form.
    pub link: String,
    /// The mission's title from the manifest.
    pub title: Option<String>,
    /// The publisher's "show groups" option. `Some(false)` means every enemy
    /// ground group was left out on purpose.
    pub show_groups: Option<bool>,
    /// The published mission, still as text.
    pub bundle_json: String,
}

// What a pilot is told when a fetch fails, in words they can act on. Shared
// so the desktop and web builds say the same thing.

/// No connection, or the host could not be found.
pub const UNREACHABLE: &str = "Couldn't reach FragOrders. Check your internet connection and try again.";
/// The request timed out.
pub const TOO_SLOW: &str = "FragOrders took too long to answer. Try again.";
/// The answer was larger than `MAX_BODY_BYTES`.
pub const TOO_LARGE: &str = "The mission download is far larger than any real mission, so it was refused.";

/// The error for an HTTP status, or `None` for 200.
pub fn status_error(status: u16) -> Option<String> {
    match status {
        200 => None,
        404 => Some(
            "This link no longer exists. The mission may have been \
             unpublished or republished under a new link."
                .to_string(),
        ),
        403 => Some("FragOrders refused access to this link.".to_string()),
        code => Some(format!("FragOrders answered with an error (HTTP {code}).")),
    }
}

/// The id out of a public link, or a plain error for anything else.
///
/// Accepts the link as it is usually pasted: `https://` or `http://` (the
/// FragOrders share button hands out `http://`), with or without `www.`, and
/// with a trailing slash, query or fragment. Anything else is refused.
///
/// Only the id is taken from the link; the link itself is never fetched, and
/// every request `fetch` makes is HTTPS. So an `http://` link downgrades
/// nothing.
pub fn link_id(url: &str) -> Result<&str, String> {
    const EXPECTED: &str =
        "That isn't a FragOrders mission link. It should look like \
         fragorders.com/public_frag_order/…";

    let url = url.trim();
    let rest = strip_prefix_ignore_case(url, "https://")
        .or_else(|| strip_prefix_ignore_case(url, "http://"))
        .ok_or(EXPECTED)?;
    let rest = strip_prefix_ignore_case(rest, "www.").unwrap_or(rest);
    let rest = strip_prefix_ignore_case(rest, "fragorders.com/").ok_or(EXPECTED)?;
    let id = rest.strip_prefix("public_frag_order/").ok_or(EXPECTED)?;

    // Drop a query or fragment, then at most one trailing slash.
    let id = id.split(['?', '#']).next().unwrap_or("");
    let id = id.strip_suffix('/').unwrap_or(id);

    let valid = (10..=40).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric());
    if valid {
        Ok(id)
    } else {
        Err(EXPECTED.to_string())
    }
}

fn strip_prefix_ignore_case<'a>(s: &'a str, prefix: &str) -> Option<&'a str> {
    let head = s.get(..prefix.len())?;
    head.eq_ignore_ascii_case(prefix).then(|| &s[prefix.len()..])
}

/// The link as FragOrders writes it, for the mission's notes.
pub fn canonical_link(id: &str) -> String {
    format!("https://fragorders.com/public_frag_order/{id}")
}

/// The parts of a publish manifest the import uses.
#[derive(Debug, PartialEq)]
pub struct Manifest {
    pub bundle_address: String,
    pub title: Option<String>,
    pub show_groups: Option<bool>,
}

/// Read a manifest out of Firestore's typed-value JSON
/// (`{"fields": {"title": {"stringValue": "…"}, …}}`).
pub fn read_manifest(json: &str) -> Result<Manifest, String> {
    let unexpected = || "FragOrders sent something unexpected for this link.".to_string();
    let doc: serde_json::Value = serde_json::from_str(json).map_err(|_| unexpected())?;
    let fields = doc.get("fields").ok_or_else(unexpected)?;

    let bundle_address = fields
        .pointer("/bundleAddress/stringValue")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "This link has no published mission behind it yet.".to_string())?
        .to_string();
    let title = fields
        .pointer("/title/stringValue")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_string);
    let show_groups = fields
        .pointer("/publishOpts/mapValue/fields/showGroups/booleanValue")
        .and_then(|v| v.as_bool());

    Ok(Manifest { bundle_address, title, show_groups })
}

/// Only fetch a bundle from CloudFront over HTTPS. The address comes out of a
/// document we don't control, and following it anywhere else would let that
/// document point the app at any host it liked.
pub fn check_bundle_address(address: &str) -> Result<(), String> {
    let refused = || "FragOrders pointed this link at an unexpected server, so it was not followed.".to_string();

    let rest = address.strip_prefix("https://").ok_or_else(refused)?;
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let plain_host = !host.is_empty()
        && host
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.');
    // `plain_host` rules out userinfo (`@`) and ports (`:`), so the suffix test
    // is on the real host name.
    if plain_host && host.ends_with(".cloudfront.net") {
        Ok(())
    } else {
        Err(refused())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pasted_link_yields_its_id() {
        for url in [
            "https://fragorders.com/public_frag_order/ExampleLinkId0000001",
            "https://www.fragorders.com/public_frag_order/ExampleLinkId0000001",
            "  https://fragorders.com/public_frag_order/ExampleLinkId0000001/  ",
            "HTTPS://FragOrders.com/public_frag_order/ExampleLinkId0000001?ref=discord",
            "https://fragorders.com/public_frag_order/ExampleLinkId0000001#top",
            // FragOrders' share button hands out plain http:// links (issue #1).
            "http://fragorders.com/public_frag_order/ExampleLinkId0000001",
            "HTTP://www.FragOrders.com/public_frag_order/ExampleLinkId0000001/",
        ] {
            assert_eq!(link_id(url), Ok("ExampleLinkId0000001"), "{url}");
        }
    }

    #[test]
    fn anything_but_a_public_link_is_refused() {
        for url in [
            "",
            "ExampleLinkId0000001",
            "ftp://fragorders.com/public_frag_order/ExampleLinkId0000001",
            "https://evil.example/public_frag_order/ExampleLinkId0000001",
            "http://evil.example/public_frag_order/ExampleLinkId0000001",
            "http://fragorders.com.evil.example/public_frag_order/ExampleLinkId0000001",
            "https://fragorders.com.evil.example/public_frag_order/ExampleLinkId0000001",
            "https://notfragorders.com/public_frag_order/ExampleLinkId0000001",
            "https://fragorders.com/frag_order/ExampleLinkId0000001",
            "https://fragorders.com/public_frag_order/",
            "https://fragorders.com/public_frag_order/short",
            "https://fragorders.com/public_frag_order/ExampleLinkId0000001/extra",
            "https://fragorders.com/public_frag_order/..%2F..%2Fsecret1234",
            "https://fragorders.com/public_frag_order/ExampleLin kId0000001",
            "javascript:alert(1)//fragorders.com/public_frag_order/ExampleLinkId0000001",
        ] {
            assert!(link_id(url).is_err(), "should refuse {url:?}");
        }
    }

    #[test]
    fn a_manifest_gives_its_bundle_title_and_publish_option() {
        let json = r#"{
            "name": "projects/dcsmmp/databases/(default)/documents/PublishManifests/ExampleLinkId0000001",
            "fields": {
                "bundleAddress": {"stringValue": "https://d1lw12zfwta4ws.cloudfront.net/bundles/ExampleLinkId0000001/abc123.json"},
                "title": {"stringValue": " Neon Mirror M14 "},
                "publishOpts": {"mapValue": {"fields": {
                    "showGroups": {"booleanValue": false},
                    "publishRed": {"booleanValue": false}
                }}}
            }
        }"#;
        assert_eq!(
            read_manifest(json),
            Ok(Manifest {
                bundle_address:
                    "https://d1lw12zfwta4ws.cloudfront.net/bundles/ExampleLinkId0000001/abc123.json"
                        .to_string(),
                title: Some("Neon Mirror M14".to_string()),
                show_groups: Some(false),
            })
        );
    }

    #[test]
    fn a_manifest_without_a_bundle_is_an_error_not_an_empty_mission() {
        assert!(read_manifest(r#"{"fields": {"title": {"stringValue": "Draft"}}}"#).is_err());
        assert!(read_manifest(r#"{"error": {"code": 404}}"#).is_err());
        assert!(read_manifest("<html>").is_err());
    }

    #[test]
    fn a_bundle_is_only_fetched_from_cloudfront_over_https() {
        check_bundle_address("https://d1lw12zfwta4ws.cloudfront.net/bundles/x/y.json")
            .expect("the real bundle host");
        for address in [
            "http://d1lw12zfwta4ws.cloudfront.net/bundles/x/y.json",
            "https://evil.example/bundles/x/y.json",
            "https://cloudfront.net.evil.example/y.json",
            "https://d1lw12zfwta4ws.cloudfront.net@evil.example/y.json",
            "https://evil.example?.cloudfront.net",
            "https://evil.example#.cloudfront.net",
            "https://d1lw12zfwta4ws.cloudfront.net:8443/y.json",
            "https://localhost/y.json",
            "file:///etc/passwd",
            "",
        ] {
            assert!(check_bundle_address(address).is_err(), "should refuse {address:?}");
        }
    }

    #[test]
    fn statuses_read_as_plain_words() {
        assert_eq!(status_error(200), None);
        assert!(status_error(404).unwrap().contains("no longer exists"));
        assert!(status_error(403).unwrap().contains("refused"));
        assert!(status_error(500).unwrap().contains("HTTP 500"));
    }

    #[test]
    fn the_manifest_is_asked_for_by_id() {
        assert_eq!(
            manifest_url("ExampleLinkId0000001"),
            "https://firestore.googleapis.com/v1/projects/dcsmmp/databases/(default)/documents/PublishManifests/ExampleLinkId0000001"
        );
    }
}
