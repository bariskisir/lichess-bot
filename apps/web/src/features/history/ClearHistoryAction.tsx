import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../../shared/api/client.js';
import { Button } from '../../shared/ui/Button.js';

export function ClearHistoryAction({
  disabled,
  onCleared,
}: {
  disabled: boolean;
  onCleared: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clear(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api('/api/history', 'DELETE');
      onCleared();
      setConfirming(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'History could not be cleared. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="history-clear">
      <div className="history-clear__actions">
        {confirming && <span>Delete all saved games?</span>}
        <Button
          variant={confirming ? 'danger' : 'ghost'}
          disabled={disabled}
          loading={busy}
          onClick={() => {
            if (confirming) void clear();
            else setConfirming(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          {confirming ? 'Confirm clear' : 'Clear history'}
        </Button>
        {confirming && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
