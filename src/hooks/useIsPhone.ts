import { useEffect, useState } from 'react';

/**
 * A phone-sized screen: narrower than 768px, or a phone held sideways (under
 * 500px tall). The same query as the phone rules in `index.css`, so the
 * layout and the styling always agree.
 *
 * Only the web build can ever match: the desktop window has a 1024×768
 * minimum (`tauri.conf.json`).
 */
export const PHONE_QUERY = '(max-width: 767px), (max-height: 500px)';

function matches(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(PHONE_QUERY).matches
    : false;
}

export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(matches);
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return isPhone;
}
