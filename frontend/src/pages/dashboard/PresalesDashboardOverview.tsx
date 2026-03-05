
import React from 'react';
import { useQuery } from 'react-query';
import {
  Users,
  AlertCircle,
  ArrowUpRight,
  Clock,
} from 'lucide-react';
import { subDays, subMonths, format } from 'date-fns';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { DateRangeOption } from '@/components/DashboardFilters';

import { cn } from '@/utils/cn';

interface OverviewProps {
  dateRange: DateRangeOption;
  customDateFrom: string;
  customDateTo: string;
}

export const PresalesDashboardOverview: React.FC<OverviewProps> = ({ dateRange, customDateFrom, customDateTo }) => {

  const getApiParams = () => {
    if (dateRange === 'custom' && customDateFrom && customDateTo) {
      return { dateFrom: customDateFrom, dateTo: customDateTo };
    }

    const today = new Date();
    const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');

    if (dateRange === '7d') {
      const from = subDays(today, 7);
      return { dateFrom: formatDate(from), dateTo: formatDate(today) };
    }
    
    if (dateRange === '30d') {
      const from = subDays(today, 30);
      return { dateFrom: formatDate(from), dateTo: formatDate(today) };
    }
    
    if (dateRange === 'quarter') {
      const from = subMonths(today, 4);
      return { dateFrom: formatDate(from), dateTo: formatDate(today) };
    }

    return { dateRange };
  };
  
  const { data: presalesData, isLoading } = useQuery(
    ['presales-dashboard-stats', dateRange, customDateFrom, customDateTo],
    () => apiService.inquiries.getPresalesDashboardStats(getApiParams()),
    {
      staleTime: 600000, 
      refetchOnWindowFocus: false,
      refetchInterval: 600000, 
    }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64 sm:min-h-80">
        <LoadingSpinner size="lg" label="Loading..." />
      </div>
    );
  }

  const data = presalesData?.data;
  if (!data) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
          Unable to load dashboard data
        </h3>
      </div>
    );
  }

  const { mine } = data;







  const statCards = [
    {
      label: 'Raised Inquiries',
      value: mine.raisedInquiries.total.toLocaleString(),
      icon: Users,
      color: 'text-[#FFE8D6]',
      bg: 'bg-white dark:bg-gray-800', 
    },
    {
      label: 'Forwarded',
      value: mine.forwardedToSales.toLocaleString(),
      icon: ArrowUpRight,
      color: 'text-[#FFE8D6]',
      bg: 'bg-white dark:bg-gray-800',
    },
    {
      label: 'Overdue Follow-ups',
      value: (mine.overdueFollowUps || 0).toLocaleString(),
      icon: Clock, 
      color: 'text-[#FFE8D6]',
      bg: 'bg-white dark:bg-gray-800',
    },
    {
      label: 'Pending Follow-ups',
      value: (mine.pendingFollowUps || 0).toLocaleString(),
      icon: AlertCircle,
      color: 'text-[#FFE8D6]',
      bg: 'bg-white dark:bg-gray-800',
    },
    {
      label: 'Completed Follow-ups',
      value: (mine.completedFollowUps || 0).toLocaleString(),
      icon: Users,
      color: 'text-[#FFE8D6]',
      bg: 'bg-white dark:bg-gray-800',
    }
  ];

  return (
    <div className="space-y-6 relative">
      {/* Page padding background glow */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-[rgba(255,170,110,0.15)] via-transparent to-transparent pointer-events-none -z-10" />

      <div>
        <h2 className="text-xl font-bold text-secondary-900 dark:text-white mb-4">Your Work History</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={cn(
                  "relative rounded-xl shadow-[0px_8px_24px_rgba(244,122,31,0.12)] hover:shadow-[0px_12px_28px_rgba(244,122,31,0.35),0px_0px_40px_rgba(244,122,31,0.25)] hover:-translate-y-1 transition-all duration-350 ease-out overflow-hidden min-h-[120px] flex flex-col justify-between group",
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
                
                {/* Icon - Bottom Right */}
                <div className={cn("absolute bottom-2 right-2 text-[#FFE8D6] dark:text-gray-800 pointer-events-none transition-transform duration-300 group-hover:scale-110")}>
                  <Icon className="h-10 w-10 text-current" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
