import { useEffect, useState } from 'react';
import { loadPlaybackCredits } from '@playback';
import { Modal } from '../common/Modal';
import { Panel } from '../ui/Panel';
import { ABOUT_TITLE, APP_NAME, COPYRIGHT, CREDITS_HEADING, LICENCE_NAME, LICENCE_PLAIN, creditList, versionLine, type CreditEntry } from './credits';

/**
 * The About dialog: the app's name and version, who owns it and under what licence, and the credits. It draws the
 * list in credits.ts and knows no entry by name. The 3D playback's entries come with the desktop build only
 * (`loadPlaybackCredits`), so the phone's list is shorter. The version is package.json's, defined by both builds.
 *
 * The code is loaded when the dialog is opened (App.tsx lazy-loads this file), never at start-up.
 */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  // The playback's entries, once they are in; the list is drawn after them so it never changes under the reader.
  const [fromPlayback, setFromPlayback] = useState<readonly CreditEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    // A credit that cannot load is left out rather than the dialog: the rest of the list still stands.
    loadPlaybackCredits().then(
      (entries) => live && setFromPlayback(entries),
      () => live && setFromPlayback([]),
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <Modal title={ABOUT_TITLE} onClose={onClose} widthClass="w-full max-w-lg mx-4">
      <div className="grid gap-4">
        <div>
          <p className="text-ui-lead font-bold">{APP_NAME}</p>
          <p className="text-ui-body text-ink-2">{versionLine(__APP_VERSION__)}</p>
        </div>
        <div>
          <p className="text-ui-body font-semibold">{COPYRIGHT}</p>
          <p className="text-ui-small text-ink-2">{LICENCE_NAME}</p>
          <p className="mt-1 text-ui-body text-ink-2">{LICENCE_PLAIN}</p>
        </div>
        {fromPlayback ? (
          <section>
            <h3 className="text-ui-lead font-bold">{CREDITS_HEADING}</h3>
            <Panel as="ul" nested className="mt-2">
              {creditList(fromPlayback).map((entry) => (
                <li key={entry.key} className="grid gap-0.5 px-3 py-2">
                  <p className="text-ui-body font-semibold">{entry.name}</p>
                  <p className="text-ui-small text-ink-2">{entry.licence ? `${entry.owner} · ${entry.licence}` : entry.owner}</p>
                  <p className="text-ui-small text-ink-2">{entry.takes}</p>
                </li>
              ))}
            </Panel>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
