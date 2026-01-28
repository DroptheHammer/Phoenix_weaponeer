import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FragOrdersData } from '../../types';
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

    // Validate URL format
    if (!urlInput.includes('fragorders.com')) {
      setError('Please enter a valid FragOrders URL (e.g., https://fragorders.com/public_frag_order/...)');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: Once the FragOrders author provides API access, this will call:
      // const data = await invoke<FragOrdersData>('fetch_fragorders_url', { url: urlInput });

      // For now, show a message that API access is pending
      setError('URL import coming soon! The FragOrders author is setting up API access. For now, use JSON paste or file upload.');
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
      const data = await invoke<FragOrdersData>('parse_fragorders_json', {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dcs-navy rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold">
            {parsedData ? 'Preview Import' : 'Import from FragOrders'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
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
                      Paste your FragOrders mission link to import waypoints and threat data directly.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">FragOrders URL</label>
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://fragorders.com/public_frag_order/..."
                      className="w-full bg-dcs-dark text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-dcs-accent focus:outline-none"
                    />
                  </div>

                  {/* Error display */}
                  {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300">
                      <span className="font-medium">Note:</span> {error}
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
                      For development/testing, use the FragOrders CLI to parse a .miz file:
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
      </div>
    </div>
  );
}
