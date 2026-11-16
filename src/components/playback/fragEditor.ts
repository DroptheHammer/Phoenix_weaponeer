/**
 * The strike editor's blast check: the very playback the Play button would
 * open, built from the editor's drafts and sliders as they stand, and the
 * playback library's own blast rule run on it. So the strip under the map
 * says what the playback's footer says, by construction, not by a second
 * piece of arithmetic that has to be kept in step.
 *
 * Pure, no React. It needs the playback library, so only the lazily loaded
 * strike panel (FragPanel) imports it: it never reaches start-up or the phone.
 */
import { buildStrikePlayback, burstNoun, burstReadout, burstSourceTitle, type BurstReadout } from '../../lib/playback';
import { playbackLaunchFromEditor, type EditorLaunchArgs } from './launch';

/** The blast rule's answer for the editor, with each warning's tooltip (what the radius means and where it comes from). */
export interface EditorBurst extends BurstReadout {
  /** One per warning, in the same order. */
  titles: string[];
}

/**
 * The blast lines and notes for the strike the editor holds now. Undefined when nothing can be built yet, or when the
 * strike is warned by the spacing rule (the strip prints that rule's lines itself).
 */
export function editorBurstReadout(args: EditorLaunchArgs): EditorBurst | undefined {
  const launch = playbackLaunchFromEditor(args);
  if (!launch) return undefined;
  const pb = buildStrikePlayback(launch.input);
  if (pb.fragRule !== 'burst') return undefined;
  const r = burstReadout(pb);
  return { ...r, titles: r.conflicts.map((c) => burstSourceTitle(c, burstNoun(pb.jets[c.firstJet].weapon))) };
}
