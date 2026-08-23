import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, error, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-10 w-full rounded-md border border-concrete-dark bg-white px-3 text-sm text-ink-900 placeholder:text-ink-300',
      'focus:border-blueprint-400 focus:outline-none focus:ring-2 focus:ring-blueprint-100',
      error && 'border-clay-400 focus:border-clay-400 focus:ring-clay-100',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-md border border-concrete-dark bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300',
        'focus:border-blueprint-400 focus:outline-none focus:ring-2 focus:ring-blueprint-100',
        error && 'border-clay-400 focus:border-clay-400 focus:ring-clay-100',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }>(
  ({ className, error, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-concrete-dark bg-white px-3 text-sm text-ink-900',
        'focus:border-blueprint-400 focus:outline-none focus:ring-2 focus:ring-blueprint-100',
        error && 'border-clay-400',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
  required,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-700">
        {label} {required && <span className="text-rebar">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-400">{hint}</p>}
      {error && <p className="text-xs text-clay-500">{error}</p>}
    </div>
  );
}
