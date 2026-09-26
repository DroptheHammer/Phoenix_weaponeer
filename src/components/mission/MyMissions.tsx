import { useLocalMissionStore } from '../../stores/localMissionStore';
import { useTheaterStore } from '../../stores/theaterStore';

/** "5 min ago", "yesterday", or a date — how long since a mission was last saved. */
function since(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'yesterday';
  return new Date(iso).toLocaleDateString();
}

/**
 * The missions autosaved in this browser (web build), newest first. Opening
 * goes through the caller, like Open. Deleting asks first: it is the only
 * copy unless the mission was exported.
 */
export function MyMissions({ onOpen }: { onOpen: (id: string) => void }) {
  const entries = useLocalMissionStore((state) => state.entries);
  const remove = useLocalMissionStore((state) => state.remove);
  const error = useLocalMissionStore((state) => state.error);
  const theaters = useTheaterStore((state) => state.theaters);

  if (!entries.length && !error) return null;

  return (
    <div className="w-full max-w-xl mx-auto mt-6 text-left">
      <h3 className="text-sm text-gray-400 mb-2">My missions</h3>
      {error && <div className="text-xs rounded p-2 mb-2 bg-red-900 text-red-200">{error}</div>}
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-stretch bg-dcs-navy rounded-lg">
            <button
              onClick={() => onOpen(entry.id)}
              className="flex-1 min-w-0 text-left px-4 py-3 rounded-lg hover:bg-dcs-blue transition-colors"
            >
              <div className="text-base text-white truncate">{entry.name}</div>
              <div className="text-xs text-gray-400 truncate">
                {theaters[entry.theater]?.display_name ?? entry.theater}
                {' · '}
                {entry.attackCount} attack{entry.attackCount === 1 ? '' : 's'}
                {' · '}
                {since(entry.savedAt)}
              </div>
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete "${entry.name}" from this device? Export it first if you want to keep a copy.`)) {
                  void remove(entry.id);
                }
              }}
              className="px-4 text-gray-500 hover:text-white transition-colors"
              aria-label={`Delete ${entry.name}`}
              title="Delete from this device"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-500 mt-2">
        Saved automatically in this browser, on this device only. Export .json to keep a copy or to move a plan to your PC.
      </p>
    </div>
  );
}
