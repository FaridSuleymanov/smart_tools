import { HTMLAttributes } from 'react';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'destructive' | 'outline';
}

export function Badge({ className = '', variant = 'default', ...props }: BadgeProps) {
  const base = 'inline-flex items-center rounded-md font-semibold transition-colors';
  const variants = {
    default: 'bg-zinc-700 text-zinc-100',
    destructive: 'bg-red-600 text-white',
    outline: 'border border-zinc-600 text-zinc-300',
  };
  return <span className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
