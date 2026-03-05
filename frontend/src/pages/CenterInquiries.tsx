import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQuery as useRQ } from 'react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FileText, MapPin, X, ArrowRight, LayoutDashboard, ArrowUpDown } from 'lucide-react';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import { Inquiry, InquiryFilters, LocationType, InquiryStatus } from '@/types';
import { getStatusColor, getStatusLabel, ITEMS_PER_PAGE } from '@/utils/constants';
import { cn } from '@/utils/cn';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import { getLeadStageBadgeClasses, LeadStageConfig } from '@/utils/leadStageColors';
import Pagination from '@/components/Pagination';
import { parseInquiryFiltersFromParams, inquiryFiltersToParams, paramsToSearchString } from '@/utils/listingUrlParams';

const CenterInquiries: React.FC = () => {
  const { centerLocation } = useParams<{ centerLocation: string }>();
  const decodedLocation = centerLocation ? decodeURIComponent(centerLocation) : '';
  const [searchParams, setSearchParams] = useSearchParams();

  const parsed = useMemo(() => parseInquiryFiltersFromParams(searchParams), [searchParams]);
  const attFromUrl = (searchParams.get('attendance') as 'all' | 'pending' | 'in_progress') || 'pending';

  const [filters, setFilters] = useState<InquiryFilters>(() => ({
    search: '',
    sort: 'updatedAt',
    order: 'desc',
    status: undefined,
    course: undefined,
    ...parsed,
    page: undefined,
    location: decodedLocation as LocationType,
  }));
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'pending' | 'in_progress'>(attFromUrl);
  const [currentPage, setCurrentPage] = useState(() => parsed.page ?? 1);
  const [forwardedAtSort, setForwardedAtSort] = useState<'asc' | 'desc'>(() => {
    const v = searchParams.get('forwardedAtSort');
    return v === 'asc' || v === 'desc' ? v : 'desc';
  });

  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const hasPermission = useMemo(() => {
    if (!user) return false;
    if (user.role !== 'sales') return true;
    return user.centerPermissions?.includes(decodedLocation);
  }, [user, decodedLocation]);

  // Dynamically refresh profile if permission is missing (in case admin just granted it)
  useEffect(() => {
    if (user?.role === 'sales' && !user?.centerPermissions?.includes(decodedLocation)) {
      refreshProfile();
    }
  }, [decodedLocation, user?.role, refreshProfile]);

  useEffect(() => {
    const p = parseInquiryFiltersFromParams(searchParams);
    const att = (searchParams.get('attendance') as 'all' | 'pending' | 'in_progress') || 'pending';
    setFilters(prev => ({ ...prev, ...p, page: undefined, location: decodedLocation as LocationType }));
    setAttendanceFilter(att);
    setCurrentPage(p.page ?? 1);
    const fwdSort = searchParams.get('forwardedAtSort');
    setForwardedAtSort(fwdSort === 'asc' || fwdSort === 'desc' ? fwdSort : 'desc');
  }, [searchParams, decodedLocation]);

  useEffect(() => {
    const params = inquiryFiltersToParams(filters, currentPage, {
      attendance: attendanceFilter, // Always include attendance, even when 'all'
      ...(forwardedAtSort !== 'desc' ? { forwardedAtSort } : {}),
    });
    const next = paramsToSearchString(params);
    const current = searchParams.toString();
    if (next !== (current ? `?${current}` : '')) {
      setSearchParams(next.startsWith('?') ? next.slice(1) : next, { replace: true });
    }
  }, [filters, attendanceFilter, currentPage, forwardedAtSort]);

  const { data, isLoading } = useQuery(
    ['center-inquiries', filters, decodedLocation, user?.role],
    () => apiService.inquiries.getAll({
      ...filters,
      dateField: 'forwardedAt',
      ...(user?.role === 'admin' ? { department: 'sales' } : {}),
    }),
    {
      keepPreviousData: true,
      staleTime: 90 * 1000, // 90s – socket invalidates on inquiry updates
      refetchOnWindowFocus: false,
      enabled: !!decodedLocation && hasPermission,
    }
  );

  // Dynamic options (courses, locations)
  const { data: optionsData } = useRQ('options', () => apiService.options.get(), { staleTime: 5 * 60 * 1000 });
  const optCourses: string[] = optionsData?.data?.courses || ['CDEC', 'X-DSAAI', 'DevOps', 'Full-Stack', 'Any'];
  const optStatuses: string[] = optionsData?.data?.statuses || ['hot', 'warm', 'cold'];
  
  // Lead stages config for dynamic colors
  const leadStagesConfig: LeadStageConfig[] = useMemo(() => {
    return optionsData?.data?.leadStages || [];
  }, [optionsData?.data?.leadStages]);
  
  // Helper function to get the latest lead stage from an inquiry's follow-ups
  const getLatestLeadStage = (inquiry: Inquiry): { leadStage: string; subStage: string } | null => {
    if (!inquiry.followUps || inquiry.followUps.length === 0) {
      return null;
    }
    
    // Sort follow-ups by createdAt descending to get the latest
    const sortedFollowUps = [...inquiry.followUps].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latestFollowUp = sortedFollowUps[0];
    
    if (latestFollowUp.leadStage) {
      return {
        leadStage: latestFollowUp.leadStage,
        subStage: latestFollowUp.subStage || ''
      };
    }
    return null;
  };

  const allInquiries = data?.data?.inquiries || [];
  
  // Helper function to check if an inquiry is admitted (Hot + Confirmed Admission)
  const isAdmitted = (inq: Inquiry): boolean => {
    if (!inq.followUps || inq.followUps.length === 0) {
      return false;
    }
    
    // Get the latest follow-up (most recent by createdAt)
    const latestFollowUp = [...inq.followUps].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    
    // Check if leadStage is "Hot" and subStage is "Confirmed Admission"
    return latestFollowUp.leadStage === 'Hot' && latestFollowUp.subStage === 'Confirmed Admission';
  };
  
  // Helper function to check if an inquiry has been ATTENDED by sales
  const isAttended = (inq: Inquiry): boolean => {
    // For sales department inquiries, they are attended ONLY if assigned to a sales user
    if (inq.department === 'sales') {
      return !!inq.assignedTo;
    }
    
    // For presales department inquiries
    if (inq.assignedTo) {
      return true;
    }
    
    if (inq.assignmentStatus && inq.assignmentStatus !== 'not_assigned') {
      return true;
    }
    
    return false;
  };

  // Filter: exclude admitted students completely - they go to Admitted Students page
  // Also handle attendance filtering for sales and admin users
  const { inquiries, allCount, pendingCount, inProgressCount } = useMemo(() => {
    // First remove admitted students
    const nonAdmittedInquiries = allInquiries.filter((inq: Inquiry) => !isAdmitted(inq));
    
    // If not sales or admin user, just return all non-admitted
    if (user?.role !== 'sales' && user?.role !== 'admin') {
      return {
        inquiries: nonAdmittedInquiries,
        allCount: nonAdmittedInquiries.length,
        pendingCount: 0,
        inProgressCount: 0
      };
    }
    
    // Calculate counts for sales and admin
    const pending = nonAdmittedInquiries.filter((inq: Inquiry) => !isAttended(inq));
    const inProgress = nonAdmittedInquiries.filter((inq: Inquiry) => isAttended(inq));
    
    // Filter based on active selection
    let filtered: Inquiry[] = [];
    if (attendanceFilter === 'pending') {
      filtered = pending;
    } else if (attendanceFilter === 'in_progress') {
      filtered = inProgress;
    } else {
      filtered = nonAdmittedInquiries;
    }
    
    return {
      inquiries: filtered,
      allCount: nonAdmittedInquiries.length,
      pendingCount: pending.length,
      inProgressCount: inProgress.length
    };
  }, [allInquiries, attendanceFilter, user?.role]);

  // Client-side sort by Forwarded At (admin/sales only)
  const sortedInquiries = useMemo(() => {
    if (user?.role !== 'admin' && user?.role !== 'sales') return inquiries;
    const multiplier = forwardedAtSort === 'asc' ? 1 : -1;
    return [...inquiries].sort((a, b) => {
      const aTime = a.forwardedAt ? new Date(a.forwardedAt).getTime() : (forwardedAtSort === 'asc' ? Number.MAX_SAFE_INTEGER : 0);
      const bTime = b.forwardedAt ? new Date(b.forwardedAt).getTime() : (forwardedAtSort === 'asc' ? Number.MAX_SAFE_INTEGER : 0);
      return multiplier * (aTime - bTime);
    });
  }, [inquiries, forwardedAtSort, user?.role]);

  // Client-side pagination
  const totalPages = Math.ceil(sortedInquiries.length / ITEMS_PER_PAGE);
  const paginatedInquiries = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedInquiries.slice(startIndex, endIndex);
  }, [sortedInquiries, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterChange = (key: keyof InquiryFilters, value: any) => {
    setCurrentPage(1);
    setFilters(prev => ({
      ...prev,
      [key]: value,
      location: decodedLocation as LocationType,
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearFilter = (key: keyof InquiryFilters) => {
    setCurrentPage(1);
    setFilters(prev => ({ 
      ...prev, 
      [key]: undefined, 
      location: decodedLocation as LocationType,
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearAllFilters = () => {
    setCurrentPage(1);
    setFilters(prev => ({
      ...prev,
      status: undefined,
      course: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      location: decodedLocation as LocationType,
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.status) count++;
    if (filters.course) count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    return count;
  };

  const getRowBg = (_inq: Inquiry) => {
    return 'bg-white dark:bg-secondary-900 hover:bg-gray-100 dark:hover:bg-secondary-200 transition-colors';
  };


  const handleViewInquiry = (inquiryId: string) => {
    navigate(`/inquiries/${inquiryId}`, {
      state: {
        attendanceFilter,
        fromPage: 'center-inquiries',
        centerLocation: decodedLocation
      }
    });
  };

  if (!decodedLocation) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400">No center location selected</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64 sm:min-h-80">
        <LoadingSpinner size="lg" label="Loading center inquiries..." />
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
        
        <h2 className="text-lg font-bold text-secondary-900 dark:text-white mb-1.5">
          Access Restricted
        </h2>
        <p className="text-sm text-secondary-600 dark:text-secondary-400 max-w-md mb-6">
          You don't have permission to view inquiries for the <span className="font-semibold text-secondary-900 dark:text-white">{decodedLocation}</span> center. 
          Please contact your administrator to request access.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn btn-primary btn-sm flex items-center gap-2"
        >
          <LayoutDashboard className="h-4 w-4" />
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 lg:mb-0">
            <MapPin className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-secondary-900 dark:text-white">
              {decodedLocation} Center
            </h1>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-2 w-full lg:w-auto">
          {(user?.role === 'sales' || user?.role === 'admin') && (
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <button
                onClick={() => navigate(`/centers/${encodeURIComponent(decodedLocation)}/dashboard`)}
                className="inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 bg-secondary-900 text-white shadow-md hover:bg-secondary-800 dark:bg-primary-600 dark:hover:bg-primary-700"
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Dashboard
              </button>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg items-center gap-1 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => {
                  setCurrentPage(1); setAttendanceFilter('all');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={cn(
                  'px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all whitespace-nowrap shrink-0 flex items-center gap-2',
                  attendanceFilter === 'all'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-200 dark:ring-gray-600'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                )}
              >
                All
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold',
                  attendanceFilter === 'all'
                    ? 'bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                )}>
                  {allCount}
                </span>
              </button>
              <button
                onClick={() => {
                  setCurrentPage(1); setAttendanceFilter('pending');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={cn(
                  'px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all whitespace-nowrap shrink-0 flex items-center gap-2',
                  attendanceFilter === 'pending'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-200 dark:ring-gray-600'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                )}
              >
                New
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold',
                  attendanceFilter === 'pending'
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                )}>
                  {pendingCount}
                </span>
              </button>
              <button
                onClick={() => {
                  setCurrentPage(1); setAttendanceFilter('in_progress');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={cn(
                  'px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all whitespace-nowrap shrink-0 flex items-center gap-2',
                  attendanceFilter === 'in_progress'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-200 dark:ring-gray-600'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                )}
              >
                In Progress
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold',
                  attendanceFilter === 'in_progress'
                    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                )}>
                  {inProgressCount}
                </span>
              </button>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4">
        {/* Filter Options in Single Line Responsive Layout */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Course Filter */}
          <div className="flex-1 min-w-[120px] sm:min-w-[140px]">
            <select
              value={filters.course || ''}
              onChange={(e) => handleFilterChange('course', e.target.value || undefined)}
              className="input h-9 text-xs w-full py-1"
            >
              <option value="">All Courses</option>
              {optCourses.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex-1 min-w-[120px] sm:min-w-[140px]">
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
              className="input h-9 text-xs w-full py-1"
            >
              <option value="">All Status</option>
              {optStatuses.map(status => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Date From Filter */}
          <div className="flex-1 min-w-[140px] sm:min-w-[160px]">
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value || undefined)}
              className="input h-9 text-xs w-full py-1"
              placeholder="Date From"
              min="2000-01-01"
              max={new Date().toISOString().split('T')[0]}
              title="Filter by date from"
            />
          </div>

          {/* Arrow Icon */}
          <div className="shrink-0 h-9 flex items-center justify-center">
            <ArrowRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
          </div>

          {/* Date To Filter */}
          <div className="flex-1 min-w-[140px] sm:min-w-[160px]">
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => handleFilterChange('dateTo', e.target.value || undefined)}
              className="input h-9 text-xs w-full py-1"
              placeholder="Date To"
              min={filters.dateFrom || "2000-01-01"}
              max={new Date().toISOString().split('T')[0]}
              title="Filter by date to"
            />
          </div>

          {/* Clear Filters Button */}
          <div className="shrink-0 pb-1">
            {getActiveFilterCount() > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium flex items-center gap-1 transition-colors px-2 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 whitespace-nowrap"
              >
                <X className="h-3 w-3" />
                Clear All ({getActiveFilterCount()})
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Badges */}
        {getActiveFilterCount() > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700">
            {filters.course && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                Course: {filters.course}
                <button onClick={() => clearFilter('course')} className="hover:text-primary-900 dark:hover:text-primary-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.status && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                Status: {filters.status}
                <button onClick={() => clearFilter('status')} className="hover:text-primary-900 dark:hover:text-primary-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.dateFrom && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                From: {new Date(filters.dateFrom).toLocaleDateString()}
                <button onClick={() => clearFilter('dateFrom')} className="hover:text-primary-900 dark:hover:text-primary-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.dateTo && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                To: {new Date(filters.dateTo).toLocaleDateString()}
                <button onClick={() => clearFilter('dateTo')} className="hover:text-primary-900 dark:hover:text-primary-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Results Count */}
      {sortedInquiries.length > 0 && (
        <div className="m-1">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Showing {sortedInquiries.length} inquiries
          </div>
        </div>
      )}

      {/* Inquiries Table */}
      <div className="card">
        <div className="p-0">
          
          <div className="overflow-x-auto rounded-xl">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Course
                  </th>
                  <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Lead Stage
                  </th>
                  {user?.role === 'sales' && (
                    <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Attended By
                    </th>
                  )}
                  {user?.role === 'sales' && (
                    <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Created By
                    </th>
                  )}
                  {user?.role === 'sales' && (
                    <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Created At
                    </th>
                  )}
                  {user?.role === 'admin' && (
                    <>
                      <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Assigned To
                      </th>
                      <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Created By
                      </th>
                      <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Created At
                      </th>
                      <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        <span className="inline-flex items-center gap-1">
                          Forwarded At
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setForwardedAtSort(s => s === 'asc' ? 'desc' : 'asc'); setCurrentPage(1); }}
                            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            title={`Sort ${forwardedAtSort === 'asc' ? 'descending' : 'ascending'}`}
                          >
                            <ArrowUpDown className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </th>
                    </>
                  )}
                  {user?.role === 'presales' && (
                    <>
                      <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Created By
                      </th>
                      <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Created At
                      </th>
                    </>
                  )}
                  {user?.role === 'sales' && (
                    <th className="px-3 py-1 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <span className="inline-flex items-center gap-1">
                        Forwarded At
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setForwardedAtSort(s => s === 'asc' ? 'desc' : 'asc'); setCurrentPage(1); }}
                          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          title={`Sort ${forwardedAtSort === 'asc' ? 'descending' : 'ascending'}`}
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    </th>
                  )}
{/* Action column removed */}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {paginatedInquiries.map((inquiry: Inquiry, index: number) => (
                  <motion.tr
                    key={inquiry._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    onClick={() => handleViewInquiry(inquiry._id)}
                    className={cn(getRowBg(inquiry), 'hover:brightness-95 transition-[filter] duration-150 cursor-pointer')}
                  >
                    <td className="px-3 py-1 whitespace-nowrap">
                      <div>
                        <div className="text-xs font-medium text-secondary-900 dark:text-white">
                          {inquiry.name || '-'}
                        </div>
                        {user?.role === 'admin' && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {inquiry.email || '-'}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1 whitespace-nowrap">
                      <div className="text-xs text-secondary-900 dark:text-white">
                        {inquiry.phone}
                      </div>
                    </td>
                    <td className="px-3 py-1 whitespace-nowrap">
                      <div className="text-xs text-secondary-900 dark:text-white">
                        {inquiry.course}
                      </div>
                    </td>
                    <td className="px-3 py-1 whitespace-nowrap">
                      <div className="text-xs text-secondary-900 dark:text-white">
                        {inquiry.preferredLocation}
                      </div>
                    </td>
                    <td className="px-3 py-1 whitespace-nowrap">
                      {(() => {
                        const leadStageData = getLatestLeadStage(inquiry);
                        if (leadStageData) {
                          return (
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={cn(
                                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium w-fit',
                                  getLeadStageBadgeClasses(leadStageData.leadStage, leadStagesConfig)
                                )}
                              >
                                {leadStageData.leadStage}
                              </span>
                              {leadStageData.subStage && (
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                  {leadStageData.subStage}
                                </span>
                              )}
                            </div>
                          );
                        }
                        // Show inquiry status (from presales) when no lead stage follow-up exists
                        return (
                          <span
                            className={cn(
                              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                              getStatusColor(inquiry.status as InquiryStatus)
                            )}
                          >
                            {getStatusLabel(inquiry.status as InquiryStatus)}
                          </span>
                        );
                      })()}
                    </td>
                    {user?.role === 'sales' && (
                      <td className="px-3 py-1 whitespace-nowrap">
                        <div className="text-xs text-secondary-900 dark:text-white">
                          {inquiry.assignedTo?.name || 'Unattended'}
                        </div>
                      </td>
                    )}
                    {user?.role === 'sales' && (
                      <td className="px-3 py-1 whitespace-nowrap">
                        <div className="text-xs text-secondary-900 dark:text-white">
                          {inquiry.createdBy?.name || 'Unknown'}
                        </div>
                      </td>
                    )}
                    {user?.role === 'sales' && (
                      <td className="px-3 py-1 whitespace-nowrap">
                        <div className="text-xs text-secondary-900 dark:text-white">
                          {inquiry.createdAt ? new Date(inquiry.createdAt).toLocaleDateString() : '-'}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                          {inquiry.createdAt ? new Date(inquiry.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : ''}
                        </div>
                      </td>
                    )}
                    {user?.role === 'admin' && (
                      <>
                        <td className="px-3 py-1 whitespace-nowrap">
                          <div className="text-xs text-secondary-900 dark:text-white">
                            {inquiry.assignedTo?.name || 'Unassigned'}
                          </div>
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap">
                          <div className="text-xs text-secondary-900 dark:text-white">
                            {inquiry.createdBy?.name || 'Unknown'}
                          </div>
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap">
                          <div className="text-xs text-secondary-900 dark:text-white">
                            {new Date(inquiry.createdAt).toLocaleDateString()}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">
                            {new Date(inquiry.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
                          </div>
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap">
                          {inquiry.forwardedBy ? (
                            <>
                              <div className="text-xs text-secondary-900 dark:text-white">
                                {new Date(inquiry.forwardedAt || inquiry.updatedAt).toLocaleDateString()}
                              </div>
                              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                {new Date(inquiry.forwardedAt || inquiry.updatedAt).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                }).toLowerCase()}
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-gray-400 dark:text-gray-500 italic">-</div>
                          )}
                        </td>
                      </>
                    )}
                    {user?.role === 'presales' && (
                      <>
                        <td className="px-3 py-1 whitespace-nowrap">
                          <div className="text-xs text-secondary-900 dark:text-white">
                            {inquiry.createdBy?.name || 'Unknown'}
                          </div>
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap">
                          <div className="text-xs text-secondary-900 dark:text-white">
                            {new Date(inquiry.createdAt).toLocaleDateString()}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">
                            {new Date(inquiry.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
                          </div>
                        </td>
                      </>
                    )}
                    {user?.role === 'sales' && (
                      <td className="px-3 py-1 whitespace-nowrap">
                        {inquiry.forwardedBy ? (
                          <>
                            <div className="text-xs text-secondary-900 dark:text-white">
                              {new Date(inquiry.forwardedAt || inquiry.updatedAt).toLocaleDateString()}
                            </div>
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">
                              {new Date(inquiry.forwardedAt || inquiry.updatedAt).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              }).toLowerCase()}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-gray-400 dark:text-gray-500 italic">-</div>
                        )}
                      </td>
                    )}
{/* Action cell removed */}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>


          {/* Empty State */}
          {sortedInquiries.length === 0 && (
            <div className="text-center py-8">
              <div className="text-gray-400 dark:text-gray-500">
                <FileText className="mx-auto h-10 w-10" />
              </div>
              <h3 className="mt-1.5 text-sm font-medium text-secondary-900 dark:text-white">
                No inquiries found for {decodedLocation}
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                There are no inquiries for this center location.
              </p>
            </div>
          )}

          {/* Pagination */}
          {sortedInquiries.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sortedInquiries.length}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          )}
        </div>

      </div>
    </div>
  );
};

export default CenterInquiries;