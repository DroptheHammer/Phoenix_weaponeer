import { useEffect, useState } from 'react';
import { watchForUpdates } from '@pwa-update';

/**
 * "A new version is ready" — the web build's installed app only. Reloading
 * is safe: the open mission is autosaved (see `localMissionStore`), so it can
 * be reopened from My missions. Renders nothing on the desktop.
 */
export function UpdateBanner() {
  const [reload, setReload] = useState<(() => void) | null>(null);

  useEffect(() => {
    watchForUpdates((apply) => setReload(() => apply));
  }, []);

  if (!reload) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[3000] flex justify-center px-3"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-3 rounded-xl bg-dcs-blue text-white shadow-2xl px-4 py-3 text-sm max-w-md w-full">
        <span className="flex-1">A new version of Phoenix Weaponeer is ready.</span>
        <button onClick={() => setReload(null)} className="px-2 py-2 text-gray-300 hover:text-white">
          Later
        </button>
        <button onClick={reload} className="px-3 py-2 rounded-lg bg-dcs-accent hover:bg-red-600 font-medium">
          Reload
        </button>
      </div>
    </div>
  );
}
