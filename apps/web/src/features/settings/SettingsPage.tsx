import { useEffect, useState, type FormEvent } from 'react';
import { Check, Save } from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  SUPPORTED_POOLS,
  type BotSettings,
  type EngineOption,
} from '../../../../../packages/contracts/src/index.js';
import { api, RequestError } from '../../shared/api/client.js';
import { Button } from '../../shared/ui/Button.js';
import { NumberField } from './NumberField.js';
import { SecuritySettings } from '../auth/SecuritySettings.js';
import { EngineSelector } from './EngineSelector.js';
import './settings.scss';

type NumericSetting = {
  [K in keyof BotSettings]: BotSettings[K] extends number ? K : never;
}[keyof BotSettings];

export function SettingsPage({
  settings,
  editable,
  demo,
}: {
  settings: BotSettings;
  editable: boolean;
  demo: boolean;
}) {
  const [draft, setDraft] = useState(settings);
  const [engines, setEngines] = useState<EngineOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let alive = true;
    void api<{ engines: EngineOption[] }>('/api/configuration')
      .then((result) => {
        if (alive) {
          setEngines(result.engines);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) setError('Cannot load available engines. Reload this page before saving.');
      });
    return () => {
      alive = false;
    };
  }, []);
  const disabled = (name?: keyof BotSettings) =>
    !editable || demo || busy || !loaded || (name === 'randomDelayMaxMs' && draft.dynamicDelay);
  function update<K extends keyof BotSettings>(name: K, value: BotSettings[K]): void {
    setDraft((current) => ({ ...current, [name]: value }));
    setSaved(false);
  }
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDetails({});
    setSaved(false);
    try {
      const result = await api<{ settings: BotSettings }>('/api/settings', 'PUT', draft);
      setDraft(result.settings);
      setSaved(true);
    } catch (error) {
      if (error instanceof RequestError) {
        setError(error.message);
        setDetails(error.details);
      } else setError('Settings could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  }
  const number = (
    name: NumericSetting,
    label: string,
    min: number,
    max: number,
    description: string,
    step = 1,
  ) => (
    <NumberField
      name={name}
      label={label}
      value={draft[name]}
      onChange={(value) => update(name, value)}
      min={min}
      max={max}
      step={step}
      description={description}
      disabled={disabled(name)}
      error={details[name]?.[0]}
    />
  );
  const changed = JSON.stringify(draft) !== JSON.stringify(settings);
  return (
    <section className="page-section settings-page">
      <div className="section-heading">
        <div>
          <h2>Settings</h2>
          <p>Configure the next session. Changes are saved on this machine.</p>
        </div>
      </div>
      {!editable && !demo && (
        <div className="notice">
          Finish the current session to edit settings. Pausing stops new pairings while ongoing
          games continue.
        </div>
      )}
      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}
      <form
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <section className="settings-section">
          <div className="settings-section__description">
            <h3>Engine</h3>
            <p>The analysis engine and the resources it can use.</p>
          </div>
          <div className="settings-section__fields">
            <EngineSelector
              engines={engines}
              value={draft.engineId}
              onChange={(value) => update('engineId', value)}
              disabled={disabled()}
            />
            <div className="settings-field-grid">
              {number(
                'depth',
                'Search depth',
                1,
                40,
                'Target depth; shortened when the clock budget is tight.',
              )}
              {number(
                'evaluationDepth',
                'Evaluation depth',
                1,
                40,
                'Deeper evaluation and alternative-move verification use this depth.',
              )}
              {number('maxEngines', 'Engine workers', 1, 32, 'Shared by all accounts and games.')}
              {number(
                'hashMb',
                'Hash per worker (MB)',
                16,
                512,
                'Memory allocated to each engine.',
              )}
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section__description">
            <h3>Matchmaking</h3>
            <p>Choose time controls and set the shared session limits.</p>
          </div>
          <div className="settings-section__fields">
            <fieldset className="pool-selector" disabled={disabled('gameTypes')}>
              <legend>Time controls</legend>
              <p>Standard rated pools. Searches rotate through your selection.</p>
              <div>
                {SUPPORTED_POOLS.map((pool) => (
                  <label key={pool} className={draft.gameTypes.includes(pool) ? 'is-selected' : ''}>
                    <input
                      type="checkbox"
                      checked={draft.gameTypes.includes(pool)}
                      onChange={(event) =>
                        update(
                          'gameTypes',
                          event.target.checked
                            ? [...draft.gameTypes, pool]
                            : draft.gameTypes.filter((value) => value !== pool),
                        )
                      }
                    />
                    <span>{pool}</span>
                  </label>
                ))}
              </div>
              {details.gameTypes && <p className="field-error">{details.gameTypes[0]}</p>}
            </fieldset>
            <div className="settings-field-grid">
              {number(
                'totalMatches',
                'Session game limit',
                1,
                1_000_000,
                'Unique completed games, across all accounts.',
              )}
              {number(
                'maxConcurrentGames',
                'Simultaneous games',
                1,
                100,
                'Searches also reserve a game slot.',
              )}
            </div>
            <label
              className="switch-field"
              htmlFor="drawManagedAccounts"
              aria-label="Draw between managed accounts"
            >
              <input
                id="drawManagedAccounts"
                type="checkbox"
                checked={draft.drawManagedAccounts}
                disabled={disabled('drawManagedAccounts')}
                onChange={(event) => update('drawManagedAccounts', event.target.checked)}
              />
              <span>
                <strong>Draw between managed accounts</strong>
                <small>Offer and accept a draw when two of your accounts meet.</small>
              </span>
            </label>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section__description">
            <h3>Move behavior</h3>
            <p>Control move selection and optional delays.</p>
          </div>
          <div className="settings-section__fields">
            <div className="settings-field-grid">
              <div className="form-field">
                <label htmlFor="movePolicy">Move selection</label>
                <select
                  id="movePolicy"
                  value={draft.movePolicy}
                  disabled={disabled('movePolicy')}
                  onChange={(event) =>
                    update('movePolicy', event.target.value as BotSettings['movePolicy'])
                  }
                >
                  <option value="best">Best move</option>
                  <option value="balanced">Balanced alternatives</option>
                </select>
                <p>Balanced selects an evaluated alternative near the mean.</p>
              </div>
              <div className="settings-delay">
                <label className="switch-field" htmlFor="dynamicDelay" aria-label="Dynamic delay">
                  <input
                    id="dynamicDelay"
                    type="checkbox"
                    role="switch"
                    checked={draft.dynamicDelay}
                    aria-checked={draft.dynamicDelay}
                    disabled={disabled('dynamicDelay')}
                    aria-describedby="dynamic-delay-help"
                    onChange={(event) => update('dynamicDelay', event.target.checked)}
                  />
                  <span>
                    <strong>Dynamic delay</strong>
                    <small id="dynamic-delay-help">
                      Starts with 40 moves; adapts to the clock, increment, and game progress.
                    </small>
                  </span>
                </label>
                {number(
                  'randomDelayMaxMs',
                  'Maximum delay (ms)',
                  0,
                  10_000,
                  draft.dynamicDelay
                    ? 'Ignored while Dynamic delay is on.'
                    : 'Random total turn delay, including queue and analysis time; 0 disables it.',
                )}
              </div>
            </div>
            <details className="advanced-settings">
              <summary>Alternative move settings</summary>
              <div className="settings-field-grid">
                {number(
                  'variations',
                  'Candidate variations',
                  2,
                  10,
                  'Used by balanced selection and deliberate mistakes.',
                )}
                {number(
                  'mistakeProbability',
                  'Mistake probability (%)',
                  0,
                  100,
                  'Choose a weaker verified move. 0 disables this.',
                )}
                {number(
                  'mistakeKeep',
                  'Retained advantage (pawns)',
                  0,
                  5,
                  'A mistake must preserve at least this advantage.',
                  0.5,
                )}
              </div>
              <p>
                Alternative candidates are verified at your evaluation depth or search depth,
                whichever is higher.
              </p>
            </details>
            <label
              className="switch-field"
              htmlFor="claimVictory"
              aria-label="Claim available victories"
            >
              <input
                id="claimVictory"
                type="checkbox"
                checked={draft.claimVictory}
                disabled={disabled('claimVictory')}
                onChange={(event) => update('claimVictory', event.target.checked)}
              />
              <span>
                <strong>Claim available victories</strong>
                <small>Claim only after Lichess confirms the opponent has left.</small>
              </span>
            </label>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section__description">
            <h3>History</h3>
            <p>Control how much completed game history to keep.</p>
          </div>
          <div className="settings-section__fields">
            {number(
              'historyLimit',
              'Saved games',
              10,
              1000,
              'Oldest entries are removed when this limit is reached.',
            )}
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section__description">
            <h3>Application</h3>
            <p>Browser identity, startup behavior, and the local dashboard.</p>
          </div>
          <div className="settings-section__fields">
            <div className="form-field">
              <label htmlFor="userAgent">User-Agent</label>
              <textarea
                id="userAgent"
                value={draft.userAgent}
                onChange={(event) => update('userAgent', event.target.value)}
                rows={3}
                required
                maxLength={512}
                disabled={disabled()}
                aria-invalid={!!details.userAgent?.length}
                aria-describedby={`user-agent-help${details.userAgent?.length ? ' user-agent-error' : ''}`}
              />
              <small id="user-agent-help">
                Used by both Lichess HTTP and WebSocket connections.
              </small>
              {details.userAgent?.[0] && (
                <p className="field-error" id="user-agent-error">
                  {details.userAgent[0]}
                </p>
              )}
            </div>
            {number(
              'dashboardPort',
              'Dashboard port',
              1024,
              65535,
              'Restart the application after changing the port.',
            )}
            <div className="settings-field-grid">
              {number(
                'requestAttempts',
                'Lichess request attempts',
                1,
                10,
                'Total attempts for HTTP requests and socket connections.',
              )}
              {number(
                'requestDelayMs',
                'Retry interval (ms)',
                100,
                60_000,
                'Wait between attempts. Lichess rate-limit delays take precedence.',
              )}
            </div>
            <div className="form-field">
              <label htmlFor="logLevel">Log level</label>
              <select
                id="logLevel"
                value={draft.logLevel}
                onChange={(event) =>
                  update('logLevel', event.target.value as BotSettings['logLevel'])
                }
                disabled={disabled()}
              >
                {['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'].map((level) => (
                  <option value={level} key={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            <label className="switch-field" aria-label="Start a session on application launch">
              <input
                type="checkbox"
                checked={draft.autoStart}
                onChange={(event) => update('autoStart', event.target.checked)}
                disabled={disabled()}
              />
              <span>
                <strong>Start a session on application launch</strong>
                <small>Uses saved accounts and settings when the application starts.</small>
              </span>
            </label>
          </div>
        </section>
        <div className="settings-save">
          <span className={saved ? 'save-feedback' : 'muted'} role="status">
            {saved ? (
              <>
                <Check />
                Settings saved
              </>
            ) : changed ? (
              'Unsaved changes'
            ) : (
              'All changes saved'
            )}
          </span>
          <div>
            <Button
              variant="ghost"
              disabled={disabled()}
              onClick={() => {
                setDraft({ ...DEFAULT_SETTINGS });
                setSaved(false);
              }}
            >
              Restore defaults
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={disabled() || !changed}
            >
              <Save />
              Save settings
            </Button>
          </div>
        </div>
      </form>
      <SecuritySettings demo={demo} />
    </section>
  );
}
