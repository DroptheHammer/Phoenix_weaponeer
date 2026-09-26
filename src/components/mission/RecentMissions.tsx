import { useSettingsStore } from '../../stores/settingsStore';

/** The file name, and the folder it sits in, from a path on any OS. */
function splitPath(path: string): { name: string; folder: string } {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return { name: path.slice(cut + 1), folder: cut > 0 ? path.slice(0, cut) : '' };
}

/**
 * Mission files last opened or saved, on the front page. Nothing shows until
 * there is something to list. Opening goes through the caller, so it gets the
 * same unsaved-changes guard and error reporting as Open.
 */
export function RecentMissions({ onOpen }: { onOpen: (path: string) => void }) {
  const recent = useSettingsStore((state) => state.settings.recentMissions);
  const forget = useSettingsStore((state) => state.forgetRecentMission);
  if (!recent.length) return null;

  return (
    <div className="max-w-xl mx-auto mt-6 text-left">
      <h3 className="text-sm text-gray-400 mb-2">Recent missions</h3>
      <ul className="space-y-1">
        {recent.map((path) => {
          const { name, folder } = splitPath(path);
          return (
            <li key={path} className="flex items-center bg-dcs-navy rounded-lg">
              <button
                onClick={() => onOpen(path)}
                className="flex-1 min-w-0 text-left px-3 py-2 rounded-lg hover:bg-dcs-blue transition-colors"
                title={path}
              >
                <div className="text-sm text-white truncate">{name}</div>
                {folder && <div className="text-xs text-gray-500 truncate">{folder}</div>}
              </button>
              <button
                onClick={() => void forget(path)}
                className="px-3 py-2 text-gray-500 hover:text-white transition-colors"
                title="Remove from this list (the file is not deleted)"
                aria-label={`Remove ${name} from recent missions`}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
