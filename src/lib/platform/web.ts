import init, * as core from '../../generated/weaponeer-wasm/weaponeer_wasm.js';
import type { Mission } from '../../types/mission.types';
import type { Settings, SettingsLoad } from '../../types/settings.types';
import type { CoreCommand, Platform } from './types';

/**
 * The browser platform: the Rust core runs as WebAssembly (`crates/wasm`,
 * built by `npm run build:wasm`), and files go through the browser's own
 * download and file-picker. Imported as `@platform` in the web build only.
 *
 * There are no paths here. A "path" is only the file name a download is
 * saved under, or the name of a file the user just picked.
 */

/** The WebAssembly module, loaded once. Every core call waits for it. */
const ready = init();

/** How long a FragOrders request may take, as on the desktop. */
const FETCH_TIMEOUT_MS = 20_000;

// ---- Settings: kept in this browser's localStorage ----

const SETTINGS_KEY = 'phoenix-weaponeer.settings';
const DEFAULT_SETTINGS: Settings = { kneeboardFolders: {}, kneeboardMap: true, recentMissions: [] };

function readSettings(): SettingsLoad {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, warning: null };
    const saved = JSON.parse(raw) as Partial<Settings>;
    return {
      settings: {
        ...DEFAULT_SETTINGS,
        kneeboardMap: typeof saved.kneeboardMap === 'boolean' ? saved.kneeboardMap : true,
      },
      warning: null,
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, warning: 'Settings could not be read in this browser; using defaults.' };
  }
}

function writeSettings(settings: Settings): Settings {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ kneeboardMap: settings.kneeboardMap }));
  } catch {
    // Private browsing or storage turned off: the setting still applies now.
  }
  return settings;
}

// ---- Files ----

/** Hand the browser a file to save (it lands in Downloads, or the Files app on iOS). */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

/** Files the user picked this session, by name, until they are read. */
const pickedFiles = new Map<string, string>();

/** Show the browser's file picker; resolves `null` when the user cancels. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

// ---- FragOrders public links ----

/** One GET, with every failure in the same words the desktop uses. */
async function getText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw error instanceof DOMException && error.name === 'TimeoutError'
      ? core.link_too_slow_error()
      : core.link_unreachable_error();
  }
  const statusError = core.link_status_error(response.status);
  if (statusError) throw statusError;

  const limit = core.link_max_body_bytes();
  if (Number(response.headers.get('content-length') ?? 0) > limit) throw core.link_too_large_error();
  const text = await response.text();
  if (text.length > limit) throw core.link_too_large_error();
  return text;
}

/**
 * Fetch a public link the way the desktop does: every check is the shared
 * Rust one (`fragorders_link.rs`), only the two GETs are the browser's.
 */
async function fetchLink(url: string): Promise<unknown> {
  const manifestUrl = core.link_manifest_url(url);
  const manifest = JSON.parse(core.link_read_manifest(await getText(manifestUrl))) as {
    bundle_address: string;
    title: string | null;
    show_groups: boolean | null;
  };
  const bundle = await getText(manifest.bundle_address);
  return JSON.parse(core.link_import(url, manifest.title, manifest.show_groups, bundle));
}

// ---- The platform ----

type Args = Record<string, unknown>;
const text = (args: Args, key: string) => String(args[key] ?? '');

export const platform: Platform = {
  isWeb: true,

  async call<T>(command: CoreCommand, args: Args = {}): Promise<T> {
    await ready;
    switch (command) {
      case 'list_theaters':
        return JSON.parse(core.list_theaters());
      case 'list_delivery_profiles':
        return JSON.parse(core.list_delivery_profiles('[]'));
      case 'get_all_threats':
        return JSON.parse(core.get_all_threats());
      case 'get_threats_by_type':
        return JSON.parse(core.get_threats_by_type(text(args, 'threatType')));
      case 'get_all_weapons':
        return JSON.parse(core.get_all_weapons());
      case 'get_weapons_for_aircraft':
        return JSON.parse(core.get_weapons_for_aircraft(text(args, 'aircraftId')));
      case 'get_all_aircraft':
        return JSON.parse(core.get_all_aircraft());
      case 'get_fuze_options':
        return JSON.parse(core.get_fuze_options(text(args, 'weaponId')));
      case 'parse_fragorders_json':
        return JSON.parse(core.parse_fragorders_json(text(args, 'jsonStr')));
      case 'fetch_fragorders_url':
        return (await fetchLink(text(args, 'url'))) as T;
    }
  },

  getSettings: async () => readSettings(),
  // The web build never writes into a DCS folder, so there is none to remember.
  setKneeboardFolder: async () => readSettings().settings,
  setKneeboardMap: async (on) => writeSettings({ ...readSettings().settings, kneeboardMap: on }),
  // There are no paths to reopen in a browser, so no recent-files list.
  rememberRecentMission: async () => readSettings().settings,
  forgetRecentMission: async () => readSettings().settings,

  chooseMissionSavePath: async (defaultName) => defaultName,
  async writeMission(mission: Mission, path) {
    await ready;
    const json = core.save_mission(JSON.stringify(mission));
    download(new Blob([json], { type: 'application/json' }), basename(path));
  },
  async chooseMissionToOpen() {
    const file = await pickFile('.json,application/json');
    if (!file) return null;
    pickedFiles.set(file.name, await file.text());
    return file.name;
  },
  async readMission(path) {
    await ready;
    const json = pickedFiles.get(path);
    if (json === undefined) throw 'Open the mission file again to load it.';
    pickedFiles.delete(path);
    return JSON.parse(core.load_mission(json));
  },

  chooseCardSavePath: async (defaultName) => defaultName,
  chooseFolder: async () => 'Downloads',
  pathInFolder: async (_folder, filename) => filename,
  async writeCard(path, base64Png) {
    const bytes = Uint8Array.from(atob(base64Png), (c) => c.charCodeAt(0));
    download(new Blob([bytes], { type: 'image/png' }), basename(path));
  },

  folderExists: async () => false,
  suggestKneeboardFolder: async () => null,

  quit: () => window.close(),

  guardClose(mustAsk) {
    // A browser only allows its own "Leave site?" prompt here.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!mustAsk()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  },
};
