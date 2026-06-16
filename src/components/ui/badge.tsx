import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-orange-500/20 text-orange-300',
        secondary: 'bg-slate-800 text-slate-300',
        destructive: 'bg-red-500/20 text-red-300',
        success: 'bg-green-500/20 text-green-300',
        warning: 'bg-yellow-500/20 text-yellow-300',
        outline: 'border border-slate-700 text-slate-400',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
