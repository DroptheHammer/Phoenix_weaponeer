const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Text made safe to put inside an HTML string.
 *
 * React escapes everything it renders, but Leaflet's `divIcon({ html })` takes
 * a raw string and assigns it to `innerHTML`. Anything interpolated there that
 * could have come from a mission file — a steerpoint, a waypoint type — goes
 * through here first, or a shared mission file can run script in the app.
 */
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
