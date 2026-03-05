import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQuery as useRQ } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Filter, X, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import { Inquiry, InquiryFilters, InquiryStatus, CourseType, LocationType } from '@/types';
import { getStatusColor, getStatusLabel, ITEMS_PER_PAGE } from '@/utils/constants';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useAuth } from '@/contexts/AuthContext';
import { convertInquiriesToCSVForSalesMyAttended, downloadCSV } from '@/utils/exportCSV';
import { getLeadStageBadgeClasses, LeadStageConfig } from '@/utils/leadStageColors';
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
  dateFrom: undefined,
  dateTo: undefined,
};

const SalesAssigned: React.FC = () => {
  const { user } = useAuth();
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

  const { data, isLoading } = useQuery(
    ['sales-assigned', filters],
    () => apiService.inquiries.getAll({ ...filters, assignedTo: user?.id, department: 'sales', dateField: 'forwardedAt' }),
    { keepPreviousData: true, enabled: !!user?.id }
  );

  const { data: optionsData } = useRQ('options', () => apiService.options.get(), { staleTime: 5 * 60 * 1000 });
  const optCourses: string[] = optionsData?.data?.courses || ['CDEC', 'X-DSAAI', 'DevOps', 'Full-Stack', 'Any'];
  const optLocations: string[] = optionsData?.data?.locations || ['Nagpur', 'Pune', 'Nashik', 'Indore'];
  
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
  
  
  // Filter inquiries based on admissions view
  const inquiries = allInquiries;


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
    setFilters(prev => {
      const next = { ...prev, [key]: undefined };
      if (key === 'dateFrom' || key === 'dateTo') {
         next.dateRange = undefined;
      }
      if (key === 'dateRange') {
         next.dateFrom = undefined;
         next.dateTo = undefined;
      }
      return next;
    });
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
      dateRange: undefined,
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.status) count++;
    if (filters.course) count++;
    if (filters.location) count++;

    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.dateRange === 'today') count++;
    return count;
  };

  const getRowBg = (_inq: Inquiry) => {
    return 'bg-white dark:bg-secondary-900 hover:bg-gray-100 dark:hover:bg-secondary-200 transition-colors';
  };

  const handleViewInquiry = (inquiryId: string) => {
    navigate(`/inquiries/${inquiryId}`);
  };

  const handleExport = async () => {
    if (!user?.id) return;
    
    setIsExporting(true);
    try {
      // Build export filters
      const exportFilters: InquiryFilters = {
        ...filters,
      };
      
      // Fetch all inquiries matching the filters
      const response = await apiService.inquiries.getAll({
        ...exportFilters,
        assignedTo: user.id,
        department: 'sales',
        dateField: 'forwardedAt'
      });
      
      const allInquiries = response?.data?.inquiries || [];
      
      if (allInquiries.length === 0) {
        alert('No inquiries found to export with the current filters.');
        setIsExporting(false);
        return;
      }
      
      // Convert to CSV using Sales My Attended columns
      const csvContent = convertInquiriesToCSVForSalesMyAttended(allInquiries);
      
      // Generate filename with date range if available
      const dateStr = filters.dateFrom || filters.dateTo
        ? `_${(filters.dateFrom || 'start').replace(/-/g, '')}_to_${(filters.dateTo || 'end').replace(/-/g, '')}`
        : '';
      const statusStr = filters.status ? `_${filters.status}` : '';
      const locationStr = filters.location ? `_${filters.location.replace(/\s+/g, '_')}` : '';
      const courseStr = filters.course ? `_${filters.course.replace(/\s+/g, '_')}` : '';
      const filename = `My_Attended_Inquiries_Sales${dateStr}${statusStr}${locationStr}${courseStr}_${new Date().toISOString().split('T')[0]}.csv`;
      
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
      <div className="flex items-center justify-center min-h-[16rem] sm:min-h-[20rem]">
        <LoadingSpinner size="lg" label="Loading inquiries..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
            My Attended Inquiries
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter Button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={cn(
                "btn btn-outline flex items-center gap-2 px-3 sm:px-4 py-2 text-sm",
                getActiveFilterCount() > 0 && "bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700"
              )}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
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

                  {/* Date Preset Filter */}
                  <div>
                    <button
                      onClick={() => {
                        handleFilterChange('dateRange', filters.dateRange === 'today' ? undefined : 'today');
                        handleFilterChange('dateFrom', undefined);
                        handleFilterChange('dateTo', undefined);
                      }}
                      className={cn(
                        "w-full btn btn-sm mb-2",
                        filters.dateRange === 'today' ? "btn-primary" : "btn-outline"
                      )}
                    >
                      Today's Attended
                    </button>
                  </div>

                  {/* Location Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Location
                    </label>
                    <select
                      className="input text-sm"
                      value={filters.location || ''}
                      onChange={(e) => handleFilterChange('location', (e.target.value || undefined) as LocationType | undefined)}
                    >
                      <option value="">All</option>
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
                      className="input text-sm"
                      value={filters.course || ''}
                      onChange={(e) => handleFilterChange('course', (e.target.value || undefined) as CourseType | undefined)}
                    >
                      <option value="">All</option>
                      {optCourses.map(c => (
                        <option key={c} value={c}>{c}</option>
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
                      className="input text-sm"
                      value={filters.dateFrom || ''}
                      onChange={(e) => {
                        handleFilterChange('dateFrom', e.target.value || undefined);
                        handleFilterChange('dateRange', undefined);
                      }}
                    />
                  </div>

                  {/* Date To Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Date To
                    </label>
                    <input
                      type="date"
                      className="input text-sm"
                      value={filters.dateTo || ''}
                      onChange={(e) => {
                        handleFilterChange('dateTo', e.target.value || undefined);
                        handleFilterChange('dateRange', undefined);
                      }}
                      min={filters.dateFrom || undefined}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="btn btn-primary btn-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-3 sm:px-4 py-2 text-sm"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export CSV'}</span>
            <span className="sm:hidden">{isExporting ? '...' : 'Export'}</span>
          </button>
        </div>
      </div>

      {/* Active Filter Badges */}
      {getActiveFilterCount() > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2 pt-4 border-t border-secondary-200 dark:border-secondary-700">
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
            {filters.dateRange === 'today' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                Attended: Today
                <button onClick={() => clearFilter('dateRange')} className="hover:text-primary-900 dark:hover:text-primary-100">
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
        </div>
      )}

      {/* Results Count */}
          {inquiries.length > 0 && (
            <div className="m-1">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Showing {inquiries.length} inquiries
              </div>
            </div>
          )}

      {/* List */}
      <div className="card">
        <div className="p-0">
          
          <div className="overflow-x-auto rounded-xl">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Course</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lead Stage</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Attended At</th>
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
                      <div className="text-xs font-medium text-secondary-900 dark:text-white">{inquiry.name || '-'}</div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="text-xs text-secondary-900 dark:text-white">{inquiry.phone}</div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-secondary-900 dark:text-white">{inquiry.course}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-secondary-900 dark:text-white">{inquiry.preferredLocation}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
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
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {inquiry.forwardedAt ? (
                        <>
                          <div className="text-xs text-secondary-900 dark:text-white">
                            {new Date(inquiry.forwardedAt).toLocaleDateString()}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">
                            {new Date(inquiry.forwardedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-400 dark:text-gray-500 italic">-</div>
                      )}
                    </td>
{/* Action cell removed */}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>


          {inquiries.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-secondary-600 dark:text-secondary-300">
                No assigned inquiries found.
              </p>
            </div>
          )}

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
    </div>
  );
};

export default SalesAssigned;

