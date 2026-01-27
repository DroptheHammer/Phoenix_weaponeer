import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMissionStore } from "./stores/missionStore";

interface ThreatSystem {
  id: string;
  name: string;
  nato_designation: string | null;
  threat_type: string;
  max_range_nm: number;
}

interface Aircraft {
  id: string;
  name: string;
  dcs_module_name: string;
}

function App() {
  const { mission, createMission } = useMissionStore();
  const [threats, setThreats] = useState<ThreatSystem[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    createMission("New Mission", "Caucasus");
  };

  return (
    <div className="min-h-screen bg-dcs-dark text-white">
      <header className="bg-dcs-navy p-4 shadow-lg">
        <h1 className="text-2xl font-bold">DCS Attack Planner</h1>
        <p className="text-gray-400 text-sm">Phoenix Weaponeer</p>
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
          <div className="space-y-4">
            <div className="bg-dcs-blue rounded-lg p-4">
              <h2 className="text-xl font-semibold">{mission.name}</h2>
              <p className="text-gray-300">Theater: {mission.theater}</p>
              <p className="text-gray-400 text-sm">
                Created: {new Date(mission.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-dcs-navy rounded-lg p-4">
                <h3 className="font-medium mb-2">Waypoints</h3>
                <p className="text-gray-400">{mission.waypoints.length} defined</p>
              </div>
              <div className="bg-dcs-navy rounded-lg p-4">
                <h3 className="font-medium mb-2">Threats</h3>
                <p className="text-gray-400">{mission.threats.length} placed</p>
              </div>
              <div className="bg-dcs-navy rounded-lg p-4">
                <h3 className="font-medium mb-2">Flight</h3>
                <p className="text-gray-400">{mission.flightMembers.length} pilots</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">No mission loaded</p>
              <button
                onClick={handleNewMission}
                className="bg-dcs-accent hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Create New Mission
              </button>
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
    </div>
  );
}

export default App;
