/**
 * Everything the 3D scene creates that holds memory on the graphics card
 * (geometries, materials, textures) or a listener goes in one bag, and the
 * bag is emptied when the view closes. One rule instead of a dispose call
 * remembered at every creation site; the dev leak check in createScene.ts
 * proves it held (no geometry or texture left alive).
 */
export interface Disposable {
  dispose(): void;
}

export class DisposeBag {
  private items: Disposable[] = [];

  /** Keep `item` until the bag is emptied; returns it, so creation and registration are one line. */
  add<T extends Disposable>(item: T): T {
    this.items.push(item);
    return item;
  }

  /** A listener added now and removed when the bag is emptied: no forgotten removeEventListener. */
  listen(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.items.push({ dispose: () => target.removeEventListener(type, fn, opts) });
  }

  /** Newest first (a texture's material before the texture, a layer's parts before the layer), each guarded so one failure cannot strand the rest. */
  disposeAll(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      try {
        this.items[i].dispose();
      } catch (err) {
        console.warn('playback dispose:', err);
      }
    }
    this.items.length = 0;
  }
}
