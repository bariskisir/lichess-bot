import { useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import type { RuntimeCommand, RuntimeView } from '../../../../../packages/contracts/src/index.js';
import { api } from '../../shared/api/client.js';
import { Button } from '../../shared/ui/Button.js';

export function SessionControls({
  runtime,
  hasAccounts,
  disabled,
  onError,
}: {
  runtime: RuntimeView;
  hasAccounts: boolean;
  disabled: boolean;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState<RuntimeCommand | null>(null);
  async function command(action: RuntimeCommand): Promise<void> {
    setBusy(action);
    onError(null);
    try {
      await api('/api/control', 'POST', { command: action });
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The session action failed. Try again.');
    } finally {
      setBusy(null);
    }
  }
  const idle = ['idle', 'completed', 'error'].includes(runtime.phase);
  return (
    <div className="session-controls">
      {idle && (
        <Button
          variant="primary"
          disabled={disabled || !hasAccounts}
          loading={busy === 'start'}
          onClick={() => {
            void command('start');
          }}
        >
          <Play />
          Start session
        </Button>
      )}
      {runtime.phase === 'starting' && (
        <Button disabled loading>
          Connecting
        </Button>
      )}
      {runtime.phase === 'running' && (
        <Button
          disabled={disabled || !!busy}
          loading={busy === 'pause'}
          onClick={() => {
            void command('pause');
          }}
          title="Stop new pairings; ongoing games continue"
        >
          <Pause />
          Pause pairing
        </Button>
      )}
      {runtime.phase === 'paused' && (
        <Button
          variant="primary"
          disabled={disabled || !!busy}
          loading={busy === 'resume'}
          onClick={() => {
            void command('resume');
          }}
        >
          <Play />
          Resume pairing
        </Button>
      )}
      {['running', 'paused', 'starting'].includes(runtime.phase) && (
        <Button
          variant="ghost"
          disabled={disabled || !!busy}
          loading={busy === 'stop'}
          onClick={() => {
            void command('stop');
          }}
          title="Stop pairing and finish all ongoing games"
        >
          <Square />
          Finish session
        </Button>
      )}
      {runtime.phase === 'draining' && <Button disabled>Finishing {runtime.active} games</Button>}
      {!idle && (
        <Button
          variant="ghost"
          className="session-controls__stop"
          disabled={disabled || !!busy}
          loading={busy === 'stop-now'}
          onClick={() => {
            void command('stop-now');
          }}
          title="Stop local play immediately. Unfinished games are recovered on the next start."
        >
          Stop now
        </Button>
      )}
    </div>
  );
}
