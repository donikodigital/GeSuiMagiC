'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-blueprint text-white hover:bg-blueprint-800 focus-visible:outline-blueprint-500',
  secondary: 'bg-ink-900 text-white hover:bg-ink-800',
  outline: 'border border-concrete-dark bg-transparent text-ink-900 hover:bg-concrete-light',
  ghost: 'bg-transparent text-ink-700 hover:bg-concrete-light',
  danger: 'bg-clay text-white hover:bg-clay-600',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
