import { useEffect, useState } from 'react';
import { watchForUpdates } from '@pwa-update';
import { Button } from '../ui/Button';

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
      <div className="flex items-center gap-3 rounded-ui-lg border border-line-strong bg-surface-float text-ink shadow-ui-2 px-4 py-3 text-sm max-w-md w-full">
        <span className="flex-1">A new version of Phoenix Weaponeer is ready.</span>
        <Button variant="quiet" size="compact" onClick={() => setReload(null)}>
          Later
        </Button>
        <Button variant="primary" size="compact" onClick={reload}>
          Reload
        </Button>
      </div>
    </div>
  );
}
