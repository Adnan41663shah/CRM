import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Filter, ChevronDown, XCircle, Calendar, Download, Search } from 'lucide-react';
import { cn } from '@/utils/cn';
import PresalesReport from './reports/PresalesReport';
import SalesReport from './reports/SalesReport';
import { downloadCSV } from '@/utils/exportCSV';
import apiService from '@/services/api';

const REPORTS_TAB_KEY = 'reports-active-tab';
const REPORTS_FILTER_KEY = 'reports-filter-state';

type DateRangeOption = 'today' | 'allTime' | 'custom' | 'lastWeek' | 'lastMonth' | 'lastYear';

const Reports: React.FC = () => {
  const location = useLocation();
  
  // Restore active tab from sessionStorage
  const [activeTab, setActiveTab] = useState<'presales' | 'sales'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(REPORTS_TAB_KEY);
      if (saved === 'presales' || saved === 'sales') {
        return saved;
      }
      // Check if there's a modal state that indicates which tab should be active
      const presalesModal = sessionStorage.getItem('presales-report-modal-state');
      const salesModal = sessionStorage.getItem('sales-report-modal-state');
      if (salesModal) {
        try {
          const parsed = JSON.parse(salesModal);
          if (parsed.isOpen) return 'sales';
        } catch {}
      }
      if (presalesModal) {
        try {
          const parsed = JSON.parse(presalesModal);
          if (parsed.isOpen) return 'presales';
        } catch {}
      }
    }
    return 'presales';
  });

  // Restore active tab when coming back from navigation
  useEffect(() => {
    const restoreTab = () => {
      if (typeof window !== 'undefined' && location.pathname.includes('/reports')) {
        // Check which modal is open - prioritize sales modal
        const salesModal = sessionStorage.getItem('sales-report-modal-state');
        const presalesModal = sessionStorage.getItem('presales-report-modal-state');
        
        if (salesModal) {
          try {
            const parsed = JSON.parse(salesModal);
            if (parsed.isOpen) {
              setActiveTab('sales');
              sessionStorage.setItem(REPORTS_TAB_KEY, 'sales');
              return;
            }
          } catch {}
        }
        
        if (presalesModal) {
          try {
            const parsed = JSON.parse(presalesModal);
            if (parsed.isOpen) {
              setActiveTab('presales');
              sessionStorage.setItem(REPORTS_TAB_KEY, 'presales');
              return;
            }
          } catch {}
        }
        
        // If no modal is open, restore from saved tab preference
        const savedTab = sessionStorage.getItem(REPORTS_TAB_KEY);
        if (savedTab === 'presales' || savedTab === 'sales') {
          setActiveTab(savedTab);
        }
      }
    };

    // Restore immediately on mount and when pathname changes
    restoreTab();
    
    // Also restore when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        restoreTab();
      }
    };

    // Handle browser back/forward navigation
    const handlePopState = () => {
      setTimeout(restoreTab, 50);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', restoreTab);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', restoreTab);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [location.pathname]);

  const handleTabChange = (tab: 'presales' | 'sales') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(REPORTS_TAB_KEY, tab);
    }
  };

  // Date filter state
  const [dateRange, setDateRange] = useState<DateRangeOption>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(REPORTS_FILTER_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.dateRange || 'allTime';
        } catch {
          return 'allTime';
        }
      }
    }
    return 'allTime';
  });
  
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(REPORTS_FILTER_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.customDateFrom || '';
        } catch {
          return '';
        }
      }
    }
    return '';
  });
  
  const [customDateTo, setCustomDateTo] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(REPORTS_FILTER_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.customDateTo || '';
        } catch {
          return '';
        }
      }
    }
    return '';
  });

  const [isExporting, setIsExporting] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Global search (by user name) with debounce
  const [searchTerm, setSearchTerm] = useState('');

  // Save filter state to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(REPORTS_FILTER_KEY, JSON.stringify({
        dateRange,
        customDateFrom,
        customDateTo,
      }));
    }
  }, [dateRange, customDateFrom, customDateTo]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  const handleFilterOption = (option: 'lastWeek' | 'lastMonth' | 'lastYear') => {
    setDateRange(option);
    setCustomDateFrom('');
    setCustomDateTo('');
    setIsFilterOpen(false);
  };

  const handleCustomDateApply = () => {
    if (customDateFrom && customDateTo) {
      setDateRange('custom');
      setIsFilterOpen(false);
    }
  };

  // Build filter params for child components
  const getFilterParams = (): { dateRange?: string; dateFrom?: string; dateTo?: string } => {
    if (dateRange === 'custom' && customDateFrom && customDateTo) {
      return { dateFrom: customDateFrom, dateTo: customDateTo };
    }
    if (dateRange === 'lastWeek' || dateRange === 'lastMonth' || dateRange === 'lastYear') {
      return { dateRange };
    }
    return { dateRange };
  };

  // Export handler
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const filterParams = getFilterParams();
      
      // Fetch report data with current filters
      const reportData = activeTab === 'presales'
        ? await apiService.inquiries.getPresalesReport(filterParams)
        : await apiService.inquiries.getSalesReport(filterParams);

      const users = reportData?.data?.users || [];
      
      if (users.length === 0) {
        alert('No data available to export with the current filters.');
        setIsExporting(false);
        return;
      }

      // Convert to CSV
      const escapeCSVField = (field: string | number | null | undefined): string => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      let headers: string[];
      let rows: string[][];

      if (activeTab === 'presales') {
        headers = [
          'Name',
          'Email',
          'Inquiries Created',
          'Inquiries Forwarded',
          'Followups Completed',
          'Pending Followups'
        ];
        rows = users.map((user: any) => [
          escapeCSVField(user.name),
          escapeCSVField(user.email),
          escapeCSVField(user.totalInquiriesCreated),
          escapeCSVField(user.totalInquiriesForwarded),
          escapeCSVField(user.totalFollowupsCompleted),
          escapeCSVField(user.totalPendingFollowups)
        ]);
      } else {
        headers = [
          'Name',
          'Email',
          'Inquiries Attended',
          'Conversions',
          'Admissions',
          'Conversion Rate (%)',
          'Followups Completed',
          'Pending Followups'
        ];
        rows = users.map((user: any) => [
          escapeCSVField(user.name),
          escapeCSVField(user.email),
          escapeCSVField(user.totalInquiriesAttended),
          escapeCSVField(user.totalConversions),
          escapeCSVField(user.totalConvertedToAdmissions),
          escapeCSVField(user.conversionRate),
          escapeCSVField(user.totalFollowupsCompleted),
          escapeCSVField(user.totalPendingFollowups)
        ]);
      }

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Generate filename with date range
      const dateStr = filterParams.dateFrom && filterParams.dateTo
        ? `_${filterParams.dateFrom.replace(/-/g, '')}_to_${filterParams.dateTo.replace(/-/g, '')}`
        : filterParams.dateRange && filterParams.dateRange !== 'allTime'
        ? `_${filterParams.dateRange}`
        : '';
      const reportType = activeTab === 'presales' ? 'Presales' : 'Sales';
      const filename = `${reportType}_Report${dateStr}_${new Date().toISOString().split('T')[0]}.csv`;

      downloadCSV(csvContent, filename);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Tabs and Filters */}
      {/* Header with Tabs and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-0 relative z-10">
        {/* Tab Buttons */}
        <div className="flex flex-row items-center gap-1 overflow-x-auto scrollbar-hide w-full sm:w-auto -mb-px shrink-0">
        <button
          onClick={() => handleTabChange('presales')}
          className={cn(
            'nav-tab group',
            activeTab === 'presales' && 'active'
          )}
        >
          Presales Report
          {activeTab === 'presales' && (
             <div className="nav-tab-indicator" />
          )}
        </button>
        <button
          onClick={() => handleTabChange('sales')}
          className={cn(
            'nav-tab group',
            activeTab === 'sales' && 'active'
          )}
        >
          Sales Report
          {activeTab === 'sales' && (
             <div className="nav-tab-indicator" />
          )}
        </button>
        </div>

        {/* Search + Filter Buttons - Top Right */}
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-end gap-2 w-full">
          {/* Search by name */}
          <div className="w-full sm:w-auto relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name..."
              className="w-full sm:w-64 rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto pb-1 sm:pb-0">
            {/* Filter Buttons */}
            <button
              onClick={() => {
                setDateRange('today');
                setCustomDateFrom('');
                setCustomDateTo('');
              }}
              className={cn(
                'whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                dateRange === 'today'
                  ? 'bg-primary-600 text-white shadow-sm hover:bg-primary-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              Today
            </button>
            <button
              onClick={() => {
                setDateRange('allTime');
                setCustomDateFrom('');
                setCustomDateTo('');
              }}
              className={cn(
                'whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                dateRange === 'allTime'
                  ? 'bg-primary-600 text-white shadow-sm hover:bg-primary-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              All Time
            </button>
            
            {/* Filter Dropdown Button */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={cn(
                  'whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5',
                  (dateRange === 'lastWeek' || dateRange === 'lastMonth' || dateRange === 'lastYear' || dateRange === 'custom')
                    ? 'bg-primary-600 text-white shadow-sm hover:bg-primary-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                <Filter className="h-3 w-3" />
                Filter
                <ChevronDown className={cn('h-3 w-3 transition-transform', isFilterOpen && 'rotate-180')} />
              </button>
              
              {/* Filter Dropdown */}
              {isFilterOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-[100] p-4 max-h-[calc(100vh-120px)] overflow-y-auto">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Date Range
                      </h3>
                      <button
                        onClick={() => setIsFilterOpen(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                    
                    {/* Quick Options */}
                    <div className="space-y-2">
                      <button
                        onClick={() => handleFilterOption('lastWeek')}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                          dateRange === 'lastWeek'
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                        )}
                      >
                        Last Week
                      </button>
                      <button
                        onClick={() => handleFilterOption('lastMonth')}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                          dateRange === 'lastMonth'
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                        )}
                      >
                        Last Month
                      </button>
                      <button
                        onClick={() => handleFilterOption('lastYear')}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                          dateRange === 'lastYear'
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                        )}
                      >
                        Last Year
                      </button>
                    </div>
                    
                    {/* Custom Date Range */}
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-3">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                        Custom Range
                      </label>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">From</label>
                          <input
                            type="date"
                            value={customDateFrom}
                            onChange={(e) => setCustomDateFrom(e.target.value)}
                            min="2000-01-01"
                            max={new Date().toISOString().split('T')[0]}
                            className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">To</label>
                          <input
                            type="date"
                            value={customDateTo}
                            onChange={(e) => setCustomDateTo(e.target.value)}
                            min={customDateFrom || '2000-01-01'}
                            max={new Date().toISOString().split('T')[0]}
                            className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <button
                          onClick={handleCustomDateApply}
                          disabled={!customDateFrom || !customDateTo}
                          className={cn(
                            'w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                            customDateFrom && customDateTo
                              ? 'bg-primary-600 text-white hover:bg-primary-700'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                          )}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={isExporting}
              className={cn(
                'whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5',
                'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
                isExporting && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Download className={cn('h-3.5 w-3.5', isExporting && 'animate-spin')} />
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="card">
        <div className="card-content">
          {activeTab === 'presales' && (
            <PresalesReport
              filterParams={getFilterParams()}
              searchTerm={searchTerm}
            />
          )}
          {activeTab === 'sales' && (
            <SalesReport
              filterParams={getFilterParams()}
              searchTerm={searchTerm}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
