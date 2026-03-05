import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Filter, X, ChevronDown, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import { Inquiry, InquiryFilters } from '@/types';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import { convertInquiriesToCSV, downloadCSV } from '@/utils/exportCSV';
import { ITEMS_PER_PAGE } from '@/utils/constants';
import Pagination from '@/components/Pagination';
import { parseInquiryFiltersFromParams, inquiryFiltersToParams, paramsToSearchString } from '@/utils/listingUrlParams';

const defaultFilters: InquiryFilters = {
  search: '',
  sort: 'createdAt',
  order: 'desc',
  status: undefined,
  course: undefined,
  location: undefined,
  medium: undefined,
};

const AdminMyRaisedInquiries: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

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

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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

  const { data, isLoading } = useQuery(
    ['admin-my-inquiries', filters],
    () => apiService.inquiries.getAll({ ...filters, createdBy: 'me' }),
    {
      keepPreviousData: true,
    }
  );

  const { data: optionsData } = useQuery('options', () => apiService.options.get(), { staleTime: 5 * 60 * 1000 });
  const optCourses: string[] = optionsData?.data?.courses || ['CDEC', 'X-DSAAI', 'DevOps', 'Full-Stack', 'Any'];
  const optLocations: string[] = optionsData?.data?.locations || ['Nagpur', 'Pune', 'Nashik', 'Indore'];

  const inquiries = data?.data?.inquiries || [];

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
    return count;
  };


  const handleViewInquiry = (inquiryId: string) => {
    navigate(`/inquiries/${inquiryId}`);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Get all my inquiries with current filters
      const response = await apiService.inquiries.getAll({ 
        ...filters, 
        createdBy: 'me', 
        // Removed limit - pagination removed, all records returned 
      });
      
      const dataToExport = response.data?.inquiries || [];
      if (dataToExport.length === 0) {
        return;
      }

      const csv = convertInquiriesToCSV(dataToExport);
      downloadCSV(csv, `my-raised-inquiries-admin-${new Date().toISOString().split('T')[0]}.csv`);
    } catch (error) {
       console.error('Export error', error);
    } finally {
       setIsExporting(false);
    }
  };

  const getRowBg = (_inq: Inquiry) => {
    return 'bg-white dark:bg-secondary-900 hover:bg-gray-100 dark:hover:bg-secondary-200 transition-colors';
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[16rem] sm:min-h-[20rem]">
        <LoadingSpinner size="lg" label="Loading inquiries..." />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
          My Raised Inquiries
        </h1>
        <div className="flex items-center gap-2">
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

                  {/* Date Range Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Date Range
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={filters.dateFrom ? new Date(filters.dateFrom).toISOString().split('T')[0] : ''}
                        onChange={(e) => handleFilterChange('dateFrom', e.target.value ? new Date(e.target.value) : undefined)}
                        className="input text-sm px-2 py-1"
                        placeholder="From"
                      />
                      <input
                        type="date"
                        value={filters.dateTo ? new Date(filters.dateTo).toISOString().split('T')[0] : ''}
                        onChange={(e) => handleFilterChange('dateTo', e.target.value ? new Date(e.target.value) : undefined)}
                        className="input text-sm px-2 py-1"
                        placeholder="To"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting || inquiries.length === 0}
            className="btn btn-primary btn-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <div>


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
              {(filters.dateFrom || filters.dateTo) && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                  Date: {filters.dateFrom ? new Date(filters.dateFrom).toLocaleDateString() : 'Start'} - {filters.dateTo ? new Date(filters.dateTo).toLocaleDateString() : 'End'}
                  <button onClick={() => { clearFilter('dateFrom'); clearFilter('dateTo'); }} className="hover:text-primary-900 dark:hover:text-primary-100">
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
                Showing {inquiries.length} results
              </div>
            </div>
          )}
      {/* Inquiries Table */}
      <div className="card">
        <div className="">
          
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
                    Department
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
                    className={cn(getRowBg(inquiry as any), 'hover:brightness-95 transition-[filter] duration-150 cursor-pointer')}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="shrink-0 h-7 w-7">
                          <div className="h-7 w-7 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                              {inquiry.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-2">
                          <div className="text-xs font-medium text-secondary-900 dark:text-white">
                            {inquiry.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {inquiry.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="text-sm text-secondary-900 dark:text-white">
                        {inquiry.phone}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-secondary-900 dark:text-white">
                      {inquiry.course}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-secondary-900 dark:text-white">
                      {inquiry.preferredLocation}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        inquiry.department === 'sales' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                        'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                      )}>
                        {inquiry.department === 'sales' ? 'Sales' : 'Presales'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="text-sm text-secondary-900 dark:text-white">
                        {new Date(inquiry.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(inquiry.createdAt).toLocaleTimeString()}
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
                No raised inquiries found
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                You haven't created any inquiries yet.
              </p>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                Use the "New Inquiry" button in the top navigation to create your first inquiry.
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {inquiries.length > 0 && (
          <div className="flex items-center justify-between mt-2 p-2 border-t border-gray-200 dark:border-gray-700">
            
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={inquiries.length}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>

    </div>
  );
};

export default AdminMyRaisedInquiries;

