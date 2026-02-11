/**
 * Format a DCS callsign for display.
 *
 * DCS can produce several formats:
 *   "Viper12 1-1"  → Rust formats name="Viper12" + flight=1 + element=1 (redundant suffix)
 *   "Viper12"      → compact group name without suffix
 *   "Viper 1-2"    → already correct
 *
 * All of these should display as "Viper 1-2".
 */
export function formatCallsign(cs: string): string {
  // Case 1: "Viper12 1-1" — compact name followed by redundant flight-element suffix
  // Extract the compact part and format it
  const withSuffix = cs.match(/^([A-Za-z]+\d{1,2})\s+\d+-\d+$/);
  if (withSuffix) {
    return formatCompact(withSuffix[1]);
  }

  // Case 2: "Viper12" — compact name with trailing two digits
  return formatCompact(cs);
}

/** "Viper12" → "Viper 1-2", already-formatted strings returned unchanged */
function formatCompact(cs: string): string {
  return cs.replace(/^([A-Za-z]+)(\d)(\d)$/, '$1 $2-$3');
}

/**
 * Normalize a raw DCS callsign string for storage during import.
 * Applies the same logic as formatCallsign so stored data is clean.
 */
export function normalizeImportedCallsign(raw: string): string {
  return formatCallsign(raw);
}
