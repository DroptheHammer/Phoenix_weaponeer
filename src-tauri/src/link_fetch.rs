//! Fetching a FragOrders public link on the desktop.
//!
//! The checks and parsing are shared with the web build in
//! `weaponeer_core::fragorders_link`; this is only the two HTTPS GETs, made
//! with `ureq` (rustls, so no OpenSSL on any CI runner).

use std::time::Duration;
use weaponeer_core::fragorders_link::{
    canonical_link, check_bundle_address, link_id, manifest_url, read_manifest, status_error, LinkPayload,
    MAX_BODY_BYTES, TOO_LARGE, TOO_SLOW, UNREACHABLE,
};

const TIMEOUT: Duration = Duration::from_secs(20);

/// Fetch a public link: manifest, then bundle.
pub fn fetch(url: &str) -> Result<LinkPayload, String> {
    let id = link_id(url)?;
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(TIMEOUT))
        .https_only(true)
        .max_redirects(0)
        .http_status_as_error(false)
        .build()
        .into();

    let manifest_json = get(&agent, &manifest_url(id))?;
    let manifest = read_manifest(&manifest_json)?;
    check_bundle_address(&manifest.bundle_address)?;
    let bundle_json = get(&agent, &manifest.bundle_address)?;

    Ok(LinkPayload {
        link: canonical_link(id),
        title: manifest.title,
        show_groups: manifest.show_groups,
        bundle_json,
    })
}

/// One GET, with every failure put in words a pilot can act on.
fn get(agent: &ureq::Agent, url: &str) -> Result<String, String> {
    let mut response = agent.get(url).call().map_err(|e| match e {
        ureq::Error::HostNotFound | ureq::Error::ConnectionFailed | ureq::Error::Io(_) => UNREACHABLE.to_string(),
        ureq::Error::Timeout(_) => TOO_SLOW.to_string(),
        other => format!("Couldn't download the mission: {other}"),
    })?;

    if let Some(error) = status_error(response.status().as_u16()) {
        return Err(error);
    }

    response
        .body_mut()
        .with_config()
        .limit(MAX_BODY_BYTES)
        .read_to_string()
        .map_err(|e| match e {
            ureq::Error::BodyExceedsLimit(_) => TOO_LARGE.to_string(),
            other => format!("The mission download was cut short: {other}"),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The whole fetch against the live service. Run by hand with the NTTR_DTC
    /// and Neon Mirror public links (kept out of the repo, in
    /// test-data/private/fragorders-links/README.md):
    /// `PHOENIX_LIVE_LINK=<url> PHOENIX_LIVE_NEON_LINK=<url> cargo test --manifest-path src-tauri/Cargo.toml -- --ignored`.
    #[test]
    #[ignore = "needs the network and a live FragOrders link"]
    fn live_nttr_dtc_link_fetches() {
        let Ok(link) = std::env::var("PHOENIX_LIVE_LINK") else {
            eprintln!("skipped: set PHOENIX_LIVE_LINK to the NTTR_DTC public link");
            return;
        };
        let payload = fetch(&link).expect("live link should fetch");
        assert!(weaponeer_core::parsers::tasking_state::looks_like_tasking_state(&payload.bundle_json));
        let data = weaponeer_core::import::process_tasking_state(
            &payload.bundle_json,
            weaponeer_core::refdata::reference(),
        )
        .expect("live payload should import");
        assert_eq!(data.theater, "nevada");
        assert!(!data.threats.is_empty(), "NTTR_DTC publishes its red laydown");
        assert_eq!(payload.show_groups, Some(true));

        // Neon Mirror was published with "show groups" off; the manifest says so.
        let Ok(neon_link) = std::env::var("PHOENIX_LIVE_NEON_LINK") else {
            eprintln!("skipped the Neon Mirror half: set PHOENIX_LIVE_NEON_LINK");
            return;
        };
        let neon = fetch(&neon_link).expect("live link should fetch");
        assert_eq!(neon.show_groups, Some(false));
        assert!(neon.title.is_some(), "the manifest carries the mission's title");
    }
}
