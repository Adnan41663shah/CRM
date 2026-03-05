import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Download, TrendingUp, Filter, ChevronDown, X } from 'lucide-react';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import { Inquiry, InquiryFilters } from '@/types';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import { downloadCSV } from '@/utils/exportCSV';
import { useAuth } from '@/contexts/AuthContext';
import { ITEMS_PER_PAGE } from '@/utils/constants';
import Pagination from '@/components/Pagination';
import { parseInquiryFiltersFromParams, inquiryFiltersToParams, paramsToSearchString } from '@/utils/listingUrlParams';

// Helper function to check if an inquiry is a valid conversion
const isConversion = (inquiry: Inquiry): boolean => {
  if (!inquiry.followUps || inquiry.followUps.length === 0) {
    return false;
  }
  
  // Get the latest follow-up (most recent by createdAt)
  const latestFollowUp = [...inquiry.followUps].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  
  // Check strict condition: leadStage === "Hot" AND subStage === "Conversion"
  return latestFollowUp.leadStage === 'Hot' && latestFollowUp.subStage === 'Conversion';
};

const defaultFilters: InquiryFilters = {
  search: '',
  sort: 'updatedAt',
  order: 'desc',
  course: undefined,
  location: undefined,
  dateFrom: undefined,
  dateTo: undefined,
};

const Conversions: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const parsed = useMemo(() => parseInquiryFiltersFromParams(searchParams), [searchParams]);
  const [filters, setFilters] = useState<InquiryFilters>(() => ({ ...defaultFilters, ...parsed, page: undefined }));
  const [currentPage, setCurrentPage] = useState(() => parsed.page ?? 1);

  const [viewMode, setViewMode] = useState<'my' | 'all'>(() =>
    searchParams.get('tab') === 'all' ? 'all' : 'my'
  );

  useEffect(() => {
    const p = parseInquiryFiltersFromParams(searchParams);
    setFilters(prev => ({ ...prev, ...p, page: undefined }));
    setCurrentPage(p.page ?? 1);
    const tab = searchParams.get('tab');
    if (tab === 'all' || tab === 'my') setViewMode(tab);
  }, [searchParams]);

  useEffect(() => {
    const params = inquiryFiltersToParams(filters, currentPage, { tab: viewMode });
    const next = paramsToSearchString(params);
    const current = searchParams.toString();
    if (next !== (current ? `?${current}` : '')) {
      setSearchParams(next.startsWith('?') ? next.slice(1) : next, { replace: true });
    }
  }, [filters, currentPage, viewMode]);

  const [isExporting, setIsExporting] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

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

  // Helper to get raw conversion date for filtering
  const getConversionDateRaw = (inquiry: Inquiry): Date | null => {
    if (!inquiry.followUps || inquiry.followUps.length === 0) return null;
    const convFollowUp = [...inquiry.followUps]
      .filter(fu => fu.leadStage === 'Hot' && fu.subStage === 'Conversion')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    return convFollowUp ? new Date(convFollowUp.createdAt) : null;
  };

  const { data, isLoading } = useQuery(
    ['conversions', filters],
    () => apiService.inquiries.getAll({ ...filters, dateField: 'followUps.createdAt' }),
    {
      keepPreviousData: true,
      staleTime: 90 * 1000, // 90s – socket invalidates on inquiry updates
      refetchOnWindowFocus: false,
    }
  );

  const allInquiries = data?.data?.inquiries || [];

  // Filter inquiries to only show conversions
  // Filtering is done client-side based on the strict logic
  const convertedInquiries = useMemo(() => {
    return allInquiries.filter((inquiry: Inquiry) => isConversion(inquiry));
  }, [allInquiries]);

  // Get conversion date (date when the follow-up meeting criteria was created)
  const getConversionDate = (inquiry: Inquiry): string => {
    const rawDate = getConversionDateRaw(inquiry);
    if (!rawDate) return '-';
    
    return rawDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get counselor name (assignedTo or createdBy)
  const getCounselorName = (inquiry: Inquiry): string => {
    if (inquiry.assignedTo) {
      return inquiry.assignedTo.name;
    }
    if (inquiry.createdBy) {
      return inquiry.createdBy.name;
    }
    return '-';
  };

  const handleViewInquiry = (inquiryId: string) => {
    navigate(`/inquiries/${inquiryId}`);
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
      course: undefined,
      location: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.course) count++;
    if (filters.location) count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    return count;
  };

  const handleExport = async () => {
    if (finalFilteredInquiries.length === 0) {
      return;
    }

    setIsExporting(true);
    try {
      // Create CSV data with relevant columns for Conversions
      const csvData = finalFilteredInquiries.map((inquiry: Inquiry) => ({
        Name: inquiry.name,
        Phone: inquiry.phone,
        Email: inquiry.email || '-',
        Course: inquiry.course,
        Location: inquiry.preferredLocation,
        'Conversion Date': getConversionDate(inquiry),
        Counselor: getCounselorName(inquiry),
        Department: inquiry.department || '-',
      }));
      
      // Simple CSV string builder since we don't have a specific helper for this new page
      const headers = Object.keys(csvData[0]).join(',');
      const rows = csvData.map((row: any) => Object.values(row).map(v => `"${v}"`).join(',')).join('\n');
      const csv = `${headers}\n${rows}`;

      downloadCSV(csv, `conversions-${new Date().toISOString().split('T')[0]}.csv`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export conversions. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Filter based on view mode (My vs All)
  const viewModeInquiries = useMemo(() => {
    if (viewMode === 'all') return convertedInquiries;
    return convertedInquiries.filter((inquiry: Inquiry) => 
      inquiry.assignedTo?.id === user?.id || (inquiry.assignedTo as any)?._id === user?.id
    );
  }, [convertedInquiries, viewMode, user]);

  // Apply search filter
  const filteredInquiries = useMemo(() => {
    if (!filters.search) {
      return viewModeInquiries;
    }
    
    const searchLower = filters.search.toLowerCase();
    return viewModeInquiries.filter((inquiry: Inquiry) => {
      return (
        inquiry.name?.toLowerCase().includes(searchLower) ||
        inquiry.email?.toLowerCase().includes(searchLower) ||
        inquiry.phone.toLowerCase().includes(searchLower) ||
        inquiry.course.toLowerCase().includes(searchLower) ||
        inquiry.preferredLocation.toLowerCase().includes(searchLower) ||
        getCounselorName(inquiry).toLowerCase().includes(searchLower)
      );
    });
  }, [viewModeInquiries, filters.search]);

  // Apply course, location, and date filters
  const finalFilteredInquiries = useMemo(() => {
    let filtered = filteredInquiries;
    
    if (filters.course) {
      filtered = filtered.filter((inquiry: Inquiry) => inquiry.course === filters.course);
    }
    
    if (filters.location) {
      filtered = filtered.filter((inquiry: Inquiry) => inquiry.preferredLocation === filters.location);
    }
    
    // Apply date filters based on CONVERSION DATE (not inquiry creation date)
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((inquiry: Inquiry) => {
        const convDate = getConversionDateRaw(inquiry);
        if (!convDate) return false;
        convDate.setHours(0, 0, 0, 0);
        return convDate >= fromDate;
      });
    }
    
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((inquiry: Inquiry) => {
        const convDate = getConversionDateRaw(inquiry);
        if (!convDate) return false;
        convDate.setHours(0, 0, 0, 0);
        return convDate <= toDate;
      });
    }
    
    return filtered;
  }, [filteredInquiries, filters.course, filters.location, filters.dateFrom, filters.dateTo]);

  // Client-side pagination
  const totalPages = Math.ceil(finalFilteredInquiries.length / ITEMS_PER_PAGE);
  const paginatedInquiries = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return finalFilteredInquiries.slice(startIndex, endIndex);
  }, [finalFilteredInquiries, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Dynamic options
  const { data: optionsData } = useQuery('options', () => apiService.options.get(), { staleTime: 5 * 60 * 1000 });
  const optCourses: string[] = optionsData?.data?.courses || ['CDEC', 'X-DSAAI', 'DevOps', 'Full-Stack', 'Any'];
  const optLocations: string[] = optionsData?.data?.locations || ['Nagpur', 'Pune', 'Nashik', 'Indore'];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
            Conversions
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="bg-gray-100 p-1 rounded-lg flex items-center dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setViewMode('my')}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                viewMode === 'my'
                  ? "bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              My Conversions
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                viewMode === 'all'
                  ? "bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              All Conversions
            </button>
          </div>

          {user?.role === 'admin' && (
            <button
              onClick={handleExport}
              disabled={isExporting || finalFilteredInquiries.length === 0}
              className="btn btn-primary btn-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="">
        <div className="card-content">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search Bar */}
            <div className="flex-1">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search by name, email, or phone..."
                  value={filters.search || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFilterChange('search', e.target.value)}
                  className="input pl-10! w-full"
                />
              </div>
            </div>

            {/* Filter Button */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={cn(
                  "btn btn-outline flex items-center gap-2 px-4 py-2",
                  getActiveFilterCount() > 0 && "bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700"
                )}
              >
                <Filter className="h-4 w-4" />
                <span>Filters</span>
                {getActiveFilterCount() > 0 && (
                  <span className="bg-primary-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    {getActiveFilterCount()}
                  </span>
                )}
                <ChevronDown className={cn("h-4 w-4 transition-transform", isFilterOpen && "transform rotate-180")} />
              </button>

              {/* Filter Dropdown */}
              {isFilterOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-secondary-200 dark:border-secondary-700 z-50 p-4">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-secondary-200 dark:border-secondary-700">
                      <h3 className="text-sm font-semibold text-secondary-900 dark:text-white">Filters</h3>
                      {getActiveFilterCount() > 0 && (
                        <button
                          onClick={clearAllFilters}
                          className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
                        >
                          Clear All
                        </button>
                      )}
                    </div>

                    {/* Course Filter */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Course
                      </label>
                      <select
                        value={filters.course || ''}
                        onChange={(e) => handleFilterChange('course', e.target.value || undefined)}
                        className="input text-sm"
                      >
                        <option value="">All Courses</option>
                        {optCourses.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Location Filter */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Location
                      </label>
                      <select
                        value={filters.location || ''}
                        onChange={(e) => handleFilterChange('location', e.target.value || undefined)}
                        className="input text-sm"
                      >
                        <option value="">All Locations</option>
                        {optLocations.map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>

                    {/* Date From Filter */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Date From
                      </label>
                      <input
                        type="date"
                        value={filters.dateFrom || ''}
                        onChange={(e) => handleFilterChange('dateFrom', e.target.value || undefined)}
                        className="input text-sm w-full"
                        min="2000-01-01"
                        max={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    {/* Date To Filter */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Date To
                      </label>
                      <input
                        type="date"
                        value={filters.dateTo || ''}
                        onChange={(e) => handleFilterChange('dateTo', e.target.value || undefined)}
                        className="input text-sm w-full"
                        min={filters.dateFrom || "2000-01-01"}
                        max={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>
                </div>
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

      {/* Results Count */}
      {!isLoading && finalFilteredInquiries.length > 0 && (
        <div className="text-sm text-gray-700 dark:text-gray-300 my-1">
          Showing {finalFilteredInquiries.length} conversion{finalFilteredInquiries.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-64 sm:min-h-80">
          <LoadingSpinner size="lg" label="Loading conversions..." />
        </div>
      ) : finalFilteredInquiries.length === 0 ? (
        <div className="card">
          <div className="card-content text-center py-12">
            <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-secondary-900 dark:text-white">
              No conversions found
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {filters.search || filters.course || filters.location
                ? 'Try adjusting your filters'
                : 'Inquiries marked as "Hot" and "Conversion" will appear here'}
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div>
            <div className="overflow-x-auto rounded-xl">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Mobile
                    </th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Course
                    </th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Center
                    </th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Counselor
                    </th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Conversion Date
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
                      className="hover:bg-gray-100/70 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      <td className="px-3 py-1 whitespace-nowrap">
                        <div className="text-xs font-medium text-secondary-900 dark:text-white">
                          {inquiry.name}
                        </div>
                        {inquiry.email && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {inquiry.email}
                          </div>
                        )}
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
                        <div className="text-xs text-secondary-900 dark:text-white">
                          {getCounselorName(inquiry)}
                        </div>
                      </td>
                      <td className="px-3 py-1 whitespace-nowrap">
                        <div className="text-xs text-secondary-900 dark:text-white">
                          {getConversionDate(inquiry)}
                        </div>
                      </td>
{/* Action cell removed */}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {finalFilteredInquiries.length > 0 && (
              <div className="flex items-center justify-between mt-2 p-2 border-t border-gray-200 dark:border-gray-700">
                
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={finalFilteredInquiries.length}
                  itemsPerPage={ITEMS_PER_PAGE}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Conversions;
