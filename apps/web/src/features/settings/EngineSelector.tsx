import { Check, ChevronDown, Cpu } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { EngineOption } from '../../../../../packages/contracts/src/index.js';

export function EngineSelector({
  engines,
  value,
  onChange,
  disabled,
}: {
  engines: EngineOption[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const selected = engines.find((engine) => engine.id === value);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    optionsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, direction: -1 | 1) {
    event.preventDefault();
    const options = Array.from(
      optionsRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    options[(current + direction + options.length) % options.length]?.focus();
  }

  return (
    <div
      className={`engine-identity ${disabled ? 'engine-identity--disabled' : ''} ${open ? 'engine-identity--open' : ''}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className="engine-identity__trigger"
        aria-label="Engine"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled || engines.length === 0}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Cpu aria-hidden="true" />
        <span className="engine-identity__details">
          <strong>{selected?.name ?? 'Loading engines…'}</strong>
          <span>Lite · Standard chess</span>
        </span>
        <span className="engine-identity__status">
          {selected ? 'Installed' : 'Loading'}
          <ChevronDown aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div
          className="engine-identity__options"
          role="listbox"
          aria-label="Chess engines"
          ref={optionsRef}
        >
          {engines.map((engine) => (
            <button
              key={engine.id}
              type="button"
              role="option"
              aria-selected={engine.id === value}
              className="engine-identity__option"
              onClick={() => {
                onChange(engine.id);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') moveFocus(event, 1);
                else if (event.key === 'ArrowUp') moveFocus(event, -1);
                else if (event.key === 'Escape') {
                  event.preventDefault();
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              <span>{engine.name}</span>
              {engine.id === value && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
