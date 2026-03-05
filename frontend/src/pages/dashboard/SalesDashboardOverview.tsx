
import React from 'react';
import { useQuery } from 'react-query';
import {
  UserCheck,
  Zap,
  GraduationCap,
  ArrowUpRight,
  Activity,
  AlertCircle,
  Clock,

} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { subDays, subMonths } from 'date-fns';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import TrendWithTooltip from '@/components/TrendWithTooltip';
import { calculateTrend, formatDuration } from '@/utils/dashboardTrend';
import { useAuth } from '@/contexts/AuthContext';
import { DateRangeOption } from '@/components/DashboardFilters';

interface OverviewProps {
  dateRange: DateRangeOption;
  customDateFrom: string;
  customDateTo: string;
}


export const SalesDashboardOverview: React.FC<OverviewProps> = ({ dateRange, customDateFrom, customDateTo }) => {
  const { user } = useAuth();
  
  // 1. Fetch ALL inquiries for this user
  const { data: userInquiriesData, isLoading } = useQuery(
    ['sales-user-inquiries-full', user?.id],
    () => apiService.inquiries.getAll({ assignedTo: user?.id, limit: 'all' }),
    {
      enabled: !!user?.id,
      staleTime: 300000,
      refetchOnWindowFocus: false,
    }
  );

  // 2. Fetch Advanced Analytics
  const { data: analyticsData, isLoading: isLoadingAnalytics } = useQuery(
    ['sales-dashboard-stats', user?.id, dateRange, customDateFrom, customDateTo],
    () => apiService.inquiries.getSalesDashboardStats({ 
      dateRange, 
      dateFrom: customDateFrom, 
      dateTo: customDateTo 
    }),
    { enabled: !!user?.id, staleTime: 90 * 1000, refetchOnWindowFocus: true }
  );

  // 3. Fetch My Follow-ups to sync Task Health count with the My Follow-Ups page
  const { data: followUpsData } = useQuery(
    ['sales-my-follow-ups'],
    () => apiService.inquiries.getMyFollowUps(),
    { 
       enabled: !!user?.id, 
       staleTime: 90 * 1000, // 90s – socket invalidates on inquiry updates
       refetchOnWindowFocus: true 
    }
  );

  const advancedAnalytics = analyticsData?.data?.advancedAnalytics;

  // Calculate high-accuracy Task Health stats that perfectly match the My Follow-Ups page
  const taskHealthStats = React.useMemo(() => {
    if (!followUpsData?.data?.followUps) return null;
    const allFollowUps = followUpsData.data.followUps as any[];
    
    const now = new Date();

    let overdueCount = 0;
    let upcomingCount = 0;

    allFollowUps.forEach(fu => {
      // Logic matching SalesMyFollowUps.tsx filtering
      if (fu.completionStatus === 'complete' || fu.status === 'completed' || fu.status === 'cancelled') return;
      if (!fu.nextFollowUpDate) return;

      const due = new Date(fu.nextFollowUpDate);
      
      // If it's in the past relative to now, it's overdue (matches SalesMyFollowUps overdue filter)
      if (due < now) {
        overdueCount++;
      } else {
        // Any task not overdue is considered "Upcoming" (this includes things due later today)
        upcomingCount++;
      }
    });

    return [
      { label: "Overdue Follow-ups", count: overdueCount },
      { label: "Upcoming Follow-ups", count: upcomingCount }
    ];
  }, [followUpsData]);

  const calculatedStats = React.useMemo(() => {
    if (!userInquiriesData?.data?.inquiries) return null;
    const inquiries = userInquiriesData.data.inquiries as import('@/types').Inquiry[];

    // Define Date Boundaries
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
      
      return null;
    };

    const boundaries = getDateBoundaries();

    // Helper: Filter inquiries by creation date
    const filterByCreationDate = (range: { start: number; end: number } | null) => {
      if (!range) return inquiries;
      return inquiries.filter(i => {
        const createdTime = new Date(i.createdAt).getTime();
        return createdTime >= range.start && createdTime <= range.end;
      });
    };

    // STATE-BASED: Check if inquiry is currently in a specific state
    const isInState = (inquiry: typeof inquiries[0], leadStage: string, subStage: string): boolean => {
      if (!inquiry.followUps || inquiry.followUps.length === 0) return false;
      
      // Get the LATEST follow-up (by createdAt)
      const latestFollowUp = [...inquiry.followUps]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      return latestFollowUp.leadStage === leadStage && latestFollowUp.subStage === subStage;
    };

    // Filter inquiries by creation date range, then check current state
    const countInquiriesInState = (
      range: { start: number; end: number } | null,
      leadStage: string,
      subStage: string
    ): number => {
      const filtered = filterByCreationDate(range);
      return filtered.filter(i => isInState(i, leadStage, subStage)).length;
    };

    // --- METRICS ---

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

    // 1. My Attended Inquiries (Revised: Any Activity in Range - based on follow-ups only)
    const countMyAttendedInquiries = (range: { start: number; end: number } | null) => {
        // If no range (All Time), count inquiries that have any follow-ups (attended = user engaged)
        if (!range) {
            return inquiries.filter(i => i.followUps && i.followUps.length > 0).length;
        }

        // Count unique inquiries that have any "work" activity in this range
        return inquiries.filter(i => {
            // A. First attended (first follow-up) in this range?
            const firstAttended = getFirstAttendedAt(i);
            if (firstAttended) {
                const attendedTime = new Date(firstAttended).getTime();
                if (attendedTime >= range.start && attendedTime <= range.end) return true;
            }

            // B. Any Follow-up Activity in this range? (Creation or Update)
            if (i.followUps && i.followUps.length > 0) {
                 const hasActivity = i.followUps.some(f => {
                     const created = new Date(f.createdAt).getTime();
                     // Check update time if it exists, otherwise fallback to created
                     // Note: Backend follow-up schema has timestamps: true, so updatedAt exists
                     const updated = (f as any).updatedAt ? new Date((f as any).updatedAt).getTime() : created;
                     
                     return (created >= range.start && created <= range.end) || 
                            (updated >= range.start && updated <= range.end);
                 });
                 if (hasActivity) return true;
            }

            return false;
        }).length;
    };

    const myAttendedCount = countMyAttendedInquiries(boundaries?.current || null);
    const prevMyAttendedCount = countMyAttendedInquiries(boundaries?.previous || null);
    const attendedTrend = calculateTrend(myAttendedCount, prevMyAttendedCount);

    // 2. My Conversions (State based)
    const myConversionsCount = countInquiriesInState(boundaries?.current || null, 'Hot', 'Conversion');
    const prevMyConversionsCount = countInquiriesInState(boundaries?.previous || null, 'Hot', 'Conversion');
    const conversionTrend = calculateTrend(myConversionsCount, prevMyConversionsCount);

    // 3. My Admissions (State based)
    const myAdmissionsCount = countInquiriesInState(boundaries?.current || null, 'Hot', 'Confirmed Admission');
    const prevMyAdmissionsCount = countInquiriesInState(boundaries?.previous || null, 'Hot', 'Confirmed Admission');
    const admissionsTrend = calculateTrend(myAdmissionsCount, prevMyAdmissionsCount);

    // 4. Conversion Rate (Formula: Conversions / Attended * 100)
    const conversionRate = myAttendedCount > 0 ? ((myConversionsCount / myAttendedCount) * 100) : 0;
    const prevConversionRate = prevMyAttendedCount > 0 ? ((prevMyConversionsCount / prevMyAttendedCount) * 100) : 0;
    const rateTrend = calculateTrend(conversionRate, prevConversionRate);

    // 5. Avg Response Time (Cohort based - consistent with Admin)
    const currentCohortInquiries = filterByCreationDate(boundaries?.current || null);
    const previousCohortInquiries = filterByCreationDate(boundaries?.previous || null);

    // Avg Response Time: forwardedAt -> attendedAt only. Skip if no forwardedAt or not attended.
    const calculateAvgResponseTime = (list: typeof inquiries): number => {
      let totalMs = 0;
      let count = 0;
      for (let idx = 0; idx < list.length; idx++) {
        const i = list[idx];
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

    const avgResponseTime = calculateAvgResponseTime(currentCohortInquiries);
    const prevAvgResponseTime = calculateAvgResponseTime(previousCohortInquiries);
    const responseTrendValue = calculateTrend(avgResponseTime, prevAvgResponseTime);

    return {
      myAttendedCount, prevMyAttendedCount, attendedTrend,
      myConversionsCount, prevMyConversionsCount, conversionTrend,
      myAdmissionsCount, prevMyAdmissionsCount, admissionsTrend,
      conversionRate, prevConversionRate, rateTrend,
      avgResponseTime, prevAvgResponseTime, responseTrendValue
    };

  }, [userInquiriesData, dateRange, customDateFrom, customDateTo]);

  if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-64 sm:min-h-80">
          <LoadingSpinner size="lg" label="Loading..." />
        </div>
      );
  }

  if (!calculatedStats) {
      return (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            Unable to load dashboard data
          </h3>
        </div>
      );
  }

  const statCards = [
    {
        label: 'Assigned Inquiries',
        value: calculatedStats.myAttendedCount.toLocaleString(),
        icon: UserCheck,
        color: 'text-[#FFE8D6]',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.myAttendedCount,
        previous: calculatedStats.prevMyAttendedCount,
        valueFormatter: (n: number) => n.toLocaleString(),
        isPositiveGood: true
    },
    {
        label: 'Conversions',
        value: calculatedStats.myConversionsCount.toLocaleString(),
        icon: Zap,
        color: 'text-[#FFE8D6]',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.myConversionsCount,
        previous: calculatedStats.prevMyConversionsCount,
        valueFormatter: (n: number) => n.toLocaleString(),
        isPositiveGood: true
    },
    {
        label: 'Admissions',
        value: calculatedStats.myAdmissionsCount.toLocaleString(),
        icon: GraduationCap,
        color: 'text-[#FFE8D6]',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.myAdmissionsCount,
        previous: calculatedStats.prevMyAdmissionsCount,
        valueFormatter: (n: number) => n.toLocaleString(),
        isPositiveGood: true
    },
    {
        label: 'Conversion Rate',
        value: `${calculatedStats.conversionRate.toFixed(1)}%`,
        icon: ArrowUpRight,
        color: 'text-[#FFE8D6]',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.conversionRate,
        previous: calculatedStats.prevConversionRate,
        valueFormatter: (n: number) => `${n.toFixed(1)}%`,
        isPositiveGood: true
    },
    {
        label: 'Avg Response Time',
        value: formatDuration(calculatedStats.avgResponseTime),
        icon: Activity,
        color: 'text-[#FFE8D6]',
        bg: 'bg-white dark:bg-gray-800',
        border: 'shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_30px_rgba(244,122,31,0.18)] transition-shadow duration-300 border-none',
        current: calculatedStats.avgResponseTime,
        previous: calculatedStats.prevAvgResponseTime,
        valueFormatter: formatDuration,
        isPositiveGood: false
    },
  ];

  return (
    <div className="space-y-6 relative">
       {/* Page padding background glow */}
       <div className="absolute top-0 left-0 right-0 h-[500px] bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-[rgba(255,170,110,0.15)] via-transparent to-transparent pointer-events-none -z-10" />
       
       {/* Top Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map((card, index) => {
               // ... existing card render ...
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
                      card.bg
                    )}
                  >
                    {/* Top accent line */}
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
        
        {/* Advanced Analytics Charts */}
        {isLoadingAnalytics ? (
            <div className="h-64 flex items-center justify-center">
                <LoadingSpinner size="lg" />
            </div>
        ) : advancedAnalytics && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* 1. Performance Over Time (Dual Axis) */}
            <div className="bg-white dark:bg-secondary-800 p-4 rounded-xl shadow-sm border border-secondary-200 dark:border-secondary-700">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Performance Over Time</h3>
                <div className="h-[250px] -ml-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={advancedAnalytics.performance} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorInq" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#1DB954" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#1DB954" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" opacity={0.5} />
                            <XAxis 
                                dataKey="date" 
                                tick={{fontSize: 10, fill: '#6B7280'}} 
                                tickLine={false} 
                                axisLine={false} 
                                interval="preserveStartEnd"
                                minTickGap={5}
                            />
                            {/* Left Axis: Inquiries */}
                            <YAxis 
                                yAxisId="left"
                                tick={{fontSize: 10, fill: '#6B7280'}} 
                                tickLine={false} 
                                axisLine={false}
                                width={30}
                            />
                            {/* Right Axis: Conversions/Admissions */}
                            <YAxis 
                                yAxisId="right"
                                orientation="right"
                                tick={{fontSize: 10, fill: '#6B7280'}} 
                                tickLine={false} 
                                axisLine={false}
                                width={30}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                labelStyle={{ color: '#111827', fontWeight: 'bold', marginBottom: '4px' }}
                                itemStyle={{ padding: '2px 0' }}
                            />
                            <Legend 
                                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                                iconType="circle" 
                                iconSize={8}
                            />
                            <Area 
                                yAxisId="left"
                                type="monotone" 
                                dataKey="inquiries" 
                                stroke="#4F46E5" 
                                fillOpacity={1} 
                                fill="url(#colorInq)" 
                                strokeWidth={2} 
                                name="Inquiries" 
                                activeDot={{ r: 4, strokeWidth: 0 }}
                            />
                            <Area 
                                yAxisId="right"
                                type="monotone" 
                                dataKey="conversions" 
                                stroke="#1DB954" 
                                fillOpacity={1} 
                                fill="url(#colorConv)" 
                                strokeWidth={2} 
                                name="Conversions" 
                            />
                            <Area 
                                yAxisId="right"
                                type="monotone" 
                                dataKey="admissions" 
                                stroke="#FFB074" 
                                strokeDasharray="4 4" 
                                fill="none" 
                                strokeWidth={2} 
                                name="Admissions" 
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. Lead Source Performance (Enhanced Donut) */}
            <div className="bg-white dark:bg-secondary-800 p-4 rounded-xl shadow-sm border border-secondary-200 dark:border-secondary-700">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Lead Source</h3>
                <div className="h-[250px] flex items-center justify-center relative">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={advancedAnalytics.source}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={75}
                                paddingAngle={4}
                                dataKey="value"
                                stroke="none"
                            >
                                {advancedAnalytics.source?.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: number, name: string) => {
                                    const total = advancedAnalytics.source.reduce((a: number, c: any) => a + c.value, 0);
                                    const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                    return [`${value} (${percent}%)`, name];
                                }}
                            />
                            <Legend 
                                layout="horizontal" 
                                verticalAlign="bottom" 
                                align="center"
                                iconSize={8}
                                iconType="circle"
                                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    {/* Center Text (Total) */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                         <span className="text-3xl font-bold text-gray-800 dark:text-white">
                             {advancedAnalytics.source?.reduce((acc: number, curr: any) => acc + curr.value, 0) || 0}
                         </span>
                         <span className="text-xs text-gray-500 font-medium">Total Leads</span>
                    </div>
                </div>
            </div>

            {/* 3. Task Health - Modern Redesign */}
            <div className="bg-white dark:bg-secondary-800 p-5 rounded-xl shadow-sm border border-secondary-200 dark:border-secondary-700 flex flex-col h-full">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Follow-ups</h3>
                    <div className="p-1.5 rounded-full bg-gray-50 dark:bg-gray-700/50">
                        <Activity className="w-4 h-4 text-gray-400" />
                    </div>
                </div>
                
                <div className="flex-1 flex flex-col gap-4">
                     {/* Overdue Card */}
                    <div className="relative group overflow-hidden rounded-xl border border-red-100 dark:border-red-900/30 bg-linear-to-br from-red-50/50 to-transparent dark:from-red-900/10 dark:to-transparent p-4 transition-all hover:shadow-md hover:border-red-200 dark:hover:border-red-900/50">
                        <div className="flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl text-red-600 dark:text-red-400 group-hover:scale-110 transition-transform duration-300">
                                    <AlertCircle className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-red-600/70 dark:text-red-400/70 uppercase tracking-widest mb-0.5">Urgent</p>
                                    <h4 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Overdue</h4>
                                </div>
                            </div>
                            <div className="text-4xl font-extrabold text-red-600 dark:text-red-500 tracking-tight">
                                {taskHealthStats?.find((t:any) => t.label.includes('Overdue'))?.count || 0}
                            </div>
                        </div>
                        {/* Decorative visual bg element */}
                        <div className="absolute -right-6 -bottom-6 text-red-500/5 dark:text-red-500/10 transform rotate-12 group-hover:rotate-0 transition-transform duration-500 pointer-events-none">
                             <AlertCircle className="w-32 h-32" />
                        </div>
                    </div>

                    {/* Upcoming Card */}
                    <div className="relative group overflow-hidden rounded-xl border border-blue-100 dark:border-blue-900/30 bg-linear-to-br from-blue-50/50 to-transparent dark:from-blue-900/10 dark:to-transparent p-4 transition-all hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900/50">
                        <div className="flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform duration-300">
                                    <Clock className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-blue-600/70 dark:text-blue-400/70 uppercase tracking-widest mb-0.5">Scheduled</p>
                                    <h4 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Upcoming</h4>
                                </div>
                            </div>
                            <div className="text-4xl font-extrabold text-blue-600 dark:text-blue-500 tracking-tight">
                                {taskHealthStats?.find((t:any) => t.label.includes('Upcoming'))?.count || 0}
                            </div>
                        </div>
                         {/* Decorative visual bg element */}
                        <div className="absolute -right-6 -bottom-6 text-blue-500/5 dark:text-blue-500/10 transform rotate-12 group-hover:rotate-0 transition-transform duration-500 pointer-events-none">
                             <Clock className="w-32 h-32" />
                        </div>
                    </div>
                </div>
            </div>

          </div>
        )}
    </div>
  );
};
