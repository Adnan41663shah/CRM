import React from 'react';
import { cn } from '@/utils/cn';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Optional label shown below the spinner (recommended for lg / full-page) */
  label?: string;
  /** When true, centers the loader in the viewport (e.g. initial auth load) */
  fullPage?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className,
  label,
  fullPage = false,
}) => {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-10 h-10',
    lg: 'w-14 h-14 sm:w-16 sm:h-16',
  };

  const dotSizeClasses = {
    sm: 'w-1 h-1',
    md: 'w-1.5 h-1.5',
    lg: 'w-2 h-2',
  };

  const showLabel = (size === 'lg' || fullPage) && label !== undefined;

  const spinner = (
    <div className={cn('flex flex-col items-center justify-center gap-4', className)}>
      {size === 'sm' ? (
        /* Compact spinner for buttons / inline */
        <div
          className={cn(
            'relative rounded-full border-2 border-primary-200 border-t-primary-500',
            'animate-loader-spin',
            sizeClasses.sm
          )}
          aria-hidden
        />
      ) : (
        /* Dual-ring + dots for content / page load */
        <div className={cn('relative flex items-center justify-center', sizeClasses[size])}>
          {/* Outer rotating ring with gradient stroke effect */}
          <div
            className={cn(
              'absolute inset-0 rounded-full border-2 border-transparent',
              'border-t-primary-500 border-r-primary-400/80',
              'animate-loader-spin',
              size === 'lg' && 'border-[3px]'
            )}
            style={{
              borderTopColor: 'var(--color-primary-500)',
              borderRightColor: 'var(--color-primary-400)',
            }}
            aria-hidden
          />
          {/* Inner ring - reverse spin + pulse */}
          <div
            className={cn(
              'absolute inset-[22%] rounded-full border-2 border-primary-200/80',
              'animate-loader-pulse'
            )}
            aria-hidden
          />
          {/* Center dots - subtle bounce */}
          <div className="absolute flex items-center justify-center gap-0.5">
            <span
              className={cn(
                'rounded-full bg-primary-500 animate-loader-bounce',
                dotSizeClasses[size]
              )}
              style={{ animationDelay: '0ms' }}
            />
            <span
              className={cn(
                'rounded-full bg-primary-500 animate-loader-bounce',
                dotSizeClasses[size]
              )}
              style={{ animationDelay: '150ms' }}
            />
            <span
              className={cn(
                'rounded-full bg-primary-500 animate-loader-bounce',
                dotSizeClasses[size]
              )}
              style={{ animationDelay: '300ms' }}
            />
          </div>
        </div>
      )}
      {showLabel && (
        <p
          className={cn(
            'text-sm font-medium text-secondary-600 dark:text-secondary-400',
            'animate-loader-pulse'
          )}
        >
          {label}
        </p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div
        className="min-h-screen w-full flex flex-col items-center justify-center bg-background-main dark:bg-background-main"
        role="status"
        aria-live="polite"
        aria-label={label || 'Loading'}
      >
        {spinner}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-label={label || 'Loading'}>
      {spinner}
    </div>
  );
};

export default LoadingSpinner;
