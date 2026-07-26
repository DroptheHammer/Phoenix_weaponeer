/**
 * Marker stacking order for the tactical map.
 *
 * Leaflet stacks markers by latitude by default, so whatever happens to sit
 * further south wins. That is not acceptable here: a threat symbol dropped on
 * a steerpoint would hide it, and a pilot flying directly over a symbol has to
 * be able to tell a navigation point from a threat at a glance.
 *
 * Navigation and attack geometry therefore always render above threats and
 * everything else, regardless of position.
 *
 * Threat range rings are Circles, which Leaflet already draws in the
 * overlayPane beneath every marker, so only the threat's centre marker needs
 * to be pushed down.
 */
export const MARKER_Z = {
  /** Threats sit beneath navigation and attack symbols. */
  threat: -500,
  /** Informational callouts: IP, egress and source labels. */
  label: 200,
  /** Bullseye — a reference datum, above threats but below the route. */
  bullseye: 400,
  /** Route steerpoints. */
  waypoint: 600,
  /** POP / ATK / TGT: the points actually being flown. Highest priority. */
  attackPoint: 800,
} as const;
