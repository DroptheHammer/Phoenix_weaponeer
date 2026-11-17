/**
 * Which dialog owns the keyboard, and where Tab must go inside it. Modal
 * (src/components/common/Modal.tsx) uses both.
 *
 * Neither helper touches a DOM global: each works only on what it is given, so
 * the checks can run them in Node with plain stand-in objects.
 *
 * The 3D playback has its own copy of the Tab rule (trapTab in
 * src/components/playback/PlaybackOverlay.tsx). That code loads only when a
 * playback is opened, and this file loads at start-up with every dialog, so
 * sharing one helper would pull one into the other's bundle; the playback is
 * also left exactly as it was reviewed.
 */

/** What the helpers need of an element: enough for a stand-in object in a check. */
export interface DialogNode {
  contains(other: DialogNode | null): boolean;
}

/** What the on-top test needs of the document. */
export interface DialogDocument {
  querySelectorAll(selectors: string): ArrayLike<DialogNode>;
}

/**
 * Is this dialog the one on top? Portals append to the end of <body>, so the
 * last [role="dialog"] in the document is the newest. A dialog is on top when
 * that element is its own, or sits inside it: a legend or sheet marked as a
 * dialog inside a dialog does not take the keyboard from the dialog round it.
 */
export function isTopDialog(root: DialogNode | null, doc: DialogDocument): boolean {
  if (!root) return false;
  const dialogs = doc.querySelectorAll('[role="dialog"]');
  const top = dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
  return top !== null && root.contains(top);
}

/**
 * Where Tab (or Shift+Tab, `back`) must send focus so it stays inside `root`,
 * or undefined to leave the browser's own move alone.
 *
 * `stops` are the controls the browser would Tab to, in page order. Tab on the
 * last goes to the first and Shift+Tab on the first to the last. From the dialog
 * itself, or from anywhere outside it, Tab goes to the first and Shift+Tab to the
 * last. A dialog with no control keeps focus on itself.
 */
export function tabStop<T extends DialogNode>(stops: readonly T[], active: DialogNode | null, back: boolean, root: T): T | undefined {
  if (stops.length === 0) return root;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const outside = !active || active === root || !root.contains(active);
  if (outside) return back ? last : first;
  if (back && active === first) return last;
  if (!back && active === last) return first;
  return undefined;
}
