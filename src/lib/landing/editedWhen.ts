/**
 * When a mission was last edited, in the words the front page and the overview
 * use: "today, 14:20", "yesterday, 21:05", "9 Nov", "9 Nov 2025". Local time,
 * 24-hour clock, English month names written here (not the system locale), so
 * a card reads the same on every machine. Null for no time or a broken one.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();

export function editedWhen(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  if (dayKey(d) === dayKey(now)) return `today, ${time}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return `yesterday, ${time}`;
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? date : `${date} ${d.getFullYear()}`;
}

/** The same at the start of a line: "Today, 14:20". */
export const editedWhenCapital = (iso: string | null | undefined, now: Date): string | null => {
  const s = editedWhen(iso, now);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
};
