/**
 * Dashboard trend calculation utilities.
 * Used across Admin, Center, and Sales dashboards for consistent trend logic.
 */

export interface TrendResult {
  value: number;
  isUp: boolean;
}

/**
 * Calculate percentage change between current and previous period.
 * @param current - Value for the current period
 * @param previous - Value for the previous period
 * @returns Trend with absolute percentage and direction
 */
export function calculateTrend(current: number, previous: number): TrendResult {
  if (previous === 0) {
    if (current > 0) return { value: 100, isUp: true };
    return { value: 0, isUp: true };
  }
  const trend = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(Math.round(trend)),
    isUp: trend >= 0,
  };
}

/**
 * Format trend for display (e.g. "↑ 606%" or "↓ 12%")
 */
export function formatTrendDisplay(trend: TrendResult): string {
  const arrow = trend.isUp ? '↑' : '↓';
  return `${arrow} ${trend.value}%`;
}

/**
 * Format duration in ms to human-readable string (e.g. "89h 16m")
 */
export function formatDuration(ms: number): string {
  if (ms === 0) return '0m';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
