import { forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  variant = 'default',
  className,
}, ref) {
  const variantStyles = {
    default: 'bg-card',
    primary: 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground',
    success: 'bg-gradient-to-br from-success to-success/80 text-success-foreground',
    warning: 'bg-gradient-to-br from-warning to-warning/80 text-warning-foreground',
    danger: 'bg-gradient-to-br from-destructive to-destructive/80 text-destructive-foreground',
  };

  const iconBgStyles = {
    default: 'bg-primary/10 text-primary',
    primary: 'bg-white/20 text-primary-foreground',
    success: 'bg-white/20 text-success-foreground',
    warning: 'bg-white/20 text-warning-foreground',
    danger: 'bg-white/20 text-destructive-foreground',
  };

  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <div
      className={cn(
        'card-stat relative overflow-hidden',
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className={cn(
            'text-sm font-medium',
            variant === 'default' ? 'text-muted-foreground' : 'text-current/80'
          )}>
            {title}
          </p>
          <p className="text-3xl font-bold">{value}</p>
          {change !== undefined && (
            <div className="flex items-center gap-1 text-sm">
              {isPositive && <ArrowUpRight className="h-4 w-4 text-success" />}
              {isNegative && <ArrowDownRight className="h-4 w-4 text-destructive" />}
              <span className={cn(
                'font-medium',
                isPositive && variant === 'default' && 'text-success',
                isNegative && variant === 'default' && 'text-destructive'
              )}>
                {isPositive ? '+' : ''}{change}%
              </span>
              {changeLabel && (
                <span className={cn(
                  variant === 'default' ? 'text-muted-foreground' : 'text-current/70'
                )}>
                  {changeLabel}
                </span>
              )}
            </div>
          )}
        </div>
        <div className={cn(
          'flex h-12 w-12 items-center justify-center rounded-xl',
          iconBgStyles[variant]
        )}>
          {icon}
        </div>
      </div>
      
      {/* Decorative element */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/5" />
    </div>
  );
}
