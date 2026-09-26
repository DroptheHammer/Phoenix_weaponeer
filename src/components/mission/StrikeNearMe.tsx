import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import { Modal } from '../common/Modal';
import { ZoomTimerGuard } from '../map/ZoomTimerGuard';
import { OSM_TILE_URL } from '../../lib/kneeboardBasemap';
import { REAL_WORLD_DEFAULT_WEAPON, realWorldMission } from '../../lib/strikeNearMe';
import type { Coordinates, Mission } from '../../types';

interface AircraftOption {
  id: string;
  name: string;
}

interface StrikeNearMeProps {
  aircraft: AircraftOption[];
  onCreate: (mission: Mission) => void;
  onClose: () => void;
}

type Fix =
  | { state: 'locating' }
  | { state: 'found'; position: Coordinates; accuracy_m: number; altitude_ft: number | null }
  | { state: 'unavailable'; reason: string };

/** Zoomed in enough to pick a house. */
const PICK_ZOOM = 17;
/** The whole world, when there is no fix to centre on. */
const WORLD = { center: { lat: 20, lon: 0 }, zoom: 2 };

/** Keeps the map's centre in `onMove`, and flies to the fix when it arrives. */
function MapCentre({ fix, onMove }: { fix: Fix; onMove: (c: Coordinates) => void }) {
  const map = useMap();
  useEffect(() => {
    const report = () => {
      const c = map.getCenter();
      onMove({ lat: c.lat, lon: c.lng });
    };
    report();
    map.on('move', report);
    return () => {
      map.off('move', report);
    };
  }, [map, onMove]);
  useEffect(() => {
    if (fix.state === 'found') map.setView([fix.position.lat, fix.position.lon], PICK_ZOOM);
  }, [fix, map]);
  return null;
}

function geolocationError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return 'Location permission was declined.';
  if (error.code === error.TIMEOUT) return 'Your location took too long to find.';
  return 'Your location is not available right now.';
}

/**
 * "Strike near me" (see `lib/strikeNearMe.ts`): find where the planner is,
 * let them pan a crosshair onto a target nearby, then make a real-world
 * mission of it. The location is used here and in the mission only — nothing
 * is sent anywhere; map tiles load as on any map view.
 */
export function StrikeNearMe({ aircraft, onCreate, onClose }: StrikeNearMeProps) {
  const [fix, setFix] = useState<Fix>({ state: 'locating' });
  const [centre, setCentre] = useState<Coordinates>(WORLD.center);
  const [target, setTarget] = useState<Coordinates | null>(null);
  const [elevation, setElevation] = useState('0');
  const [aircraftId, setAircraftId] = useState(() => aircraft.find((a) => a.id === 'f16c')?.id ?? aircraft[0]?.id ?? 'f16c');
  const [callsign, setCallsign] = useState('Viper 1-1');
  const [name, setName] = useState('Strike near me');

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setFix({ state: 'unavailable', reason: 'This browser cannot find your location.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        // The phone's own altitude, when it has one, is a fair first guess at
        // the ground's; the planner can correct it.
        const altitude_ft = p.coords.altitude != null ? Math.round(p.coords.altitude * 3.28084) : null;
        if (altitude_ft != null) setElevation(String(Math.max(0, altitude_ft)));
        setFix({
          state: 'found',
          position: { lat: p.coords.latitude, lon: p.coords.longitude },
          accuracy_m: p.coords.accuracy,
          altitude_ft,
        });
      },
      (e) => setFix({ state: 'unavailable', reason: geolocationError(e) }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, []);

  const elevation_ft = Number(elevation);
  const canCreate = target !== null && Number.isFinite(elevation_ft) && callsign.trim() !== '' && name.trim() !== '';

  const create = () => {
    if (!target || !canCreate) return;
    onCreate(
      realWorldMission({
        target,
        targetElevation_ft: elevation_ft,
        planner: fix.state === 'found' ? fix.position : undefined,
        aircraftId,
        callsign: callsign.trim(),
        name: name.trim(),
      }),
    );
  };

  return (
    <Modal title="📍 Strike near me" onClose={onClose} fill>
      <div className="h-full flex flex-col">
        {target === null ? (
          <>
            <p className="shrink-0 text-sm text-gray-300 px-4 py-2">
              {fix.state === 'locating' && 'Finding where you are…'}
              {fix.state === 'found' &&
                `Move the map to put the crosshair on your target (you are the blue dot, ±${Math.round(fix.accuracy_m)} m).`}
              {fix.state === 'unavailable' && `${fix.reason} Move the map to any spot in the world instead.`}
            </p>
            <div className="relative flex-1 min-h-[240px]">
              <MapContainer
                center={[WORLD.center.lat, WORLD.center.lon]}
                zoom={WORLD.zoom}
                className="absolute inset-0"
                zoomControl={false}
              >
                <TileLayer url={OSM_TILE_URL} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
                {fix.state === 'found' && (
                  <CircleMarker
                    center={[fix.position.lat, fix.position.lon]}
                    radius={7}
                    pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}
                  />
                )}
                <MapCentre fix={fix} onMove={setCentre} />
                <ZoomTimerGuard />
              </MapContainer>
              {/* The crosshair is fixed; the map moves under it, so a finger never hides the point. */}
              <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
                <div className="relative h-12 w-12">
                  <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-dcs-accent" />
                  <div className="absolute top-1/2 left-0 w-full h-0.5 -translate-y-1/2 bg-dcs-accent" />
                  <div className="absolute inset-3 rounded-full border-2 border-dcs-accent" />
                </div>
              </div>
            </div>
            <div className="shrink-0 p-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
              <button
                onClick={() => setTarget(centre)}
                disabled={fix.state === 'locating'}
                className="w-full bg-dcs-accent hover:bg-red-600 disabled:bg-gray-600 text-white font-medium py-3 rounded-lg"
              >
                Set target here
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-sm text-gray-300">
              Target set at {target.lat.toFixed(5)}, {target.lon.toFixed(5)}.{' '}
              <button onClick={() => setTarget(null)} className="text-blue-400 underline">
                Move it
              </button>
            </p>
            <label className="block text-sm">
              Ground elevation at the target (ft above sea level)
              <input
                type="number"
                inputMode="numeric"
                value={elevation}
                onChange={(e) => setElevation(e.target.value)}
                className="mt-1 w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              />
              <span className="text-xs text-gray-400">
                {fix.state === 'found' && fix.altitude_ft != null
                  ? 'Filled in from your phone’s altitude; correct it if you know better.'
                  : 'Your phone gave no altitude. 0 ft is fine for fun; attack heights are measured from here.'}
              </span>
            </label>
            <label className="block text-sm">
              Aircraft
              <select
                value={aircraftId}
                onChange={(e) => setAircraftId(e.target.value)}
                className="mt-1 w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              >
                {aircraft.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-400">Starts with six {REAL_WORLD_DEFAULT_WEAPON}; change the loadout in Flight.</span>
            </label>
            <label className="block text-sm">
              Callsign
              <input
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
                className="mt-1 w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              />
            </label>
            <label className="block text-sm">
              Mission name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
              />
            </label>
            <p className="text-xs text-amber-300">
              This is a real place, not a DCS map: plan it for fun, it can’t be flown. Your location stays on this
              device; the app warns you before a card or file with it is shared.
            </p>
            <button
              onClick={create}
              disabled={!canCreate}
              className="w-full bg-dcs-accent hover:bg-red-600 disabled:bg-gray-600 text-white font-medium py-3 rounded-lg"
            >
              Create mission
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
