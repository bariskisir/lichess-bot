export function NumberField({
  name,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  description,
  disabled,
  error,
}: {
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  description: string;
  disabled: boolean;
  error?: string;
}) {
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        required
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={`${name}-help`}
      />
      <p id={`${name}-help`} className={error ? 'field-error' : ''}>
        {error ?? description}
      </p>
    </div>
  );
}
