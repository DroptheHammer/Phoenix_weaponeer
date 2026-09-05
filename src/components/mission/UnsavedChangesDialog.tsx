import { useState } from 'react';
import { Modal } from '../common/Modal';
import { saveMission } from '../../lib/missionFile';

interface UnsavedChangesDialogProps {
  /** What the user asked for, phrased to complete "…before you {action}?" */
  actionLabel: string;
  /** Run the pending action — the mission is safe to discard by this point. */
  onProceed: () => void;
  onCancel: () => void;
}

/**
 * Three-way guard shown when an action would throw away unsaved planning.
 *
 * Save routes through the normal save path, so it may raise a picker for a
 * mission that has never been written. If that picker is cancelled or the write
 * fails, the pending action is abandoned rather than silently losing the work.
 */
export function UnsavedChangesDialog({
  actionLabel,
  onProceed,
  onCancel,
}: UnsavedChangesDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await saveMission();
    setSaving(false);

    if (result.status === 'ok') {
      onProceed();
    } else if (result.status === 'error') {
      setError(result.message);
    }
    // Cancelled picker: stay put so the planner can decide again.
  };

  return (
    <Modal title="Unsaved changes" onClose={onCancel}>
      <p className="text-gray-300 mb-4">
        This mission has changes that have not been saved. Save them before you {actionLabel}?
      </p>

      {error && (
        <p className="mb-4 rounded border border-red-500/60 bg-red-950/60 px-3 py-2 text-sm text-red-200">
          Save failed: {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-dcs-blue hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onProceed}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 disabled:opacity-50 transition-colors"
        >
          Discard
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-dcs-accent hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
