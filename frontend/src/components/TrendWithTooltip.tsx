import React from 'react';
import { cn } from '@/utils/cn';
import Tooltip from './Tooltip';
import { calculateTrend, formatTrendDisplay } from '@/utils/dashboardTrend';

export interface TrendWithTooltipProps {
  /** Current period value */
  current: number;
  /** Previous period value */
  previous: number;
  /** Format values for tooltip display (e.g. counts, percentages, duration) */
  valueFormatter?: (n: number) => string;
  /** When true, up arrow is good (green); when false, down arrow is good (e.g. Avg Response Time) */
  isPositiveGood?: boolean;
  /** Metric label for tooltip context */
  label?: string;
  /** Additional class names for the trend span */
  className?: string;
  /** 'onDarkBg' uses white/red-200 for better contrast on dark backgrounds */
  variant?: 'default' | 'onDarkBg';
}

const defaultFormatter = (n: number) => n.toLocaleString();

/**
 * Displays trend percentage with a tooltip showing current vs previous period values.
 * Reusable across Admin, Center, and Sales dashboards.
 */
const TrendWithTooltip: React.FC<TrendWithTooltipProps> = ({
  current,
  previous,
  valueFormatter = defaultFormatter,
  isPositiveGood = true,
  label,
  className,
  variant = 'default',
}) => {
  const trend = calculateTrend(current, previous);
  const displayText = formatTrendDisplay(trend);

  const tooltipContent = label
    ? `${label} — Current: ${valueFormatter(current)} | Previous: ${valueFormatter(previous)}`
    : `Current: ${valueFormatter(current)} | Previous: ${valueFormatter(previous)}`;

  const isGood = isPositiveGood ? trend.isUp : !trend.isUp;
  const colorClass = variant === 'onDarkBg'
    ? (isGood ? 'text-white' : 'text-red-200')
    : (isGood ? 'text-[#1DB954]' : 'text-red-500 dark:text-red-400');

  return (
    <Tooltip content={tooltipContent} position="top">
      <span
        className={cn(
          'flex items-center cursor-help',
          colorClass,
          className
        )}
      >
        {displayText}
      </span>
    </Tooltip>
  );
};

export default TrendWithTooltip;
