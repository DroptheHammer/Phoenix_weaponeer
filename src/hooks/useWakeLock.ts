import { useEffect } from 'react';

/**
 * Keep the screen on while `active`, so a card on the kneeboard doesn't go dark
 * mid-attack. The browser drops the lock whenever the page is hidden (another
 * app, the lock button), so it is taken again each time the page comes back.
 *
 * Where the Wake Lock API is missing, or the browser refuses (battery saver,
 * say), nothing happens: the card still shows, the screen just sleeps as usual.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;

    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const taken = await navigator.wakeLock.request('screen');
        if (stopped) void taken.release().catch(() => {});
        else lock = taken;
      } catch {
        // Refused: carry on without it.
      }
    };

    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
