import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  Users,
  FileText,
  Clock,
  AlertCircle,
  Activity,
  UserCheck,
  ArrowUpRight,
  Zap,
  GraduationCap,
  MapPin,
  RefreshCw,
  Award,
  ArrowLeft
} from 'lucide-react';
import { subDays, subMonths, format } from 'date-fns';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { AdminDashboardOverview, Inquiry } from '@/types';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import TrendWithTooltip from '@/components/TrendWithTooltip';
import { calculateTrend, formatDuration } from '@/utils/dashboardTrend';
import AdvancedAnalytics from '@/components/AdvancedAnalytics';
import DashboardFilters, { DateRangeOption } from '@/components/DashboardFilters';

const CenterDashboard: React.FC = () => {
  const { centerLocation } = useParams<{ centerLocation: string }>();
  const decodedLocation = centerLocation ? decodeURIComponent(centerLocation) : '';
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();

  const hasPermission = useMemo(() => {
    if (!user) return false;
    if (user.role !== 'sales') return true;
    return user.centerPermissions?.includes(decodedLocation);
  }, [user, decodedLocation]);

  // Dynamically refresh profile if permission is missing
  useEffect(() => {
    if (user?.role === 'sales' && !user?.centerPermissions?.includes(decodedLocation)) {
      refreshProfile();
    }
  }, [decodedLocation, user?.role, refreshProfile]);

  // Filter State
  const [dateRange, setDateRange] = useState<DateRangeOption>('30d');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');

  // Build API params based on current filter
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
  
  // 1. Fetch Dashboard Stats (Charts, Top Performers, Recent Activity)
  const statsQuery = useQuery(
    ['center-dashboard-stats', decodedLocation, dateRange, customDateFrom, customDateTo],
    () => apiService.inquiries.getCenterDashboardStats(decodedLocation, getApiParams()),
    {
      enabled: !!decodedLocation && hasPermission,
      staleTime: 600000, // 10 minutes
      refetchInterval: 600000,
      refetchOnWindowFocus: false,
    }
  );
  const { data: statsData, isLoading: isStatsLoading, refetch: refetchStats } = statsQuery;
  const isStatsRefetching = Boolean('isRefetching' in statsQuery && statsQuery.isRefetching);

  // 2. Fetch All Inquiries for this Center (For Client-side Trend Calculation - mirroring Admin logic)
  const inquiriesQuery = useQuery(
    ['center-all-inquiries', decodedLocation],
    () => apiService.inquiries.getAll({ location: decodedLocation, limit: 'all' }),
    {
      enabled: !!decodedLocation && hasPermission,
      staleTime: 300000,
      refetchOnWindowFocus: false,
    }
  );
  const { data: allInquiriesData, isLoading: isInquiriesLoading, refetch: refetchInquiries } = inquiriesQuery;
  const isInquiriesRefetching = Boolean('isRefetching' in inquiriesQuery && inquiriesQuery.isRefetching);

  const handleRefresh = () => {
    refetchStats();
    refetchInquiries();
  };

  const calculatedStats = useMemo(() => {
    if (!allInquiriesData?.data?.inquiries) return null;
    const inquiries = allInquiriesData.data.inquiries as Inquiry[];

    // Get current and previous date range boundaries
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

      if (dateRange === 'today') {
        const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
        const yesterdayEnd = todayStart - 1;
        return {
          current: { start: todayStart, end: todayEnd },
          previous: { start: yesterdayStart, end: yesterdayEnd }
        };
      } else if (dateRange === '7d') {
        const currentStart = subDays(today, 7).setHours(0, 0, 0, 0);
        const previousStart = subDays(today, 14).setHours(0, 0, 0, 0);
        const previousEnd = currentStart - 1;
        return {
          current: { start: currentStart, end: todayEnd },
          previous: { start: previousStart, end: previousEnd }
        };
      } else if (dateRange === '30d') {
        const currentStart = subDays(today, 30).setHours(0, 0, 0, 0);
        const previousStart = subDays(today, 60).setHours(0, 0, 0, 0);
        const previousEnd = currentStart - 1;
        return {
          current: { start: currentStart, end: todayEnd },
          previous: { start: previousStart, end: previousEnd }
        };
      } else if (dateRange === 'quarter') {
        const currentStart = subMonths(today, 4).setHours(0, 0, 0, 0);
        const previousStart = subMonths(today, 8).setHours(0, 0, 0, 0);
        const previousEnd = currentStart - 1;
        return {
          current: { start: currentStart, end: todayEnd },
          previous: { start: previousStart, end: previousEnd }
        };
      } else if (dateRange === 'lastWeek') {
        const currentStart = subDays(today, 7).setHours(0, 0, 0, 0);
        const previousStart = subDays(today, 14).setHours(0, 0, 0, 0);
        const previousEnd = currentStart - 1;
        return {
          current: { start: currentStart, end: todayEnd },
          previous: { start: previousStart, end: previousEnd }
        };
      } else if (dateRange === 'lastMonth') {
        const currentStart = subMonths(today, 1).setHours(0, 0, 0, 0);
        const previousStart = subMonths(today, 2).setHours(0, 0, 0, 0);
        const previousEnd = currentStart - 1;
        return {
          current: { start: currentStart, end: todayEnd },
          previous: { start: previousStart, end: previousEnd }
        };
      } else if (dateRange === 'lastYear') {
        const currentStart = subMonths(today, 12).setHours(0, 0, 0, 0);
        const previousStart = subMonths(today, 24).setHours(0, 0, 0, 0);
        const previousEnd = currentStart - 1;
        return {
          current: { start: currentStart, end: todayEnd },
          previous: { start: previousStart, end: previousEnd }
        };
      }
      
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
    const isInState = (inquiry: Inquiry, leadStage: string, subStage: string): boolean => {
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
    const getFirstAttendedAt = (i: Inquiry): number | null => {
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
    const calculateAvgResponseTime = (inquiriesList: Inquiry[]): number => {
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

  const statCards = useMemo(() => {
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

  const overview = statsData?.data as AdminDashboardOverview | undefined;
  
  if (!decodedLocation) {
    return <div className="text-center py-10">Invalid Center Location</div>;
  }

  // Format action for display
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

  if (!hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
        <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-secondary-900 dark:text-white mb-1.5">
          Access Restricted
        </h2>
        <p className="text-sm text-secondary-600 dark:text-secondary-400 max-w-md mb-6">
          You don't have permission to view dashboard analytics for the <span className="font-semibold text-secondary-900 dark:text-white">{decodedLocation}</span> center.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn btn-primary btn-sm flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Page padding background glow */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))]from-[rgba(255,170,110,0.15)] via-transparent to-transparent pointer-events-none -z-10" />

      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-secondary-600 hover:text-secondary-900 dark:text-secondary-400 dark:hover:text-secondary-100 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors"
            title="Go back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <MapPin className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
            {decodedLocation} Overview
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
           
           <DashboardFilters 
             dateRange={dateRange}
             setDateRange={setDateRange}
             customDateFrom={customDateFrom}
             setCustomDateFrom={setCustomDateFrom}
             customDateTo={customDateTo}
             setCustomDateTo={setCustomDateTo}
           />
           <button 
             onClick={handleRefresh}
             className="p-2 text-secondary-500 hover:text-secondary-700 dark:text-secondary-400 dark:hover:text-secondary-200 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors"
             title="Refresh Data"
           >
             <RefreshCw className={cn("h-5 w-5", (isStatsLoading || isInquiriesLoading || isStatsRefetching || isInquiriesRefetching) && "animate-spin")} />
           </button>
        </div>
      </div>

      {/* Loading State */}
      {(isStatsLoading || isInquiriesLoading) && !overview ? (
        <div className="flex items-center justify-center min-h-[50vh]">
          <LoadingSpinner size="lg" label="Loading center dashboard..." />
        </div>
      ) : !overview ? (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            Unable to load dashboard data
          </h3>
        </div>
      ) : (
        <>
           {/* Stat Cards */}
           <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
            {statCards.map((card, index) => {
              const Icon = card.icon;
              return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={cn(
                  "relative rounded-xl shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_28px_rgba(244,122,31,0.35),0px_0px_40px_rgba(244,122,31,0.25)] hover:-translate-y-1 transition-all duration-350 ease-out overflow-hidden min-h-[100px] flex flex-col justify-between group",
                  "before:absolute before:inset-0 before:bg-[linear-gradient(135deg,#F9B27D_0%,#F6A35F_35%,#F2C19A_70%,#F7E1CC_100%)] before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-350 before:ease-out",
                  card.bg,
                )}
              >
                {/* Top accent line / border strip */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-primary-500 to-primary-300" />

                <div className="relative z-10 px-4 pt-4">
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

                <div className={cn("absolute bottom-2 right-2 text-[#FFE8D6] dark:text-gray-800 pointer-events-none transition-transform duration-300 group-hover:scale-110")}>
                  <Icon className="h-10 w-10 text-current" />
                </div>
              </motion.div>
              );
            })}
           </div>

           {/* Sales Funnel */}
           <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="bg-white dark:bg-secondary-900 rounded-xl px-3 py-1 border border-secondary-200 dark:border-secondary-800 shadow-sm"
           >
             <h3 className="text-lg font-bold text-secondary-900 dark:text-white mb-2">
               End-to-End Sales Funnel {decodedLocation}
             </h3>
              <div className="overflow-x-auto pb-2 scrollbar-hide">
                <div className="flex items-center justify-center min-w-max lg:min-w-0">
                  {/* Reuse Funnel Items Logic - Updated Colors with dark mode support */}
                  {[
                    { label: 'Enquiries', current: calculatedStats?.totalCount ?? 0, previous: calculatedStats?.prevTotalCount ?? 0, bgClass: 'bg-primary-100 dark:bg-primary-900/70', textClass: 'text-text-primary dark:text-white', trendClassName: 'dark:!text-white' },
                    { label: 'Presales', current: calculatedStats?.presalesCount ?? 0, previous: calculatedStats?.prevPresalesCount ?? 0, bgClass: 'bg-primary-200 dark:bg-primary-800/80', textClass: 'text-text-primary dark:text-white', trendClassName: 'dark:!text-white' },
                    { label: 'Sales', current: calculatedStats?.salesCount ?? 0, previous: calculatedStats?.prevSalesCount ?? 0, bgClass: 'bg-primary-300 dark:bg-primary-700/80', textClass: 'text-white', trendVariant: 'onDarkBg' as const },
                    { label: 'Converted', current: calculatedStats?.convertedCount ?? 0, previous: calculatedStats?.prevConvertedCount ?? 0, bgClass: 'bg-primary-500 dark:bg-primary-800/85', textClass: 'text-white', trendVariant: 'onDarkBg' as const },
                    { label: 'Admission', current: calculatedStats?.admittedCount ?? 0, previous: calculatedStats?.prevAdmittedCount ?? 0, bgClass: 'bg-primary-600 dark:bg-primary-600/85', textClass: 'text-white', trendVariant: 'onDarkBg' as const }
                  ].map((item, i) => (
                    <div key={item.label} 
                      className={cn(
                        "relative shrink-0 w-[160px] sm:w-[180px] lg:flex-1 h-[125px] flex flex-col justify-center items-center clip-path-arrow-both hover:brightness-105 hover:shadow-[0px_6px_20px_rgba(244,122,31,0.35)] dark:hover:brightness-110 transition-all duration-300 group",
                        item.bgClass,
                        i === 0 ? "rounded-xl" : "rounded-lg"
                      )}
                    >
                       <div className={cn("text-sm font-semibold mb-1", item.textClass)}>{item.label}</div>
                       <div className={cn("text-4xl font-bold mb-1", item.textClass)}>
                         {item.current?.toLocaleString() ?? '0'}
                       </div>
                       <div className="text-xs font-bold flex items-center gap-1 group-hover:scale-105 transition-transform">
                         <TrendWithTooltip
                           current={item.current}
                           previous={item.previous}
                           valueFormatter={(n) => n.toLocaleString()}
                           isPositiveGood={true}
                           label={item.label}
                           variant={item.trendVariant}
                           className={item.trendClassName}
                         />
                       </div>
                    </div>
                  ))}
                </div>
              </div>
           </motion.div>

           {/* Analytics Charts */}
           <div className="mb-6">
              <AdvancedAnalytics 
                data={overview.advancedAnalytics || { performance: [], source: [], location: [], course: [] }} 
                dateRangeLabel={dateRange === 'custom' ? `${customDateFrom} - ${customDateTo}` : dateRange.replace(/([A-Z])/g, ' $1').trim()} 
              />
           </div>

           {/* Bottom Tables */}
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             {/* Top Sales */}
             <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.75 }}
                className="bg-white dark:bg-secondary-900 rounded-xl p-5 border border-secondary-200 dark:border-secondary-800"
             >
                <div className="flex items-center gap-2 mb-4">
                  <Award className="h-5 w-5 text-amber-500" />
                  <h3 className="text-base font-semibold text-secondary-900 dark:text-white">Top Sales ({decodedLocation})</h3>
                </div>
                <div className="space-y-3">
                   {overview.topPerformers.sales.length > 0 ? (
                      overview.topPerformers.sales.map((user, index) => (
                        <div key={user.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#FFF1E6] dark:hover:bg-secondary-800 transition-colors border-l-2 border-transparent hover:border-primary-500">
                           <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm bg-linear-to-r from-primary-500 to-primary-300")}>
                             {index + 1}
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-text-primary dark:text-white truncate">{user.name}</div>
                              <div className="text-xs text-[#8A8A8A] dark:text-secondary-400">{user.admitted} admissions</div>
                           </div>
                           <div className="text-right">
                             <div className="text-sm font-bold text-primary-500 dark:text-emerald-400">{user.conversionRate}%</div>
                             <div className="text-xs text-[#8A8A8A] dark:text-secondary-400">rate</div>
                           </div>
                        </div>
                      ))
                   ) : <div className="text-sm text-center text-secondary-500">No data</div>}
                </div>
             </motion.div>

             {/* Top Presales */}
             <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.8 }}
                className="bg-white dark:bg-secondary-900 rounded-xl p-5 border border-secondary-200 dark:border-secondary-800"
             >
                <div className="flex items-center gap-2 mb-4">
                   <Zap className="h-5 w-5 text-[#FC4F01]" />
                   <h3 className="text-base font-semibold text-secondary-900 dark:text-white">Top Presales ({decodedLocation})</h3>
                </div>
                <div className="space-y-3">
                   {overview.topPerformers.presales.length > 0 ? (
                      overview.topPerformers.presales.map((user, index) => (
                        <div key={user.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#FFF1E6] dark:hover:bg-secondary-800 transition-colors border-l-2 border-transparent hover:border-primary-500">
                           <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm bg-linear-to-r from-primary-500 to-primary-300")}>
                             {index + 1}
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-text-primary dark:text-white truncate">{user.name}</div>
                              <div className="text-xs text-[#8A8A8A] dark:text-secondary-400">{user.totalForwarded} forwarded</div>
                           </div>
                           <div className="text-right">
                             <div className="text-sm font-bold text-primary-500 dark:text-indigo-400">{user.totalForwarded}</div>
                             <div className="text-xs text-[#8A8A8A] dark:text-secondary-400">fwds</div>
                           </div>
                        </div>
                      ))
                   ) : <div className="text-sm text-center text-secondary-500">No data</div>}
                </div>
             </motion.div>

             {/* Recent Activity */}
             <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ duration: 0.3, delay: 0.85 }}
               className="bg-white dark:bg-secondary-900 rounded-xl p-5 border border-secondary-200 dark:border-secondary-800"
             >
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="h-5 w-5 text-rose-500" />
                  <h3 className="text-base font-semibold text-secondary-900 dark:text-white">Recent Activity</h3>
                </div>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {overview.recentActivities.length > 0 ? (
                       overview.recentActivities.map(activity => {
                         const actionInfo = formatAction(activity.action);
                         return (
                           <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-[#FFF5EE] dark:hover:bg-secondary-800 transition-colors">
                              <div className={cn("p-1.5 rounded-lg bg-primary-100 text-primary-500")}>
                                {actionInfo.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-[#2A2A2A] dark:text-white">
                                   <span className="font-medium">{activity.actorName}</span>
                                   {' '}<span className="text-[#9A9A9A] dark:text-secondary-400">{actionInfo.label.toLowerCase()}</span>{' '}
                                   <span className="font-medium">{activity.inquiryName}</span>
                                </div>
                                <div className="text-xs text-[#9A9A9A] dark:text-secondary-400 mt-0.5">{timeAgo(activity.createdAt)}</div>
                              </div>
                           </div>
                         );
                       })
                    ) : <div className="text-sm text-center text-secondary-500">No recent activity</div>}
                </div>
             </motion.div>
           </div>
        </>
      )}
    </div>
  );
};

export default CenterDashboard;
