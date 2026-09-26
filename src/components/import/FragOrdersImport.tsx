import { useState, useRef } from 'react';
import { platform } from '@platform';
import type { FragOrdersData } from '../../types';
import { Modal } from '../common/Modal';
import { FragOrdersPreview } from './FragOrdersPreview';

type ImportMode = 'url' | 'json';

interface FragOrdersImportProps {
  onClose: () => void;
  onImport: (data: FragOrdersData, selectedGroupIndex: number) => void;
}

export function FragOrdersImport({ onClose, onImport }: FragOrdersImportProps) {
  const [mode, setMode] = useState<ImportMode>('url');
  const [urlInput, setUrlInput] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [parsedData, setParsedData] = useState<FragOrdersData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFetchUrl = async () => {
    if (!urlInput.trim()) {
      setError('Please enter a FragOrders URL');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // The backend checks the link and says in plain words what's wrong
      // with it, so there's no second copy of that rule here.
      const data = await platform.call<FragOrdersData>('fetch_fragorders_url', { url: urlInput });
      setParsedData(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleParseJson = async () => {
    if (!jsonInput.trim()) {
      setError('Please paste or load FragOrders JSON data');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await platform.call<FragOrdersData>('parse_fragorders_json', {
        jsonStr: jsonInput,
      });
      setParsedData(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setJsonInput(text);
      setError(null);
    } catch (e) {
      setError(`Failed to read file: ${e}`);
    }
  };

  const handleBack = () => {
    setParsedData(null);
    setError(null);
  };

  const handleImport = (groupIndex: number) => {
    if (parsedData) {
      onImport(parsedData, groupIndex);
    }
  };

  return (
    <Modal
      title={parsedData ? 'Preview Import' : 'Import from FragOrders'}
      onClose={onClose}
      widthClass="w-full max-w-4xl mx-4"
    >
        <div>
          {parsedData ? (
            <FragOrdersPreview
              data={parsedData}
              onBack={handleBack}
              onImport={handleImport}
            />
          ) : (
            <div className="space-y-4">
              {/* Mode tabs */}
              <div className="flex border-b border-gray-700">
                <button
                  onClick={() => { setMode('url'); setError(null); }}
                  className={`px-4 py-2 font-medium transition-colors ${
                    mode === 'url'
                      ? 'text-white border-b-2 border-dcs-accent'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  From URL
                </button>
                <button
                  onClick={() => { setMode('json'); setError(null); }}
                  className={`px-4 py-2 font-medium transition-colors ${
                    mode === 'json'
                      ? 'text-white border-b-2 border-dcs-accent'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  From JSON
                </button>
              </div>

              {mode === 'url' ? (
                /* URL Import Mode */
                <div className="space-y-4">
                  <div className="bg-dcs-dark rounded-lg p-4">
                    <h3 className="font-medium mb-2">Import from FragOrders URL</h3>
                    <p className="text-sm text-gray-300">
                      Paste the frag order's public link to import its flights,
                      waypoints and whatever threats the publisher shared.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">FragOrders URL</label>
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isLoading && urlInput.trim()) handleFetchUrl();
                      }}
                      placeholder="https://fragorders.com/public_frag_order/..."
                      className="w-full bg-dcs-dark text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-dcs-accent focus:outline-none"
                    />
                  </div>

                  {/* Error display */}
                  {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300">
                      <span className="font-medium">Error:</span> {error}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={handleFetchUrl}
                      disabled={isLoading || !urlInput.trim()}
                      className="bg-dcs-accent hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
                    >
                      {isLoading ? 'Fetching...' : 'Import from URL'}
                    </button>
                  </div>
                </div>
              ) : (
                /* JSON Import Mode */
                <div className="space-y-4">
                  <div className="bg-dcs-dark rounded-lg p-4">
                    <h3 className="font-medium mb-2">Import from JSON</h3>
                    <p className="text-sm text-gray-300 mb-2">
                      Takes a saved copy of a public link's mission, or FragOrders CLI
                      output from a .miz file:
                    </p>
                    <code className="block bg-gray-800 px-2 py-1 rounded text-sm text-green-400">
                      fragorders parse mission.miz &gt; mission.json
                    </code>
                  </div>

                  {/* File input */}
                  <div className="flex gap-4">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-dcs-blue hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"
                    >
                      Load JSON File
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    {jsonInput && (
                      <button
                        onClick={() => setJsonInput('')}
                        className="text-gray-400 hover:text-white px-4 py-2 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* JSON textarea */}
                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder="Or paste FragOrders JSON here..."
                    className="w-full h-48 bg-dcs-dark text-white font-mono text-sm p-3 rounded-lg border border-gray-700 focus:border-dcs-accent focus:outline-none resize-none"
                  />

                  {/* Error display */}
                  {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300">
                      <span className="font-medium">Error:</span> {error}
                    </div>
                  )}

                  {/* Parse button */}
                  <div className="flex justify-end">
                    <button
                      onClick={handleParseJson}
                      disabled={isLoading || !jsonInput.trim()}
                      className="bg-dcs-accent hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
                    >
                      {isLoading ? 'Parsing...' : 'Parse JSON'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
    </Modal>
  );
}
