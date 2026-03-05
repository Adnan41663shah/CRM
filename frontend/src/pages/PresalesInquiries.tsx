import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Download, X, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import { Inquiry, InquiryFilters, InquiryStatus, User } from '@/types';
import { getStatusColor, getStatusLabel, ITEMS_PER_PAGE } from '@/utils/constants';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import Pagination from '@/components/Pagination';
import { convertInquiriesToCSV, downloadCSV } from '@/utils/exportCSV';
import { useAuth } from '@/contexts/AuthContext';
import { parseInquiryFiltersFromParams, inquiryFiltersToParams, paramsToSearchString } from '@/utils/listingUrlParams';

const defaultFilters: InquiryFilters = {
  search: '',
  sort: 'updatedAt',
  order: 'desc',
  status: undefined,
  course: undefined,
  location: undefined,
  medium: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  createdBy: undefined,
};

const PresalesInquiries: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const parsed = useMemo(() => parseInquiryFiltersFromParams(searchParams), [searchParams]);
  const [filters, setFilters] = useState<InquiryFilters>(() => ({ ...defaultFilters, ...parsed, page: undefined }));
  const [currentPage, setCurrentPage] = useState(() => parsed.page ?? 1);

  useEffect(() => {
    const p = parseInquiryFiltersFromParams(searchParams);
    setFilters(prev => ({ ...prev, ...p, page: undefined }));
    setCurrentPage(p.page ?? 1);
  }, [searchParams]);

  useEffect(() => {
    const params = inquiryFiltersToParams(filters, currentPage);
    const next = paramsToSearchString(params);
    const current = searchParams.toString();
    if (next !== (current ? `?${current}` : '')) {
      setSearchParams(next.startsWith('?') ? next.slice(1) : next, { replace: true });
    }
  }, [filters, currentPage]);

  const [isExporting, setIsExporting] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Fetch presales users using React Query for automatic deduplication
  // Uses same query key as Inquiries.tsx so they share cache
  const { data: presalesUsersData } = useQuery(
    ['users', 'presales', { isActive: true, limit: 100 }],
    () => apiService.users.getAll({ role: 'presales', isActive: true, limit: 100 }),
    {
      enabled: !!user?.role,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    }
  );
  const presalesUsers = presalesUsersData?.data?.users || [];

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

  const { data, isLoading } = useQuery(
    ['presales-inquiries', filters],
    () => apiService.inquiries.getAll({ ...filters, department: 'presales' } as any),
    {
      keepPreviousData: true,
      staleTime: 90 * 1000, // 90s – socket invalidates on inquiry updates
      refetchOnWindowFocus: false,
      retry: false,
    }
  );

  // Dynamic options (courses, locations, statuses)
  const { data: optionsData } = useQuery('options', () => apiService.options.get(), { staleTime: 5 * 60 * 1000 });
  const optCourses: string[] = optionsData?.data?.courses || ['CDEC', 'X-DSAAI', 'DevOps', 'Full-Stack', 'Any'];
  const optLocations: string[] = optionsData?.data?.locations || ['Nagpur', 'Pune', 'Nashik', 'Indore'];
  const optStatuses: string[] = optionsData?.data?.statuses || ['hot', 'warm', 'cold'];


  const rawInquiries = data?.data?.inquiries || [];

  // Presales Inquiries page shows only inquiries NOT yet forwarded to sales (department stays presales)
  const allInquiries = rawInquiries.filter((inq: Inquiry) => inq.department === 'presales');
  
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
  
  // Filter: exclude admitted students completely - they go to Admitted Students page
  const inquiries = allInquiries.filter((inq: Inquiry) => !isAdmitted(inq));

  // Client-side pagination
  const totalPages = Math.ceil(inquiries.length / ITEMS_PER_PAGE);
  const paginatedInquiries = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return inquiries.slice(startIndex, endIndex);
  }, [inquiries, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterChange = (key: keyof InquiryFilters, value: any) => {
    setCurrentPage(1);
    setFilters(prev => ({ ...prev, [key]: value }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearFilter = (key: keyof InquiryFilters) => {
    setCurrentPage(1);
    setFilters(prev => ({ ...prev, [key]: undefined }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearAllFilters = () => {
    setCurrentPage(1);
    setFilters(prev => ({
      ...prev,
      status: undefined,
      course: undefined,
      location: undefined,
      medium: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      createdBy: undefined,
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.status) count++;
    if (filters.course) count++;
    if (filters.location) count++;
    if (filters.medium) count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.createdBy) count++;
    return count;
  };


  const getRowBg = (_inq: Inquiry) => {
    return 'bg-white dark:bg-secondary-900 hover:bg-gray-100 dark:hover:bg-secondary-200 transition-colors';
  };

  const handleViewInquiry = (inquiryId: string) => {
    navigate(`/inquiries/${inquiryId}`);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Build export filters
      const exportFilters: InquiryFilters = {
        ...filters,
      };
      
      // Fetch all inquiries matching the filters
      const response = await apiService.inquiries.getAll({ ...exportFilters, department: 'presales' } as any);
      
      const rawExport = response?.data?.inquiries || [];
      const allInquiries = rawExport.filter((inq: Inquiry) => inq.department === 'presales');
      
      if (allInquiries.length === 0) {
        alert('No inquiries found to export with the current filters.');
        setIsExporting(false);
        return;
      }
      
      // Convert to CSV
      const csvContent = convertInquiriesToCSV(allInquiries);
      
      // Generate filename with filters
      const dateStr = filters.dateFrom || filters.dateTo
        ? `_${(filters.dateFrom || 'start').replace(/-/g, '')}_to_${(filters.dateTo || 'end').replace(/-/g, '')}`
        : '';
      const statusStr = filters.status ? `_${filters.status}` : '';
      const locationStr = filters.location ? `_${filters.location.replace(/\s+/g, '_')}` : '';
      const courseStr = filters.course ? `_${filters.course.replace(/\s+/g, '_')}` : '';
      const filename = `Presales_Inquiries${dateStr}${statusStr}${locationStr}${courseStr}_${new Date().toISOString().split('T')[0]}.csv`;
      
      // Download CSV
      downloadCSV(csvContent, filename);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export inquiries. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64 sm:min-h-80">
        <LoadingSpinner size="lg" label="Loading presales inquiries..." />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
            Presales Inquiries
          </h1>
          
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="btn btn-primary btn-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="">
        <div className="card-content">
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

            {/* Location Filter */}
            <div className="flex-1 min-w-[120px] sm:min-w-[140px]">
              <select
                value={filters.location || ''}
                onChange={(e) => handleFilterChange('location', e.target.value || undefined)}
                className="input h-9 text-xs w-full py-1"
              >
                <option value="">All Locations</option>
                {optLocations.map(l => (
                  <option key={l} value={l}>{l}</option>
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

            {/* Created By Filter (presales users only) */}
            <div className="flex-1 min-w-[160px] sm:min-w-[180px]">
              <select
                value={filters.createdBy || ''}
                onChange={(e) => handleFilterChange('createdBy', e.target.value || undefined)}
                className="input h-9 text-xs w-full py-1"
              >
                <option value="">Created by (All Presales)</option>
                {presalesUsers.map((u: User & { _id?: string }) => (
                  <option key={u._id || u.id} value={u._id || u.id}>
                    {u.name} (presales)
                  </option>
                ))}
              </select>
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
              {filters.location && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                  Location: {filters.location}
                  <button onClick={() => clearFilter('location')} className="hover:text-primary-900 dark:hover:text-primary-100">
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
              {filters.createdBy && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                  Created by: {presalesUsers.find((u: User & { _id?: string }) => (u._id || u.id) === filters.createdBy)?.name || 'Unknown'}
                  <button onClick={() => clearFilter('createdBy')} className="hover:text-primary-900 dark:hover:text-primary-100">
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
      </div>

      {/* Results Count - Top Left */}
          {inquiries.length > 0 && (
            <div className="p-0 m-0">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Showing {inquiries.length} result{inquiries.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}

      {/* Inquiries Table */}
      <div className="card">
        <div className="p-2">
          
          <div className="overflow-x-auto rounded-xl">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Course
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Created By
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
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
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div>
                        <div className="text-xs font-medium text-secondary-900 dark:text-white">
                          {inquiry.name || '-'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {inquiry.email || '-'}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="text-xs text-secondary-900 dark:text-white">
                        {inquiry.phone}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="text-xs text-secondary-900 dark:text-white">
                        {inquiry.course || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="text-xs text-secondary-900 dark:text-white">
                        {inquiry.preferredLocation || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                          getStatusColor(inquiry.status as InquiryStatus)
                        )}
                      >
                        {getStatusLabel(inquiry.status as InquiryStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="text-xs text-secondary-900 dark:text-white">
                        {inquiry.assignedTo?.name || 'Unassigned'}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="text-xs text-secondary-900 dark:text-white">
                        {inquiry.createdBy?.name || 'Unknown'}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="text-xs text-secondary-900 dark:text-white">
                        {new Date(inquiry.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400">
                        {new Date(inquiry.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
                      </div>
                    </td>
{/* Action cell removed */}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>


          {/* Empty State */}
          {inquiries.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 dark:text-gray-500">
                <FileText className="mx-auto h-12 w-12" />
              </div>
              <h3 className="mt-2 text-sm font-medium text-secondary-900 dark:text-white">
                No inquiries found
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No presales inquiries found.
              </p>
            </div>
          )}

          {/* Pagination */}
          {inquiries.length > 0 && (
            <div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700">
              <div className="flex items-center justify-between">
              
                {totalPages > 1 && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={inquiries.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={handlePageChange}
                  />
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default PresalesInquiries;

