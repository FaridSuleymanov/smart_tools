import { forwardRef, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', disabled, ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:pointer-events-none disabled:opacity-40';

    const variants = {
      default: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/30',
      destructive: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30',
      outline: 'border border-zinc-600 hover:bg-zinc-800 text-zinc-200',
      ghost: 'hover:bg-zinc-800 text-zinc-300',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-5 py-2.5 text-sm',
      lg: 'px-8 py-3.5 text-base',
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
