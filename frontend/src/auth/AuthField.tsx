import type { ReactNode } from "react";

export function AuthField({
  id,
  label,
  type = "text",
  autoComplete,
  value,
  onChange,
  error,
  hint,
  maxLength,
  endAction,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  maxLength?: number;
  endAction?: ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-ink">{label}</label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`field-control min-h-12 w-full rounded-lg border bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-forest focus:ring-4 focus:ring-forest/10 ${endAction ? "pr-20" : ""} ${error ? "border-red-600 focus:border-red-600 focus:ring-red-900/10" : "border-slate-300 hover:border-slate-400"}`}
        />
        {endAction && <div className="absolute inset-y-0 right-3 flex items-center">{endAction}</div>}
      </div>
      {hint && <p id={hintId} className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</p>}
      {error && <p id={errorId} className="mt-1.5 text-xs font-medium leading-5 text-red-700" role="alert">{error}</p>}
    </div>
  );
}
