import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Button.
 *
 * Variants mirror the actions used across the designs:
 *  - `primary`   emerald fill for the main CTA ("Commit Capital")
 *  - `outline`   hairline border on surface, for secondary actions
 *  - `ghost`     text-only, for nav and table row actions
 *  - `danger`    for destructive/irreversible actions (default, refund)
 *  - `terminal`  monospace, for the trading and oracle terminals
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-mono font-medium ' +
    'uppercase tracking-wide transition-colors duration-150 ' +
    'disabled:pointer-events-none disabled:opacity-45 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-background [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary-container text-on-primary-container hover:bg-primary ' +
          'shadow-[0_0_0_1px_rgba(78,222,163,0.25)]',
        outline:
          'border border-outline-variant bg-transparent text-on-surface hover:border-outline hover:bg-surface-container',
        ghost: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
        danger: 'bg-error-container text-on-error-container hover:bg-error hover:text-on-error',
        terminal:
          'border border-primary/40 bg-primary/5 text-primary hover:bg-primary/15 hover:border-primary/70',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-label-sm',
        md: 'h-10 px-4 text-label-md',
        lg: 'h-12 px-6 text-label-lg',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Renders the child element instead of a `<button>`, so an `<a>` or Next
   * `<Link>` can be styled identically without invalid nesting.
   */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
