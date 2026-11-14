/**
 * The playback's clock: strike time, playing or paused, and the speed. Pure
 * (no DOM, no three.js), so geo-check tests it under node.
 *
 * It sums the frame times the render loop hands it, each capped at 0.1 s,
 * rather than reading the wall clock. When the window is hidden or minimised
 * the browser stops sending frames while wall time runs on; a wall-clock
 * player would leap to the end on return, this one carries on from where it
 * stopped.
 *
 * The UI side: React reads it through `useSyncExternalStore(clock.subscribe,
 * clock.getSnapshot)`. The snapshot object only changes when `emit()` runs:
 * at once on every change the user must see (play, pause, seek, speed, the
 * end), and from the render loop at most about 12 times a second while
 * playing (`UI_EMIT_MS`). Ordinary frames never notify, so the timeline does
 * not re-render 60 times a second.
 */

/**
 * The speeds the buttons offer, strike seconds per wall second. 1× is the
 * default; nothing runs slower. A frame is capped before it is multiplied (see
 * `advance`), so a hitch at 16× moves 1.6 s of strike time and never leaps;
 * under about 10 frames a second, 16× plays slower than 16×, by design.
 */
export const SPEEDS = [1, 2, 4, 8, 16] as const;
export type Speed = (typeof SPEEDS)[number];

/** The button's words: "1×" … "16×". */
export function speedLabel(s: Speed): string {
  return `${s}×`;
}

/** A frame longer than this (window hidden, debugger, GC) advances only this much: no leaps. */
export const MAX_FRAME_DT_S = 0.1;

/**
 * While playing, the render loop emits a snapshot to the UI no more often than this (about 12 Hz).
 * At 16× the readout and the scrubber thumb therefore jump about 1.3 s of strike time at a go.
 */
export const UI_EMIT_MS = 1000 / 12;

export interface ClockSnapshot {
  readonly t: number;
  readonly playing: boolean;
  readonly speed: Speed;
  readonly start: number;
  readonly end: number;
  /** Bumped on every discrete change (not on ordinary ticks). */
  readonly version: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class PlayClock {
  private t: number;
  private playing = false;
  private speed: Speed = 1;
  private start: number;
  private end: number;
  /** Bumped on every change the UI must show at once (not on ordinary ticks). */
  version = 0;
  private snap: ClockSnapshot;
  private listeners = new Set<() => void>();

  constructor(start: number, end: number, t = start) {
    this.start = start;
    this.end = Math.max(end, start);
    this.t = clamp(t, this.start, this.end);
    this.snap = this.snapshot();
  }

  get time(): number {
    return this.t;
  }
  get isPlaying(): boolean {
    return this.playing;
  }
  get currentSpeed(): Speed {
    return this.speed;
  }

  /** Advance by one frame's wall-clock interval, s. Returns true when t moved. */
  advance(wallDt_s: number): boolean {
    if (!this.playing) return false;
    const dt = Math.min(Math.max(wallDt_s, 0), MAX_FRAME_DT_S) * this.speed;
    const before = this.t;
    this.t = Math.min(this.t + dt, this.end);
    if (this.t >= this.end) {
      // Stop at the end, and tell the UI at once (its Play button must flip back).
      this.playing = false;
      this.changed();
    }
    return this.t !== before;
  }

  play(): void {
    if (this.t >= this.end) this.t = this.start; // Play at the end replays from the start
    this.playing = true;
    this.changed();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.changed();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number): void {
    this.t = clamp(t, this.start, this.end);
    this.changed();
  }

  setSpeed(s: Speed): void {
    this.speed = s;
    this.changed();
  }

  /** The range moves when a delay changes (a re-time). t stays where it is, clamped. */
  setRange(start: number, end: number): void {
    this.start = start;
    this.end = Math.max(end, start);
    this.t = clamp(this.t, this.start, this.end);
    this.changed();
  }

  /** A fresh snapshot object (the UI should use getSnapshot, which is stable between emits). */
  snapshot(): ClockSnapshot {
    return { t: this.t, playing: this.playing, speed: this.speed, start: this.start, end: this.end, version: this.version };
  }

  /** For useSyncExternalStore: returns a listener remover. Bound, so it can be passed as it is. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** For useSyncExternalStore: the same object until the next emit, as React requires. */
  getSnapshot = (): ClockSnapshot => this.snap;

  /** Refresh the snapshot and tell the UI. Discrete changes call it themselves; the loop calls it at ≤ 12 Hz while playing. */
  emit(): void {
    this.snap = this.snapshot();
    this.listeners.forEach((l) => l());
  }

  private changed(): void {
    this.version++;
    this.emit();
  }
}
