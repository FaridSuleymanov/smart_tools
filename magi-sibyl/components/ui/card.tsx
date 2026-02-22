import { forwardRef, HTMLAttributes } from 'react';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm ${className}`}
      {...props}
    />
  )
);
Card.displayName = 'Card';
