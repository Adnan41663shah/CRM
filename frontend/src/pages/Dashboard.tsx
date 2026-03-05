import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import { 
  RefreshCw
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import apiService from '@/services/api';
import { DashboardStats } from '@/types';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import { XCircle } from 'lucide-react';

// Import dashboard tab components
import { AdminOverviewTab, NonAdminOverviewTab } from '@/pages/dashboard/OverviewTab';
import DataTab from '@/pages/dashboard/DataTab';
import DashboardFilters, { DateRangeOption } from '@/components/DashboardFilters';

type TabType = 'overview' | 'data';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize active tab from URL query param, then localStorage, or default to 'overview'
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const queryTab = searchParams.get('tab');
    if (queryTab === 'overview' || queryTab === 'data') {
      return queryTab as TabType;
    }
    const savedTab = localStorage.getItem('dashboard-active-tab');
    return (savedTab as TabType) || 'overview';
  });

  // Sync state with URL search params
  useEffect(() => {
    const queryTab = searchParams.get('tab');
    if (queryTab && (queryTab === 'overview' || queryTab === 'data')) {
      if (activeTab !== queryTab) {
        setActiveTab(queryTab as TabType);
      }
    } else {
      // If no tab in URL, ensure URL matches current activeTab (initial load or clean URL)
      // BUT only if we are not already on the correct tab URL (avoid circular updates)
      if (queryTab !== activeTab) {
        setSearchParams({ tab: activeTab }, { replace: true });
      }
    }
  }, [searchParams, activeTab, setSearchParams]);

  // Filter State - Default to 30 days
  const [dateRange, setDateRange] = useState<DateRangeOption>('30d');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');

  // Determine if we need to fetch the basic stats
  // We only need this for users who are NOT admin, sales, or presales
  // as those roles have their own dedicated dashboard components that fetch their own data
  const shouldFetchBasicStats = useMemo(() => {
    if (!user?.role) return false;
    return !['admin', 'sales', 'presales'].includes(user.role);
  }, [user?.role]);

  const { data, isLoading, error } = useQuery(
    'dashboard-stats',
    () => apiService.inquiries.getDashboardStats(),
    {
      staleTime: 600000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchInterval: 600000, // 10 minutes
      enabled: shouldFetchBasicStats // Only fetch if necessary
    }
  );

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate all dashboard-related queries to trigger a refetch
      await Promise.all([
        queryClient.invalidateQueries('dashboard-stats'),
        queryClient.invalidateQueries(['admin-dashboard-overview']),
        queryClient.invalidateQueries(['sales-dashboard-stats']),
        queryClient.invalidateQueries(['presales-dashboard-stats'])
      ]);
    } catch (err) {
      console.error('Error refreshing dashboard:', err);
    } finally {
      // Add a small delay to show the animation (optional, but nice for UX)
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    if (data?.success && data.data) {
      setStats(data.data);
    }
  }, [data]);

  // Persist active tab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('dashboard-active-tab', activeTab);
  }, [activeTab]);



  // Reset to overview if non-admin user has admin-only tab saved in localStorage
  useEffect(() => {
    if (user?.role !== 'admin' && activeTab !== 'overview') {
      setActiveTab('overview');
    }
  }, [user?.role, activeTab]);

  if (isLoading && shouldFetchBasicStats) {
    return (
      <div className="flex items-center justify-center min-h-[16rem] sm:min-h-[20rem]">
        <LoadingSpinner size="lg" label="Loading dashboard..." />
      </div>
    );
  }

  if (error && shouldFetchBasicStats) {
    return (
      <div className="text-center py-12">
        <XCircle className="mx-auto h-12 w-12 text-red-500" />
        <h3 className="mt-2 text-sm font-medium text-secondary-900 dark:text-white">
          Error loading dashboard
        </h3>
        <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
          Please try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 relative">
      {/* Page padding background glow */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[rgba(255,170,110,0.15)] via-transparent to-transparent pointer-events-none -z-10" />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-secondary-900 dark:text-white">
            Hi, {user?.name ?? 'User'}
          </h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {/* Filters - Moved here */}
          {activeTab === 'overview' && (
             <DashboardFilters
                dateRange={dateRange}
                setDateRange={setDateRange}
                customDateFrom={customDateFrom}
                setCustomDateFrom={setCustomDateFrom}
                customDateTo={customDateTo}
                setCustomDateTo={setCustomDateTo}
             />
          )}

          {/* Manual Refresh Button - Visible for Admin, Presales, Sales */}
          {activeTab === 'overview' && (
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-colors border shadow-sm",
                "bg-white dark:bg-secondary-800 text-secondary-700 dark:text-secondary-200 border-secondary-200 dark:border-secondary-700",
                "hover:bg-secondary-50 dark:hover:bg-secondary-700",
                "disabled:opacity-70 disabled:cursor-not-allowed",
                "h-[32px] sm:h-[36px]" // Explicit height to match filters
              )}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", isRefreshing && "animate-spin")} />
              
            </button>
          )}
        </div>
      </div>


      {/* Tab Content */}
      {activeTab === 'overview' && (
        <>
          {/* Admin gets the enhanced overview, others get the simple stats */}
          {user?.role === 'admin' ? (
            <AdminOverviewTab 
              dateRange={dateRange}
              customDateFrom={customDateFrom}
              customDateTo={customDateTo}
            />
          ) : (
            <NonAdminOverviewTab 
              stats={stats} 
              userRole={user?.role || ''}
              dateRange={dateRange}
              customDateFrom={customDateFrom}
              customDateTo={customDateTo} 
            />
          )}
        </>
      )}

      {activeTab === 'data' && user?.role === 'admin' && <DataTab />}
    </div>
  );
};

export default Dashboard;
