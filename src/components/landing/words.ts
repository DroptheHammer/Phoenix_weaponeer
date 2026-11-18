/**
 * Every word the front page, the "Choose your flight" step and the Flight
 * overview show, in one place, so the screens and the checks agree. The load
 * box's refusals are not here: they are the data layer's own
 * (src/lib/landing/loadSniff.ts REFUSAL_MESSAGES) and the backends' messages.
 *
 * Nothing here speaks of threats the mission author hid: the app says nothing
 * about them outside Settings > Admin.
 */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const W = {
  // ── Front page ──
  heroTitle: 'Load a mission',
  heroSubDesktop: 'Paste a FragOrders link, drop a FragOrders .json file, or open a saved mission.',
  heroSubPhone: 'Paste a FragOrders link, or choose a FragOrders .json file or a saved mission.',
  loadPlaceholder: 'Paste a FragOrders link',
  loadButton: 'Load',
  dropIdle: 'Drop a file here',
  dropOver: 'Let go to load this file',
  dropSub: 'A FragOrders .json file or a saved mission',
  chooseFile: 'Choose file',
  chooseFileLabel: 'Choose a FragOrders .json file or a saved mission',
  hintIdleDesktop: 'A saved mission is the .json file you get from Save in this app.',
  hintIdleWeb: 'A saved mission is the .json file you get from Export .json in this app.',
  hintLink: 'Press Load to read the mission from this link.',
  hintJson: 'Press Load to read this mission.',
  hintUnknown: 'Not recognized yet. Paste a link that starts with https://fragorders.com/ or choose a .json file.',
  chipLink: 'FragOrders link',
  chipFragJson: 'FragOrders .json',
  chipSaved: 'Saved mission',
  busyLink: 'Fetching the link…',
  busyFile: (name: string) => `Reading ${name}…`,
  busyText: 'Reading the mission…',
  cancel: 'Cancel',
  createNew: 'Create new mission',
  strikeNearMe: 'Strike near me',
  recentTitle: 'Recent missions',
  recentLastEdited: 'Last edited ',
  recentOpenNow: 'Open now',
  recentMissing: 'Moved or deleted. Open it to take it off this list.',
  recentUnreadable: "Can't be read. Open it to see why.",
  recentForget: (name: string) => `Remove ${name} from recent missions`,
  recentForgetTitle: 'Remove from this list (the file is not deleted)',
  recentDelete: (name: string) => `Delete ${name}`,
  recentDeleteAsk: (name: string) => `Delete "${name}" from this device? Export it first if you want to keep a copy.`,
  recentDeleteYes: 'Delete',
  recentWebFine: 'Saved automatically in this browser, on this device only. Export .json to keep a copy or to move a plan to your PC.',
  recentFlight: (group: string, jets: number, aircraft: string) => `${group} · ${jets} × ${aircraft}`,

  // ── Choose your flight ──
  chooseTitle: 'Choose your flight',
  chooseDesc: 'Pick the one you fly in. The app plans one flight at a time.',
  chooseClose: 'Cancel and go back to the load box',
  filterPlaceholder: 'Filter by callsign or aircraft',
  filterClear: 'Clear the filter',
  flightCount: (shown: number, total: number) => (shown === total ? plural(total, 'player flight') : `${shown} of ${total} player flights`),
  flightRow: (jets: number) => `· ${plural(jets, 'jet')}`,
  typeNote: (flights: number, hasProfiles: boolean | null) => `${plural(flights, 'flight')}${hasProfiles === false ? ' · No delivery profiles yet' : ''}`,
  noMatch: (q: string) => `No flights match "${q}".`,
  noMatchHint: 'Try a callsign such as Venom, or an aircraft such as Hornet.',
  chosenHidden: (label: string) => `Chosen: ${label} (hidden by the filter)`,
  tapHint: 'Tap a flight to see its jets',
  noGroups: 'No player-flyable groups found in this mission.',
  jetsTitle: 'Jets and loadouts',
  jetsNote: (label: string, jets: number, aircraft: string) => `${label} · ${jets} × ${aircraft}`,
  noProfilesStrong: 'No delivery profiles yet.',
  noProfiles: (aircraft: string) => ` The app has none for the ${aircraft}. You can still import this flight; the attack editor will say when a weapon has no profile.`,
  onlyFour: (jets: number) => `This flight has ${jets} jets. Only the first 4 are imported.`,
  unverifiedTitle: (theater: string) => `${theater}: coordinates unverified`,
  unverifiedBody: "This map's projection has not been checked against a known landmark. Waypoints may be systematically offset. Confirm one against the DCS F10 map before flying these cards.",
  warningsTitle: (n: number) => plural(n, 'import warning'),
  unmatched: (n: number, types: string) => `${plural(n, 'threat')} could not be matched to a database entry and will not be imported: ${types}`,
  back: 'Back',
  backToList: 'Back to the list of flights',
  importFlight: (label: string) => `Import ${label}`,
  importNone: 'Import a flight',
  // A failed load of the chooser is remembered until the app is reloaded, so "press Load again" alone would
  // show these same words again.
  chooserFailed: 'The flight list could not be opened. Reload the app, then press Load again.',

  // ── Jet card ──
  qty: 'Qty',
  store: 'Store',
  notInTable: 'Not in the weapon table',
  noStores: 'No air-to-ground stores',
  attack: 'Attack',
  planned: 'Planned',
  noAttack: 'No attack',
  // Spelled out, as the table above says it: no bare abbreviations on screen.
  noAG: 'No air-to-ground stores',
  noAttackYet: 'No attack planned yet',
  estimated: 'ESTIMATED',
  estimatedNoteStrong: 'ESTIMATED:',
  estimatedNote: ' not yet flown in DCS',
  moreAttacks: (n: number) => `+${plural(n, 'more attack')}`,
  quantityCaption: (callsign: string) => `${callsign}: quantity and store`,

  // ── Flight overview: only what the header and App need. The words inside the overview are in
  // overviewWords.ts, which only the overview's own files import, so they load with the overview and not
  // at start-up. ──
  frontPage: 'Front page',
  backToFront: 'Back to the front page',
  openMap: 'Open the map',
  sourceLink: 'FragOrders link',
  edited: (when: string) => `edited ${when}`,
  // A failed load of the overview is remembered until the app is reloaded, so going back and opening it again
  // would show these same words: the map, which is already loaded, is the way on.
  overviewFailed: 'The Flight overview could not be opened. Reload the app to try again, or open the map.',
};
