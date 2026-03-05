import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, FileText, Download, Filter, X, ChevronDown, Search, CheckCircle, ArrowUpDown } from 'lucide-react';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import { FollowUp } from '@/types';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import { getLeadStageBadgeClasses, LeadStageConfig } from '@/utils/leadStageColors';
import SalesFollowUpModal from '@/components/SalesFollowUpModal';
import { ITEMS_PER_PAGE } from '@/utils/constants';
import Pagination from '@/components/Pagination';
import { getFormattedPhoneNumber } from '@/utils/exportCSV';

function parseSalesMyFollowUpsParams(sp: URLSearchParams) {
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const nextFollowUpSort = (sp.get('nextFollowUpSort') === 'asc' || sp.get('nextFollowUpSort') === 'desc') ? sp.get('nextFollowUpSort') : 'asc';
  return {
    leadStage: sp.get('leadStage') || '',
    subStage: sp.get('subStage') || '',
    location: sp.get('location') || '',
    course: sp.get('course') || '',
    timeFrame: (sp.get('timeFrame') || 'all') as string,
    customDateFrom: sp.get('customDateFrom') || '',
    customDateTo: sp.get('customDateTo') || '',
    overdue: sp.get('overdue') === '1',
    completed: sp.get('completed') === '1',
    search: sp.get('search') || '',
    nextFollowUpSort: nextFollowUpSort as 'asc' | 'desc',
    page,
  };
}

function salesMyFollowUpsToParams(
  activeFilters: { leadStage: string; subStage: string; location: string; course: string; timeFrame: string; customDateFrom: string; customDateTo: string },
  showOverdueOnly: boolean,
  activeTab: 'pending' | 'completed',
  searchQuery: string,
  currentPage: number,
  nextFollowUpSort: 'asc' | 'desc'
): string {
  const p = new URLSearchParams();
  if (activeFilters.leadStage) p.set('leadStage', activeFilters.leadStage);
  if (activeFilters.subStage) p.set('subStage', activeFilters.subStage);
  if (activeFilters.location) p.set('location', activeFilters.location);
  if (activeFilters.course) p.set('course', activeFilters.course);
  if (activeFilters.timeFrame && activeFilters.timeFrame !== 'all') p.set('timeFrame', activeFilters.timeFrame);
  if (activeFilters.customDateFrom) p.set('customDateFrom', activeFilters.customDateFrom);
  if (activeFilters.customDateTo) p.set('customDateTo', activeFilters.customDateTo);
  if (showOverdueOnly) p.set('overdue', '1');
  if (activeTab === 'completed') p.set('completed', '1');
  if (searchQuery.trim()) p.set('search', searchQuery.trim());
  if (nextFollowUpSort !== 'asc') p.set('nextFollowUpSort', nextFollowUpSort);
  if (currentPage > 1) p.set('page', String(currentPage));
  const s = p.toString();
  return s ? `?${s}` : '';
}

interface FollowUpWithInquiry extends FollowUp {
  inquiry: {
    _id: string;
    name: string;
    email: string;
    phone: string;
    city: string;
    course: string;
    preferredLocation: string;
    status: string;
    department: string;
  };
}

const SalesMyFollowUps: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const parsed = useMemo(() => parseSalesMyFollowUpsParams(searchParams), [searchParams]);

  const [activeFilters, setActiveFilters] = useState(() => ({
    leadStage: parsed.leadStage,
    subStage: parsed.subStage,
    location: parsed.location,
    course: parsed.course,
    timeFrame: parsed.timeFrame,
    customDateFrom: parsed.customDateFrom,
    customDateTo: parsed.customDateTo,
  }));
  const [showOverdueOnly, setShowOverdueOnly] = useState(parsed.overdue);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>(parsed.completed ? 'completed' : 'pending');
  const [nextFollowUpSort, setNextFollowUpSort] = useState<'asc' | 'desc'>(parsed.nextFollowUpSort);
  const [searchQuery, setSearchQuery] = useState(parsed.search);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(parsed.search);
  const [currentPage, setCurrentPage] = useState(parsed.page);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [isSalesFollowUpModalOpen, setIsSalesFollowUpModalOpen] = useState(false);
  const [followUpToComplete, setFollowUpToComplete] = useState<{ inquiryId: string; followUpId: string } | null>(null);

  const skipResetRunsRef = useRef(0);
  useEffect(() => {
    const p = parseSalesMyFollowUpsParams(searchParams);
    skipResetRunsRef.current = 2; // skip next 2 reset effect runs (restore from URL/back)
    setActiveFilters({
      leadStage: p.leadStage,
      subStage: p.subStage,
      location: p.location,
      course: p.course,
      timeFrame: p.timeFrame,
      customDateFrom: p.customDateFrom,
      customDateTo: p.customDateTo,
    });
    setShowOverdueOnly(p.overdue);
    setActiveTab(p.completed ? 'completed' : 'pending');
    setNextFollowUpSort(p.nextFollowUpSort);
    setSearchQuery(p.search);
    setDebouncedSearchQuery(p.search);
    setCurrentPage(p.page);
  }, [searchParams]);

  useEffect(() => {
    const next = salesMyFollowUpsToParams(activeFilters, showOverdueOnly, activeTab, searchQuery, currentPage, nextFollowUpSort);
    const current = searchParams.toString();
    const currentStr = current ? `?${current}` : '';
    if (next !== currentStr) {
      setSearchParams(next.startsWith('?') ? next.slice(1) : next, { replace: true });
    }
  }, [activeFilters, showOverdueOnly, activeTab, searchQuery, currentPage, nextFollowUpSort]);

  // Reset to page 1 when user changes filters (skip when restoring from URL/back)
  useEffect(() => {
    if (skipResetRunsRef.current > 0) {
      skipResetRunsRef.current--;
      return;
    }
    setCurrentPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeFilters, showOverdueOnly, activeTab, debouncedSearchQuery]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);
  

  const { data, isLoading, error, refetch } = useQuery(
    ['sales-my-follow-ups'],
    () => apiService.inquiries.getMyFollowUps(),
    {
      staleTime: 90 * 1000, // 90s – socket invalidates on inquiry updates
      refetchOnWindowFocus: true,
    }
  );

  // Fetch options for dynamic lead stage colors and filters
  const { data: optionsData } = useQuery(
    'options',
    () => apiService.options.get(),
    { staleTime: 60 * 1000 }
  );
  
  const leadStagesConfig: LeadStageConfig[] = useMemo(() => {
    return optionsData?.data?.leadStages || [];
  }, [optionsData?.data?.leadStages]);

  const optCourses: string[] = optionsData?.data?.courses || ['CDEC', 'X-DSAAI', 'DevOps', 'Full-Stack', 'Any'];
  const optLocations: string[] = optionsData?.data?.locations || ['Nagpur', 'Pune', 'Nashik', 'Indore'];
  const optLeadStages = leadStagesConfig.map(ls => ls.label).filter(Boolean);

  // Helpers for time filtering - based on nextFollowUpDate
  const checkTimeFrame = (followUp: FollowUpWithInquiry, frame: string): boolean => {
    // For completed tab, use updatedAt (completion time)
    // For pending tab, use nextFollowUpDate
    const dateString = activeTab === 'completed'
      ? followUp.updatedAt
      : followUp.nextFollowUpDate;

    if (!dateString) return false;
    const followUpDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of today
    
    if (frame === 'today') {
      const todayStart = new Date(today);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      return followUpDate >= todayStart && followUpDate <= todayEnd;
    }

    if (frame === 'upcoming') {
      // Show only follow-ups with nextFollowUpDate in the future
      const now = new Date();
      return followUpDate > now;
    }

    if (frame === 'custom') {
      // Custom date range filter based on nextFollowUpDate for pending, updatedAt for completed
      if (!activeFilters.customDateFrom || !activeFilters.customDateTo) return true;
      
      const fromDate = new Date(activeFilters.customDateFrom);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(activeFilters.customDateTo);
      toDate.setHours(23, 59, 59, 999);
      
      return followUpDate >= fromDate && followUpDate <= toDate;
    }

    return true; // 'all'
  };

  // Raw follow-ups (no default sort; we sort after filtering)
  const allFollowUps: FollowUpWithInquiry[] = data?.data?.followUps || [];

  // Debounce search query for filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter follow-ups based on selected filter
  const followUps: FollowUpWithInquiry[] = allFollowUps.filter((fu) => {
    // Filter by Completion Status
    if (activeTab === 'completed') {
      // Show only completed follow-ups
      if (fu.completionStatus !== 'complete') return false;
    } else {
      // Show only incomplete follow-ups (default view)
      if (fu.completionStatus === 'complete') return false;
    }

    // Search by Name or Phone
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      const nameMatch = fu.inquiry?.name?.toLowerCase().includes(query);
      const phoneMatch = fu.inquiry?.phone?.toLowerCase().includes(query);
      if (!nameMatch && !phoneMatch) return false;
    }

    // Filter by Overdue (past follow-ups only)
    if (showOverdueOnly) {
      if (!fu.nextFollowUpDate) return false; // Exclude follow-ups without nextFollowUpDate
      const nextFollowUpDate = new Date(fu.nextFollowUpDate);
      const now = new Date();
      if (nextFollowUpDate >= now) return false; // Only show past follow-ups
    }

    // Filter by Lead Stage
    if (activeFilters.leadStage && fu.leadStage !== activeFilters.leadStage) return false;

    // Filter by Sub Stage
    if (activeFilters.subStage && fu.subStage && !fu.subStage.toLowerCase().includes(activeFilters.subStage.toLowerCase())) return false; // Partial match for substage text input

    // Filter by Location
    if (activeFilters.location && fu.inquiry?.preferredLocation !== activeFilters.location) return false;
    
    // Filter by Course
    if (activeFilters.course && fu.inquiry?.course !== activeFilters.course) return false;

    // Filter by Time Frame
    if (activeFilters.timeFrame !== 'all' && !checkTimeFrame(fu, activeFilters.timeFrame)) return false;

    return true;
  });

  // Sort by Next Follow-up / Completed Date
  const sortedFollowUps = useMemo(() => {
    const dateKey = activeTab === 'completed' ? 'updatedAt' : 'nextFollowUpDate';
    const getTime = (fu: FollowUpWithInquiry) => {
      const val = dateKey === 'updatedAt' ? fu.updatedAt : fu.nextFollowUpDate;
      if (val) return new Date(val).getTime();
      return dateKey === 'updatedAt' ? 0 : Number.MAX_SAFE_INTEGER; // no date = end for pending
    };
    const multiplier = nextFollowUpSort === 'asc' ? 1 : -1;
    return [...followUps].sort((a, b) => multiplier * (getTime(a) - getTime(b)));
  }, [followUps, activeTab, nextFollowUpSort]);

  // Client-side pagination
  const totalPages = Math.ceil(sortedFollowUps.length / ITEMS_PER_PAGE);
  const paginatedFollowUps = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedFollowUps.slice(startIndex, endIndex);
  }, [sortedFollowUps, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (activeFilters.leadStage) count++;
    if (activeFilters.subStage) count++;
    if (activeFilters.location) count++;
    if (activeFilters.course) count++;
    if (activeFilters.timeFrame !== 'all') count++;
    if (activeFilters.timeFrame !== 'all') count++;
    if (showOverdueOnly) count++;
    return count;
  };

  const clearAllFilters = () => {
    setActiveFilters({
      leadStage: '',
      subStage: '',
      course: '',
      location: '',
      timeFrame: 'all',
      customDateFrom: '',
      customDateTo: '',
    });
    setShowOverdueOnly(false);
  };

  const handleTabChange = (tab: 'pending' | 'completed') => {
    if (tab !== activeTab) {
      // Clear filters first
      setActiveFilters({
        leadStage: '',
        subStage: '',
        course: '',
        location: '',
        timeFrame: tab === 'completed' ? 'today' : 'all', // Default to today for completed tab
        customDateFrom: '',
        customDateTo: '',
      });
      setShowOverdueOnly(false);
      setActiveTab(tab);
    }
  };

  const handleMarkCompleteClick = (inquiryId: string, followUpId: string) => {
    setFollowUpToComplete({ inquiryId, followUpId });
    setIsSalesFollowUpModalOpen(true);
  };

  const handleSalesFollowUpModalSuccess = async () => {
    // The modal already handles marking the previous follow-up as complete
    // Wait a bit for backend to process, then refetch the data and reset state
    await new Promise(resolve => setTimeout(resolve, 500));
    await refetch();
    setFollowUpToComplete(null);
  };

  const handleSalesFollowUpModalClose = () => {
    setIsSalesFollowUpModalOpen(false);
    setFollowUpToComplete(null);
  };

  const handleViewInquiry = (inquiryId: string) => {
    navigate(`/inquiries/${inquiryId}`);
  };

  const handleExport = () => {
    // Sales export: same columns as presales but Lead Stage and Substage instead of Inquiry Status
    const headers = [
      'Name',
      'Phone',
      'Preferred Course',
      'Preferred Location',
      'City',
      'Lead Stage',
      'Substage',
      'Message',
      'Next Follow-up Date',
      'Next Follow-up Time'
    ];

    const escapeCsv = (val: string | number | undefined | null): string => {
      const s = val === null || val === undefined ? '' : String(val);
      return `"${s.replace(/"/g, '""')}"`;
    };

    const formatNextFollowUpDate = (isoDate: string | undefined): string => {
      if (!isoDate) return '';
      try {
        const d = new Date(isoDate);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
      } catch {
        return '';
      }
    };

    const formatNextFollowUpTime12h = (isoDate: string | undefined): string => {
      if (!isoDate) return '';
      try {
        const d = new Date(isoDate);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      } catch {
        return '';
      }
    };

    const rows = sortedFollowUps.map((followUp: FollowUpWithInquiry) => {
      return [
        followUp.inquiry?.name ?? '',
        getFormattedPhoneNumber(followUp.inquiry?.phone ?? ''),
        followUp.inquiry?.course ?? '',
        followUp.inquiry?.preferredLocation ?? '',
        followUp.inquiry?.city ?? '',
        followUp.leadStage ?? '',
        followUp.subStage ?? '',
        followUp.message ?? '',
        formatNextFollowUpDate(followUp.nextFollowUpDate),
        formatNextFollowUpTime12h(followUp.nextFollowUpDate)
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row: (string | number)[]) => row.map(escapeCsv).join(','))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sales-my-follow-ups-${activeFilters.timeFrame}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64 sm:min-h-80">
        <LoadingSpinner size="lg" label="Loading follow-ups..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 dark:text-red-500">
          <FileText className="mx-auto h-12 w-12" />
        </div>
        <h3 className="mt-2 text-sm font-medium text-secondary-900 dark:text-white">
          Error loading follow-ups
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Tab Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1">
          {/* Tab Navigation */}
          <div className="nav-tabs flex flex-wrap sm:flex-nowrap">
            <button
              onClick={() => handleTabChange('pending')}
              className={cn(
                "nav-tab group flex items-center gap-1 sm:gap-2 text-sm sm:text-base px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap min-w-0 flex-1 sm:flex-initial",
                activeTab === 'pending' && "active"
              )}
            >
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="hidden sm:inline">Pending Follow-ups</span>
              <span className="sm:hidden truncate">Pending</span>
              {activeTab === 'pending' && (
                <div className="nav-tab-indicator" />
              )}
            </button>
            <button
              onClick={() => handleTabChange('completed')}
              className={cn(
                "nav-tab group flex items-center gap-1 sm:gap-2 text-sm sm:text-base px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap min-w-0 flex-1 sm:flex-initial",
                activeTab === 'completed' && "active"
              )}
            >
              <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="hidden sm:inline">Completed Follow-ups</span>
              <span className="sm:hidden truncate">Completed</span>
              {activeTab === 'completed' && (
                <div className="nav-tab-indicator" />
              )}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
           {/* Search Input */}
           <div className="relative w-full">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
               <Search className="h-4 w-4 text-gray-400" />
             </div>
             <input
               type="text"
               placeholder="Search by name or phone..."
               className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
             />
           </div>

           {/* Buttons Row */}
           <div className="flex items-center gap-2">
           {/* Filter Button */}
            <div className="relative flex-1" ref={filterRef}>
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={cn(
                  "btn btn-outline flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 w-full text-xs sm:text-sm",
                  getActiveFilterCount() > 0 && "bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700"
                )}
              >
                <Filter className="hidden sm:block h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Filters</span>
                {getActiveFilterCount() > 0 && (
                  <span className="bg-primary-600 text-white text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-full">
                    {getActiveFilterCount()}
                  </span>
                )}
                <ChevronDown className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform", isFilterOpen && "transform rotate-180")} />
              </button>

              {/* Filter Dropdown */}
              {isFilterOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-[calc(100vw-1rem)] sm:w-80 max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-secondary-200 dark:border-secondary-700 z-50 p-4">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-secondary-200 dark:border-secondary-700">
                      <h3 className="text-sm font-semibold text-secondary-900 dark:text-white">Filters</h3>
                      {getActiveFilterCount() > 0 && (
                        <button
                          onClick={clearAllFilters}
                          className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Time Frame Filter */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Time Period
                      </label>
                      <select
                        value={activeFilters.timeFrame}
                        onChange={(e) => setActiveFilters(prev => ({ ...prev, timeFrame: e.target.value }))}
                        className="input text-sm"
                      >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        {activeTab === 'pending' && <option value="upcoming">Upcoming</option>}
                        {/* Custom date range option for both tabs */}
                        <option value="custom">Custom Date Range</option>
                      </select>
                    </div>

                    {/* Custom Date Range Inputs - Show when 'custom' is selected on either tab */}
                    {activeFilters.timeFrame === 'custom' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {activeTab === 'completed' ? 'Completed From Date' : 'From Date'}
                          </label>
                          <input
                            type="date"
                            value={activeFilters.customDateFrom}
                            onChange={(e) => setActiveFilters(prev => ({ ...prev, customDateFrom: e.target.value }))}
                            className="input text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {activeTab === 'completed' ? 'Completed To Date' : 'To Date'}
                          </label>
                          <input
                            type="date"
                            value={activeFilters.customDateTo}
                            onChange={(e) => setActiveFilters(prev => ({ ...prev, customDateTo: e.target.value }))}
                            className="input text-sm"
                          />
                        </div>
                      </>
                    )}

                    {/* Lead Stage Filter */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Lead Stage
                      </label>
                      <select
                        value={activeFilters.leadStage}
                        onChange={(e) => setActiveFilters(prev => ({ ...prev, leadStage: e.target.value }))}
                        className="input text-sm"
                      >
                        <option value="">All Stages</option>
                        {optLeadStages.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    {/* Sub Stage Filter */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Sub Stage
                      </label>
                      <input
                        type="text"
                        value={activeFilters.subStage}
                        onChange={(e) => setActiveFilters(prev => ({ ...prev, subStage: e.target.value }))}
                         className="input text-sm px-2 py-1"
                         placeholder="Filter by sub-stage..."
                      />
                    </div>

                    {/* Location Filter */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Location
                      </label>
                      <select
                        value={activeFilters.location}
                        onChange={(e) => setActiveFilters(prev => ({ ...prev, location: e.target.value }))}
                        className="input text-sm"
                      >
                        <option value="">All Locations</option>
                        {optLocations.map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>

                    {/* Course Filter */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Course
                      </label>
                      <select
                        value={activeFilters.course}
                        onChange={(e) => setActiveFilters(prev => ({ ...prev, course: e.target.value }))}
                        className="input text-sm"
                      >
                        <option value="">All Courses</option>
                        {optCourses.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Overdue Button - Only show properly in Pending tab */}
            {activeTab === 'pending' && (
              <button
                onClick={() => {
                  setShowOverdueOnly(!showOverdueOnly);
                }}
                className={cn(
                  "btn flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 flex-1 text-xs sm:text-sm whitespace-nowrap",
                  showOverdueOnly
                    ? "bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                    : "btn-outline"
                )}
              >
                <Clock className="hidden sm:block h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Overdue</span>
              </button>
            )}

            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={sortedFollowUps.length === 0}
              className={cn(
                'inline-flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 flex-1 text-xs sm:text-sm font-medium rounded transition-colors whitespace-nowrap',
                sortedFollowUps.length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                  : 'bg-primary-500 text-white hover:bg-primary-600 shadow-sm hover:shadow active:scale-95'
              )}
            >
              <Download className="hidden sm:block h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

       {/* Active Filter Badges */}
       <div className="mb-4">
          {getActiveFilterCount() > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-secondary-200 dark:border-secondary-700">
              {showOverdueOnly && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs font-medium">
                  Overdue
                  <button onClick={() => setShowOverdueOnly(false)} className="hover:text-red-900 dark:hover:text-red-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
               {activeFilters.timeFrame !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                  Time: {activeFilters.timeFrame.replace('_', ' ')}
                  <button onClick={() => setActiveFilters(prev => ({ ...prev, timeFrame: 'all' }))} className="hover:text-primary-900 dark:hover:text-primary-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeFilters.leadStage && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                  Stage: {activeFilters.leadStage}
                  <button onClick={() => setActiveFilters(prev => ({ ...prev, leadStage: '' }))} className="hover:text-primary-900 dark:hover:text-primary-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeFilters.subStage && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                  Sub-Stage: {activeFilters.subStage}
                  <button onClick={() => setActiveFilters(prev => ({ ...prev, subStage: '' }))} className="hover:text-primary-900 dark:hover:text-primary-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeFilters.location && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                  Location: {activeFilters.location}
                  <button onClick={() => setActiveFilters(prev => ({ ...prev, location: '' }))} className="hover:text-primary-900 dark:hover:text-primary-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeFilters.course && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                  Course: {activeFilters.course}
                  <button onClick={() => setActiveFilters(prev => ({ ...prev, course: '' }))} className="hover:text-primary-900 dark:hover:text-primary-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}
       </div>

      {sortedFollowUps.length > 0 && (
            <div className="mb-1">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Showing {sortedFollowUps.length} follow-up{sortedFollowUps.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}

      {/* Follow-Ups List */}
      <div className="card">
      
        <div className="p-0">
          

          <div className="overflow-x-auto rounded-xl">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    Phone Number
                  </th>
                  <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Lead Stage
                  </th>
                  <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">
                      {activeTab === 'completed' ? 'Completed Date' : 'Next Follow-up'}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setNextFollowUpSort((s: 'asc' | 'desc') => s === 'asc' ? 'desc' : 'asc'); }}
                        className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        title={nextFollowUpSort === 'asc' ? 'Ascending (earliest first). Click to sort descending.' : 'Descending (latest first). Click to sort ascending.'}
                        aria-label={`Sort by ${activeTab === 'completed' ? 'Completed Date' : 'Next Follow-up'} ${nextFollowUpSort === 'asc' ? 'ascending' : 'descending'}`}
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </th>
                  <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    Course
                  </th>
                  <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden xl:table-cell">
                    Preferred Location
                  </th>
                  {activeTab === 'pending' && (
                    <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {paginatedFollowUps.map((followUp: FollowUpWithInquiry, index: number) => (
                  <motion.tr
                    key={followUp._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    onClick={() => handleViewInquiry(followUp.inquiry?._id)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    <td className="px-3 sm:px-4 py-2">
                      <div className="text-sm font-medium text-secondary-900 dark:text-white">
                        {followUp.inquiry?.name || 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 md:hidden mt-1">
                        {followUp.inquiry?.phone || 'N/A'}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2 hidden md:table-cell">
                      <div className="text-sm text-secondary-900 dark:text-white">
                        {followUp.inquiry?.phone || 'N/A'}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2">
                      {followUp.leadStage ? (
                        <div className="flex flex-col gap-0.5">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit',
                            getLeadStageBadgeClasses(followUp.leadStage, leadStagesConfig)
                          )}>
                            {followUp.leadStage}
                          </span>
                          {followUp.subStage && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {followUp.subStage}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                          N/A
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-2">
                      {activeTab === 'completed' ? (
                        // Show completed date for completed tab
                        followUp.updatedAt ? (
                          <div className="flex flex-col">
                            <div className="text-sm text-secondary-900 dark:text-white">
                              {new Date(followUp.updatedAt).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(followUp.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400 dark:text-gray-500 italic">
                            N/A
                          </div>
                        )
                      ) : (
                        // Show next follow-up date for pending tab
                        followUp.nextFollowUpDate ? (
                          <div className="flex flex-col">
                            <div className="text-sm text-secondary-900 dark:text-white">
                              {new Date(followUp.nextFollowUpDate).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(followUp.nextFollowUpDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400 dark:text-gray-500 italic">
                            Not scheduled
                          </div>
                        )
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-2 hidden lg:table-cell">
                      <div className="text-sm text-secondary-900 dark:text-white">
                        {followUp.inquiry?.course || 'N/A'}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2 hidden xl:table-cell">
                      <div className="text-sm text-secondary-900 dark:text-white">
                        {followUp.inquiry?.preferredLocation || 'N/A'}
                      </div>
                    </td>
                    {activeTab === 'pending' && (
                      <td className="px-3 sm:px-4 py-2 text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          {followUp.completionStatus !== 'complete' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const inquiryId = followUp.inquiry?._id;
                                if (inquiryId) {
                                  handleMarkCompleteClick(inquiryId, followUp._id);
                                }
                              }}
                              className="inline-flex items-center justify-center p-1.5 sm:p-2 text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                              title="Mark as Complete"
                            >
                              <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty State */}
          {sortedFollowUps.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 dark:text-gray-500">
                <Clock className="mx-auto h-12 w-12" />
              </div>
              <h3 className="mt-2 text-sm font-medium text-secondary-900 dark:text-white">
                No follow-ups found
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                You haven't created any follow-ups yet.
              </p>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                Create follow-ups from the inquiry details page.
              </p>
            </div>
          )}

          {/* Pagination */}
          {sortedFollowUps.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sortedFollowUps.length}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          )}
        </div>
      </div>

      {/* Sales Follow-up Modal */}
      {followUpToComplete && (
        <SalesFollowUpModal
          isOpen={isSalesFollowUpModalOpen}
          onClose={handleSalesFollowUpModalClose}
          inquiryId={followUpToComplete.inquiryId}
          onSuccess={handleSalesFollowUpModalSuccess}
          followUpToMarkComplete={followUpToComplete.followUpId}
        />
      )}
    </div>
  );
};

export default SalesMyFollowUps;

