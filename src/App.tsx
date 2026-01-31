import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMissionStore } from "./stores/missionStore";
import { FragOrdersImport } from "./components/import";
import { MapView } from "./components/map/MapView";
import { WaypointList } from "./components/waypoints/WaypointList";
import { ThreatList } from "./components/threats/ThreatList";
import { FlightRoster } from "./components/flights/FlightRoster";
import { AttackList } from "./components/attacks/AttackList";
import { KneeboardPreview } from "./components/kneeboard/KneeboardPreview";
import type { FragOrdersData } from "./types";

interface ThreatSystem {
  id: string;
  name: string;
  nato_designation: string | null;
  threat_type: string;
  max_range_nm: number;
  max_altitude_ft: number;
}

interface Aircraft {
  id: string;
  name: string;
  dcs_module_name: string;
}

type TabType = 'map' | 'waypoints' | 'threats' | 'flight' | 'attacks' | 'kneeboards';

function App() {
  const { mission, createMission, importFromFragOrders, addThreat, updateThreat } = useMissionStore();
  const [threats, setThreats] = useState<ThreatSystem[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('map');

  const handleFragOrdersImport = (data: FragOrdersData, groupIndex: number) => {
    importFromFragOrders(data, groupIndex);
    setShowImportModal(false);
    setActiveTab('map'); // Switch to map view after import
  };

  // Create threat system map for quick lookups
  const threatSystemMap = useMemo(() => {
    const map = new Map<string, ThreatSystem>();
    threats.forEach((threat) => map.set(threat.id, threat));
    return map;
  }, [threats]);

  useEffect(() => {
    async function loadDatabaseData() {
      try {
        const [threatData, aircraftData] = await Promise.all([
          invoke<ThreatSystem[]>("get_all_threats"),
          invoke<Aircraft[]>("get_all_aircraft"),
        ]);
        setThreats(threatData);
        setAircraft(aircraftData);
        setLoading(false);
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    }
    loadDatabaseData();
  }, []);

  const handleNewMission = () => {
    createMission("New Mission", "caucasus");
  };

  // Map interaction handlers
  const handleAddThreatFromMap = (systemId: string, position: { lat: number; lon: number }) => {
    addThreat({
      systemId,
      position,
      status: 'active',
      source: 'planning',
      notes: 'Added via map placement',
    });
  };

  const handleMoveThreat = (threatId: string, position: { lat: number; lon: number }) => {
    updateThreat(threatId, { position });
  };

  return (
    <div className="min-h-screen bg-dcs-dark text-white">
      <header className="bg-dcs-navy p-4 shadow-lg">
        <h1 className="text-2xl font-bold">Phoenix Weaponeer</h1>
        <p className="text-gray-400 text-sm">DCS Mission Planning Tool</p>
      </header>

      <main className="p-6">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Loading database...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400">Error: {error}</p>
          </div>
        ) : mission ? (
          <div className="flex flex-col h-[calc(100vh-120px)]">
            {/* Mission header */}
            <div className="bg-dcs-blue rounded-lg p-4 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold">{mission.name}</h2>
                  <p className="text-gray-300">Theater: {mission.theater}</p>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-dcs-accent">{mission.waypoints.length}</div>
                    <div className="text-gray-400">Waypoints</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-400">{mission.threats.length}</div>
                    <div className="text-gray-400">Threats</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">{mission.flightMembers.length}</div>
                    <div className="text-gray-400">Flight</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{mission.attacks.length}</div>
                    <div className="text-gray-400">Attacks</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tab navigation */}
            <div className="flex gap-2 mb-4 border-b border-gray-700">
              <button
                onClick={() => setActiveTab('map')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'map'
                    ? 'border-b-2 border-dcs-accent text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Map
              </button>
              <button
                onClick={() => setActiveTab('waypoints')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'waypoints'
                    ? 'border-b-2 border-dcs-accent text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Waypoints
              </button>
              <button
                onClick={() => setActiveTab('threats')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'threats'
                    ? 'border-b-2 border-dcs-accent text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Threats
              </button>
              <button
                onClick={() => setActiveTab('flight')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'flight'
                    ? 'border-b-2 border-dcs-accent text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Flight
              </button>
              <button
                onClick={() => setActiveTab('attacks')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'attacks'
                    ? 'border-b-2 border-dcs-accent text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Attacks
              </button>
              <button
                onClick={() => setActiveTab('kneeboards')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'kneeboards'
                    ? 'border-b-2 border-dcs-accent text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Kneeboards
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'map' && (
                <MapView
                  theater={mission.theater}
                  waypoints={mission.waypoints}
                  threats={mission.threats}
                  bullseye={mission.bullseye}
                  threatSystems={threatSystemMap}
                  availableThreats={threats}
                  onAddThreat={handleAddThreatFromMap}
                  onMoveThreat={handleMoveThreat}
                />
              )}
              {activeTab === 'waypoints' && <WaypointList />}
              {activeTab === 'threats' && <ThreatList threatSystems={threatSystemMap} availableThreats={threats} />}
              {activeTab === 'flight' && <FlightRoster />}
              {activeTab === 'attacks' && <AttackList />}
              {activeTab === 'kneeboards' && <KneeboardPreview />}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">No mission loaded</p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleNewMission}
                  className="bg-dcs-accent hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Create New Mission
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="bg-dcs-blue hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Import FragOrders
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-dcs-navy rounded-lg p-4">
                <h3 className="font-medium mb-3 text-dcs-accent">Threat Database ({threats.length})</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {threats.map((threat) => (
                    <div key={threat.id} className="bg-dcs-dark rounded p-2 text-sm">
                      <span className="font-medium">{threat.name}</span>
                      {threat.nato_designation && (
                        <span className="text-gray-400 ml-2">({threat.nato_designation})</span>
                      )}
                      <span className="text-gray-500 ml-2">
                        {threat.threat_type} - {threat.max_range_nm}nm
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-dcs-navy rounded-lg p-4">
                <h3 className="font-medium mb-3 text-dcs-accent">Aircraft Database ({aircraft.length})</h3>
                <div className="space-y-2">
                  {aircraft.map((ac) => (
                    <div key={ac.id} className="bg-dcs-dark rounded p-2 text-sm">
                      <span className="font-medium">{ac.name}</span>
                      <span className="text-gray-400 ml-2">({ac.dcs_module_name})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showImportModal && (
        <FragOrdersImport
          onClose={() => setShowImportModal(false)}
          onImport={handleFragOrdersImport}
        />
      )}
    </div>
  );
}

export default App;
