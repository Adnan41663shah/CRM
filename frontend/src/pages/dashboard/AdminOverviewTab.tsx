
import React from 'react';
import { useQuery } from 'react-query';
import {
  Users,
  FileText,
  Clock,
  Zap,
  Award,
  GraduationCap,
  Activity,
  UserCheck,
  ArrowUpRight,
  AlertCircle
} from 'lucide-react';
import { subDays, subMonths, format } from 'date-fns';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import { AdminDashboardOverview } from '@/types';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import TrendWithTooltip from '@/components/TrendWithTooltip';
import { calculateTrend, formatDuration } from '@/utils/dashboardTrend';
import AdvancedAnalytics from '@/components/AdvancedAnalytics';
import { DateRangeOption } from '@/components/DashboardFilters';

interface OverviewProps {
  dateRange: DateRangeOption;
  customDateFrom: string;
  customDateTo: string;
}

export const AdminOverviewTab: React.FC<OverviewProps> = ({ dateRange, customDateFrom, customDateTo }) => {

  const getApiParams = () => {
    if (dateRange === 'custom' && customDateFrom && customDateTo) {
      return { dateRange: 'custom', dateFrom: customDateFrom, dateTo: customDateTo };
    }

    const today = new Date();
    const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');

    if (dateRange === '7d') {
      const from = subDays(today, 7);
      return { dateRange: 'custom', dateFrom: formatDate(from), dateTo: formatDate(today) };
    }
    
    if (dateRange === '30d') {
      const from = subDays(today, 30);
      return { dateRange: 'custom', dateFrom: formatDate(from), dateTo: formatDate(today) };
    }
    
    if (dateRange === 'quarter') {
      const from = subMonths(today, 4);
      return { dateRange: 'custom', dateFrom: formatDate(from), dateTo: formatDate(today) };
    }

    return { dateRange };
  };
  
  const { data: overviewData, isLoading } = useQuery(
    ['admin-dashboard-overview', dateRange, customDateFrom, customDateTo],
    () => apiService.inquiries.getAdminDashboardOverview(getApiParams()),
    {
      staleTime: 600000, 
      refetchOnWindowFocus: false,
      refetchInterval: 600000, 
    }
  );

  const { data: allInquiriesData } = useQuery(
    ['all-inquiries-stats-calculation'],
    () => apiService.inquiries.getAll({ limit: 'all' }),
    {
      staleTime: 300000,
      refetchOnWindowFocus: false,
    }
  );

  const calculatedStats = React.useMemo(() => {
    if (!allInquiriesData?.data?.inquiries) return null;
    const inquiries = allInquiriesData.data.inquiries as import('@/types').Inquiry[];

    const getDateBoundaries = () => {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

      if (dateRange === 'custom' && customDateFrom && customDateTo) {
        const start = new Date(customDateFrom).setHours(0, 0, 0, 0);
        const end = new Date(customDateTo).setHours(23, 59, 59, 999);
        const durationMs = end - start;
        const prevEnd = start - 1;
        const prevStart = prevEnd - durationMs;
        
        return {
          current: { start, end },
          previous: { start: prevStart, end: prevEnd }
        };
      }

      const getRange = (days: number, isMonth = false) => {
        const currentStart = isMonth ? subMonths(today, days).setHours(0, 0, 0, 0) : subDays(today, days).setHours(0, 0, 0, 0);
        const previousStart = isMonth ? subMonths(today, days * 2).setHours(0, 0, 0, 0) : subDays(today, days * 2).setHours(0, 0, 0, 0);
        const previousEnd = currentStart - 1;
        return {
            current: { start: currentStart, end: todayEnd },
            previous: { start: previousStart, end: previousEnd }
        };
      };

      if (dateRange === 'today') return getRange(0);
      if (dateRange === '7d') return getRange(7);
      if (dateRange === '30d') return getRange(30);
      if (dateRange === 'quarter') return getRange(4, true);
      if (dateRange === 'lastWeek') return getRange(7);
      if (dateRange === 'lastMonth') return getRange(1, true);
      if (dateRange === 'lastYear') return getRange(12, true);
      
      return null;
    };

    const boundaries = getDateBoundaries();

    const filterByDateRange = (range: { start: number; end: number } | null) => {
      if (!range) return inquiries;
      return inquiries.filter(i => {
        const createdTime = new Date(i.createdAt).getTime();
        return createdTime >= range.start && createdTime <= range.end;
      });
    };

    const currentInquiries = filterByDateRange(boundaries?.current || null);
    const previousInquiries = filterByDateRange(boundaries?.previous || null);

    const presalesCount = currentInquiries.filter(i => i.department === 'presales').length;
    const prevPresalesCount = previousInquiries.filter(i => i.department === 'presales').length;
    const presalesTrend = calculateTrend(presalesCount, prevPresalesCount);

    const salesCount = currentInquiries.filter(i => i.department === 'sales').length;
    const prevSalesCount = previousInquiries.filter(i => i.department === 'sales').length;
    const salesTrend = calculateTrend(salesCount, prevSalesCount);

    const totalCount = presalesCount + salesCount;
    const prevTotalCount = prevPresalesCount + prevSalesCount;
    const totalTrend = calculateTrend(totalCount, prevTotalCount);

    // STATE-BASED: Check if inquiry is currently in converted/admitted state
    const isInState = (inquiry: typeof inquiries[0], leadStage: string, subStage: string): boolean => {
      if (!inquiry.followUps || inquiry.followUps.length === 0) return false;
      
      // Get the LATEST follow-up (by createdAt)
      const latestFollowUp = [...inquiry.followUps]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      return latestFollowUp.leadStage === leadStage && latestFollowUp.subStage === subStage;
    };

    // Filter inquiries by creation date range, then check current state
    const filterByStateInRange = (
      range: { start: number; end: number } | null,
      leadStage: string,
      subStage: string
    ) => {
      const filtered = filterByDateRange(range);
      return filtered.filter(i => isInState(i, leadStage, subStage));
    };

    const convertedCount = filterByStateInRange(boundaries?.current || null, 'Hot', 'Conversion').length;
    const prevConvertedCount = filterByStateInRange(boundaries?.previous || null, 'Hot', 'Conversion').length;
    const convertedTrend = calculateTrend(convertedCount, prevConvertedCount);

    const admittedCount = filterByStateInRange(boundaries?.current || null, 'Hot', 'Confirmed Admission').length;
    const prevAdmittedCount = filterByStateInRange(boundaries?.previous || null, 'Hot', 'Confirmed Admission').length;
    const admittedTrend = calculateTrend(admittedCount, prevAdmittedCount);

    const conversionRate = salesCount > 0 ? ((convertedCount / salesCount) * 100) : 0;
    const prevConversionRate = prevSalesCount > 0 ? ((prevConvertedCount / prevSalesCount) * 100) : 0;
    const conversionTrend = calculateTrend(conversionRate, prevConversionRate);

    // Get first attended time = earliest follow-up createdAt (O(n) per inquiry)
    const getFirstAttendedAt = (i: typeof inquiries[0]): number | null => {
      const fups = i.followUps;
      if (!fups || fups.length === 0) return null;
      let min = new Date(fups[0].createdAt).getTime();
      for (let j = 1; j < fups.length; j++) {
        const t = new Date(fups[j].createdAt).getTime();
        if (t < min) min = t;
      }
      return min;
    };

    // Avg Response Time: forwardedAt -> attendedAt only. Skip if no forwardedAt or not attended.
    const calculateAvgResponseTime = (inquiriesList: typeof inquiries): number => {
      let totalMs = 0;
      let count = 0;
      for (let idx = 0; idx < inquiriesList.length; idx++) {
        const i = inquiriesList[idx];
        if (!i.forwardedAt) continue;
        const attendedAt = getFirstAttendedAt(i);
        if (attendedAt === null) continue;
        const forwardedAt = new Date(i.forwardedAt).getTime();
        const diff = attendedAt - forwardedAt;
        if (diff >= 0) {
          totalMs += diff;
          count++;
        }
      }
      return count > 0 ? totalMs / count : 0;
    };

    const avgResponseTimeMs = calculateAvgResponseTime(currentInquiries);
    const prevAvgResponseTimeMs = calculateAvgResponseTime(previousInquiries);
    const responseTrend = calculateTrend(avgResponseTimeMs, prevAvgResponseTimeMs);

    return {
      totalCount, prevTotalCount, totalTrend,
      presalesCount, prevPresalesCount, presalesTrend,
      salesCount, prevSalesCount, salesTrend,
      convertedCount, prevConvertedCount, convertedTrend,
      admittedCount, prevAdmittedCount, admittedTrend,
      conversionRate, prevConversionRate, conversionTrend,
      avgResponseTimeMs, prevAvgResponseTimeMs, responseTrend
    };
  }, [allInquiriesData, dateRange, customDateFrom, customDateTo]);

  const statCards = React.useMemo(() => {
    if (!calculatedStats) return [];
    return [
      {
        label: 'Total Enquiries',
        value: calculatedStats.totalCount.toLocaleString(),
        icon: FileText,
        color: 'text-primary-500',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.totalCount,
        previous: calculatedStats.prevTotalCount,
        valueFormatter: (n: number) => n.toLocaleString(),
        isPositiveGood: true
      },
      {
        label: 'Presales Inquiries',
        value: calculatedStats.presalesCount.toLocaleString(),
        icon: Users,
        color: 'text-primary-500',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.presalesCount,
        previous: calculatedStats.prevPresalesCount,
        valueFormatter: (n: number) => n.toLocaleString(),
        isPositiveGood: true
      },
      {
        label: 'Sales Inquiries',
        value: calculatedStats.salesCount.toLocaleString(),
        icon: Activity,
        color: 'text-primary-500',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.salesCount,
        previous: calculatedStats.prevSalesCount,
        valueFormatter: (n: number) => n.toLocaleString(),
        isPositiveGood: true
      },
      {
        label: 'Converted',
        value: calculatedStats.convertedCount.toLocaleString(),
        icon: Zap,
        color: 'text-primary-500',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.convertedCount,
        previous: calculatedStats.prevConvertedCount,
        valueFormatter: (n: number) => n.toLocaleString(),
        isPositiveGood: true
      },
      {
        label: 'Admitted',
        value: calculatedStats.admittedCount.toLocaleString(),
        icon: GraduationCap,
        color: 'text-primary-500',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.admittedCount,
        previous: calculatedStats.prevAdmittedCount,
        valueFormatter: (n: number) => n.toLocaleString(),
        isPositiveGood: true
      },
      {
        label: 'Overall Conversion %',
        value: `${calculatedStats.conversionRate.toFixed(1)}%`,
        icon: ArrowUpRight,
        color: 'text-primary-500',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.conversionRate,
        previous: calculatedStats.prevConversionRate,
        valueFormatter: (n: number) => `${n.toFixed(1)}%`,
        isPositiveGood: true
      },
      {
        label: 'Avg Response Time',
        value: formatDuration(calculatedStats.avgResponseTimeMs),
        icon: Clock,
        color: 'text-primary-500',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.avgResponseTimeMs,
        previous: calculatedStats.prevAvgResponseTimeMs,
        valueFormatter: formatDuration,
        isPositiveGood: false
      }
    ];
  }, [calculatedStats]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-72 sm:min-h-96">
        <LoadingSpinner size="lg" label="Loading overview..." />
      </div>
    );
  }

  const overview = overviewData?.data as AdminDashboardOverview | undefined;
  if (!overview) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
          Unable to load dashboard data
        </h3>
      </div>
    );
  }

  const { topPerformers, recentActivities } = overview;

  const formatAction = (action: string) => {
    const actionMap: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
      'created': { label: 'Created', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', icon: <FileText className="h-3.5 w-3.5" /> },
      'claimed': { label: 'Claimed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', icon: <UserCheck className="h-3.5 w-3.5" /> },
      'assigned': { label: 'Assigned', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', icon: <Users className="h-3.5 w-3.5" /> },
      'reassigned': { label: 'Reassigned', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
      'forwarded_to_sales': { label: 'Forwarded', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', icon: <Zap className="h-3.5 w-3.5" /> },
      'moved_to_unattended': { label: 'Unattended', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: <AlertCircle className="h-3.5 w-3.5" /> },
    };
    return actionMap[action] || { label: action, color: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-300', icon: <Activity className="h-3.5 w-3.5" /> };
  };

  const timeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2">
        {!calculatedStats ? (
            Array(7).fill(0).map((_, i) => (
              <div key={i} className="bg-white dark:bg-secondary-900 rounded-xl p-2 border border-secondary-200 dark:border-secondary-800 shadow-sm animate-pulse h-24"></div>
            ))
        ) : (
          statCards.map((card, index) => {
             const Icon = card.icon;
             return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={cn(
                  "relative rounded-xl shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_28px_rgba(79,70,229,0.35),0px_0px_40px_rgba(244,122,31,0.25)] hover:-translate-y-1 transition-all duration-350 ease-out overflow-hidden min-h-[100px] flex flex-col justify-between group",
                  "before:absolute before:inset-0 before:bg-[linear-gradient(135deg,#F9B27D_0%,#F6A35F_35%,#F2C19A_70%,#F7E1CC_100%)] before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-350 before:ease-out",
                  card.bg
                )}
              >
                 {/* Top accent line / border strip */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-primary-500 to-primary-300" />

                <div className="relative z-10 px-4 pt-4"> {/* Added padding */}
                   <p className="text-[12px] font-medium text-black group-hover:text-[#2A2A2A] dark:text-secondary-400 mb-1 uppercase tracking-wider transition-colors duration-350">
                     {card.label}
                   </p>
                   <h3 className="text-2xl font-bold text-text-primary group-hover:text-text-primary dark:text-white tracking-tight transition-colors duration-350">
                     {card.value}
                   </h3>
                </div>
                
                <div className="relative z-10 px-4 pb-3 flex items-center text-xs font-bold">
                  <TrendWithTooltip
                    current={card.current}
                    previous={card.previous}
                    valueFormatter={card.valueFormatter}
                    isPositiveGood={card.isPositiveGood}
                    label={card.label}
                  />
                </div>

                {/* Subtile background icon */}
                <div className={cn("absolute bottom-2 right-2 opacity-1 pointer-events-none transition-transform duration-300 group-hover:scale-110", card.color)}> 
                  <Icon className="h-10 w-10 text-current" />
                </div>
              </motion.div>
             );
          })
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="bg-white dark:bg-secondary-900 rounded-xl px-3 py-1 border border-secondary-200 dark:border-secondary-800 shadow-sm"
      >
        <h3 className="text-lg font-bold text-secondary-900 dark:text-white mb-2">
          End-to-End Sales Funnel
        </h3>
        
        <div className="overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex items-center justify-center min-w-max lg:min-w-0">
            <div className="relative shrink-0 w-[160px] sm:w-[180px] lg:flex-1 h-[125px] bg-primary-100 dark:bg-primary-900/70 flex flex-col justify-center items-center clip-path-arrow-both rounded-xl hover:brightness-105 hover:shadow-[0px_6px_20px_rgba(79,70,229,0.35)] dark:hover:brightness-110 transition-all duration-300 group">
              <div className="text-sm font-semibold text-text-primary dark:text-white mb-1 group-hover:text-black dark:group-hover:text-white">Enquiries</div>
              <div className="text-4xl font-bold text-text-primary dark:text-white mb-1 group-hover:text-black dark:group-hover:text-white">
                {calculatedStats ? calculatedStats.totalCount.toLocaleString() : '0'}
              </div>
              <div className="text-xs font-bold flex items-center gap-1 group-hover:scale-105 transition-transform">
                {calculatedStats ? (
                  <TrendWithTooltip
                    current={calculatedStats.totalCount}
                    previous={calculatedStats.prevTotalCount}
                    valueFormatter={(n) => n.toLocaleString()}
                    isPositiveGood={true}
                    label="Enquiries"
                    className="dark:text-white!"
                  />
                ) : (
                  <span className="text-gray-500 dark:text-primary-200/70">0%</span>
                )}
              </div>
            </div>

            <div className="relative shrink-0 w-[160px] sm:w-[180px] lg:flex-1 h-[125px] bg-primary-200 dark:bg-primary-800/80 flex flex-col justify-center items-center clip-path-arrow-both rounded-lg hover:brightness-105 hover:shadow-[0px_6px_20px_rgba(79,70,229,0.35)] dark:hover:brightness-110 transition-all duration-300 group">
              <div className="text-sm font-semibold text-text-primary dark:text-white mb-1 group-hover:text-black dark:group-hover:text-white">Presales</div>
              <div className="text-4xl font-bold text-text-primary dark:text-white mb-1 group-hover:text-black dark:group-hover:text-white">
                {calculatedStats ? calculatedStats.presalesCount.toLocaleString() : '0'}
              </div>
              <div className="text-xs font-bold flex items-center gap-1 group-hover:scale-105 transition-transform">
                {calculatedStats ? (
                  <TrendWithTooltip
                    current={calculatedStats.presalesCount}
                    previous={calculatedStats.prevPresalesCount}
                    valueFormatter={(n) => n.toLocaleString()}
                    isPositiveGood={true}
                    label="Presales"
                    className="dark:text-white!"
                  />
                ) : (
                  <span className="text-gray-500 dark:text-primary-200/70">0%</span>
                )}
              </div>
            </div>

            <div className="relative shrink-0 w-[160px] sm:w-[180px] lg:flex-1 h-[125px] bg-primary-300 dark:bg-primary-700/80 flex flex-col justify-center items-center clip-path-arrow-both rounded-lg hover:brightness-105 hover:shadow-[0px_6px_20px_rgba(79,70,229,0.35)] dark:hover:brightness-110 transition-all duration-300 group">
              <div className="text-sm font-semibold text-white mb-1">Sales</div>
              <div className="text-4xl font-bold text-white mb-1">
                {calculatedStats ? calculatedStats.salesCount.toLocaleString() : '0'}
              </div>
              <div className="text-xs font-bold flex items-center gap-1 group-hover:scale-105 transition-transform">
                {calculatedStats ? (
                  <TrendWithTooltip
                    current={calculatedStats.salesCount}
                    previous={calculatedStats.prevSalesCount}
                    valueFormatter={(n) => n.toLocaleString()}
                    isPositiveGood={true}
                    label="Sales"
                    variant="onDarkBg"
                  />
                ) : (
                  <span className="text-white/80">0%</span>
                )}
              </div>
            </div>

            <div className="relative shrink-0 w-[160px] sm:w-[180px] lg:flex-1 h-[125px] bg-primary-500 dark:bg-primary-600/85 flex flex-col justify-center items-center clip-path-arrow-both rounded-lg hover:brightness-105 hover:shadow-[0px_6px_20px_rgba(79,70,229,0.35)] dark:hover:brightness-110 transition-all duration-300 group">
              <div className="text-sm font-semibold text-white mb-1">Converted</div>
              <div className="text-4xl font-bold text-white mb-1">
                {calculatedStats ? calculatedStats.convertedCount.toLocaleString() : '0'}
              </div>
              <div className="text-xs font-bold flex items-center gap-1 group-hover:scale-105 transition-transform">
                {calculatedStats ? (
                  <TrendWithTooltip
                    current={calculatedStats.convertedCount}
                    previous={calculatedStats.prevConvertedCount}
                    valueFormatter={(n) => n.toLocaleString()}
                    isPositiveGood={true}
                    label="Converted"
                    variant="onDarkBg"
                  />
                ) : (
                  <span className="text-white/80">0%</span>
                )}
              </div>
            </div>

            <div className="relative shrink-0 w-[160px] sm:w-[180px] lg:flex-1 h-[125px] bg-primary-500 dark:bg-primary-800/85 flex flex-col justify-center items-center clip-path-arrow-both rounded-xl hover:brightness-105 hover:shadow-[0px_6px_20px_rgba(79,70,229,0.35)] dark:hover:brightness-110 transition-all duration-300 group">
              <div className="text-sm font-semibold text-white mb-1">Admission</div>
              <div className="text-4xl font-bold text-white mb-1">
                {calculatedStats ? calculatedStats.admittedCount.toLocaleString() : '0'}
              </div>
              <div className="text-xs font-bold flex items-center gap-1 group-hover:scale-105 transition-transform">
                {calculatedStats ? (
                  <TrendWithTooltip
                    current={calculatedStats.admittedCount}
                    previous={calculatedStats.prevAdmittedCount}
                    valueFormatter={(n) => n.toLocaleString()}
                    isPositiveGood={true}
                    label="Admission"
                    variant="onDarkBg"
                  />
                ) : (
                  <span className="text-white/80">0%</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="mb-6">
        <AdvancedAnalytics 
          data={overview.advancedAnalytics || { performance: [], source: [], location: [], course: [] }} 
          dateRangeLabel={dateRange === 'custom' ? `${customDateFrom} - ${customDateTo}` : dateRange.replace(/([A-Z])/g, ' $1').trim()} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.75 }}
          className="bg-white dark:bg-secondary-900 rounded-xl p-5 border border-secondary-200 dark:border-secondary-800"
        >
          <div className="flex items-center gap-2 mb-4">
            <Award className="h-5 w-5 text-primary-500" />
            <h3 className="text-base font-semibold text-secondary-900 dark:text-white">Top Sales Performers</h3>
          </div>
          <div className="space-y-3">
            {topPerformers.sales.length > 0 ? (
              topPerformers.sales.map((user, index) => (
                <div key={user.userId} className="flex items-start gap-3 p-3 rounded-lg hover:bg-primary-100 dark:hover:bg-secondary-800 transition-colors border-l-2 border-transparent hover:border-primary-500">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0",
                    "bg-linear-to-r from-primary-500 to-primary-300"
                  )}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary dark:text-white truncate mb-1.5">{user.name}</div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="flex flex-col">
                        <span className="text-[#8A8A8A] dark:text-secondary-400">Attended</span>
                        <span className="font-bold text-text-primary dark:text-white">{user.totalAttended}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[#8A8A8A] dark:text-secondary-400">Converted</span>
                        <span className="font-bold text-primary-500">{user.converted}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[#8A8A8A] dark:text-secondary-400">Admitted</span>
                        <span className="font-bold text-success-500">{user.admitted}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-primary-500 dark:text-emerald-400">{user.conversionRate}%</div>
                    <div className="text-xs text-[#8A8A8A] dark:text-secondary-400">conv. rate</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-secondary-500 dark:text-secondary-400 text-sm">
                No sales performance data
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.8 }}
          className="bg-white dark:bg-secondary-900 rounded-xl p-5 border border-secondary-200 dark:border-secondary-800"
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-primary-500" />
            <h3 className="text-base font-semibold text-secondary-900 dark:text-white">Top Presales Performers</h3>
          </div>
          <div className="space-y-3">
            {topPerformers.presales.length > 0 ? (
              topPerformers.presales.map((user, index) => (
                <div key={user.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-primary-100 dark:hover:bg-secondary-800 transition-colors border-l-2 border-transparent hover:border-primary-500">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm",
                     "bg-linear-to-r from-primary-500 to-primary-300"
                  )}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary dark:text-white truncate">{user.name}</div>
                    <div className="text-xs text-secondary-400 dark:text-secondary-400">{user.totalCreated} created</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-primary-500 dark:text-indigo-400">{user.totalForwarded}</div>
                    <div className="text-xs text-secondary-400 dark:text-secondary-400">forwarded</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-secondary-500 dark:text-secondary-400 text-sm">
                No presales performance data
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.85 }}
          className="bg-white dark:bg-secondary-900 rounded-xl p-5 border border-secondary-200 dark:border-secondary-800"
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-primary-500" />
            <h3 className="text-base font-semibold text-secondary-900 dark:text-white">Recent Activity</h3>
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {recentActivities.length > 0 ? (
              recentActivities.map((activity) => {
                const actionInfo = formatAction(activity.action);
                return (
                  <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-[#FFF5EE] dark:hover:bg-secondary-800 transition-colors">
                    <div className={cn("p-1.5 rounded-lg bg-primary-100 text-primary-500")}>
                      {actionInfo.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary dark:text-white">
                        <span className="font-medium">{activity.actorName}</span>
                        {' '}<span className="text-[#9A9A9A] dark:text-secondary-400 ">{actionInfo.label.toLowerCase()}</span>{' '}
                        <span className="font-medium">{activity.inquiryName}</span>
                        {activity.targetUserName && (
                          <>
                            {' '}<span className="text-[#9A9A9A] dark:text-secondary-400">to</span>{' '}
                            <span className="font-medium">{activity.targetUserName}</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-[#9A9A9A] dark:text-secondary-400 mt-0.5">{timeAgo(activity.createdAt)}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-secondary-500 dark:text-secondary-400 text-sm">
                No recent activity
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
