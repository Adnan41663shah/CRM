import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Upload, Search, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'react-toastify';
import apiService from '@/services/api';
import { Student } from '@/types';
import LoadingSpinner from '@/components/LoadingSpinner';
import Pagination from '@/components/Pagination';

const POLL_INTERVAL_MS = 2500;

type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface ImportJobProgress {
  status: ImportStatus;
  total: number;
  processed: number;
  duplicates: number;
  errorsCount: number;
  errorSample: string[];
}

const DataTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(100);
  const [search, setSearch] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportJobProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = useQuery(
    ['students', search, page, limit],
    () => apiService.students.getAll({ search, page, limit }),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
    }
  );

  const students: Student[] = data?.data?.students || [];
  const pagination = data?.data?.pagination;

  // Poll import status when a job is in progress
  useEffect(() => {
    if (!activeJobId) return;
    const poll = async () => {
      try {
        const res = await apiService.students.getImportStatus(activeJobId);
        if (!res.success || !res.data) return;
        const d = res.data as ImportJobProgress;
        setImportProgress(d);
        if (d.status === 'completed') {
          setActiveJobId(null);
          const imported = d.processed || 0;
          const skipped = d.duplicates || 0;
          const total = d.total || 0;
          
          let msg = '';
          if (total > 0) {
            if (imported > 0 && skipped > 0) {
              msg = `Import completed: ${imported} student(s) imported successfully, ${skipped} duplicate phone number(s) skipped.`;
            } else if (imported > 0) {
              msg = `Import completed: ${imported} student(s) imported successfully.`;
            } else if (skipped > 0) {
              msg = `Import completed: All ${skipped} student(s) were duplicates and skipped.`;
            } else {
              msg = 'Import completed with no valid records.';
            }
          } else {
            msg = 'Import completed.';
          }
          
          toast.success(msg, { autoClose: 5000 });
          
          if (d.errorsCount > 0) {
            const errorMsg = d.errorSample?.length
              ? `${d.errorsCount} row(s) had errors. First error: ${d.errorSample[0]}`
              : `${d.errorsCount} row(s) had errors.`;
            toast.warning(errorMsg, { autoClose: 6000 });
          }
          
          queryClient.invalidateQueries(['students']);
          refetch();
          return;
        }
        if (d.status === 'failed') {
          setActiveJobId(null);
          setImportProgress(null);
          const imported = d.processed || 0;
          const skipped = d.duplicates || 0;
          
          let msg = 'Import failed.';
          if (d.errorSample?.length) {
            msg = `Import failed: ${d.errorSample[0]}`;
            if (d.errorSample.length > 1) {
              msg += ` (and ${d.errorSample.length - 1} more error(s))`;
            }
          }
          
          if (imported > 0 || skipped > 0) {
            msg += ` ${imported} imported, ${skipped} skipped before failure.`;
          }
          
          toast.error(msg, { autoClose: 7000 });
          return;
        }
      } catch {
        // Keep polling on transient errors
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeJobId, queryClient, refetch]);

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];

    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload an Excel file (.xlsx, .xls) or CSV file.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size exceeds 50MB limit.');
      return;
    }

    setIsImporting(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
    try {
      const response = await apiService.students.import(file);
      setIsImporting(false);

      if (response.success && response.jobId) {
        toast.success('Import started. Processing in background.');
        setActiveJobId(response.jobId);
        setImportProgress({ status: 'pending', total: 0, processed: 0, duplicates: 0, errorsCount: 0, errorSample: [] });
      } else if (response.success) {
        toast.success('Import started.');
      } else {
        const errorMessage = response.message || 'Failed to start import';
        toast.error(errorMessage);
      }
    } catch (error: unknown) {
      setIsImporting(false);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to import students. Please try again.';
      toast.error(errorMessage);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const formatValue = (value: string | null | undefined, _isDate: boolean = false): string => {
    if (value === null || value === undefined || value === '' || value === '-') {
      return '-';
    }
    
    return String(value).trim() || '-';
  };

  return (
    <div className="space-y-4">
      {/* Header with Import Button */}
      <div className="card p-2">
        <div className="card-content">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900 dark:text-white">Student Data</h2>
              <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-1">
                Import and manage student records from Excel files
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImport}
                className="hidden"
                id="file-upload"
                disabled={isImporting}
              />
              <label
                htmlFor="file-upload"
                className={`btn btn-primary flex items-center gap-2 px-2 py-2 ${
                  isImporting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Importing...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span className="hidden sm:inline">Import</span>
                    <span className="sm:hidden">Import</span>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Import progress */}
      {activeJobId && importProgress && (
        <div className="card border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 shadow-sm rounded-lg">
          <div className="card-content px-5 py-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {importProgress.status === 'processing' || importProgress.status === 'pending' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                  ) : null}
                  <span className="font-medium text-sm text-gray-900 dark:text-white">
                    {importProgress.status === 'pending'
                      ? 'Starting import...'
                      : importProgress.status === 'processing'
                        ? 'Importing students...'
                        : importProgress.status === 'completed'
                          ? 'Import completed!'
                          : 'Import failed'}
                  </span>
                </div>
                {importProgress.total > 0 && (
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {importProgress.processed} / {importProgress.total} ({Math.round((importProgress.processed / importProgress.total) * 100)}%)
                  </span>
                )}
              </div>
              
              {importProgress.total > 0 && importProgress.status === 'processing' && (
                <div className="px-1 py-1.5">
                  <div className="w-full bg-gray-100 dark:bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-600 dark:bg-blue-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${Math.min(100, (importProgress.processed / importProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              
              <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                {importProgress.duplicates > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    <span>⚠️</span>
                    <span>{importProgress.duplicates} duplicate phone number(s) skipped</span>
                  </span>
                )}
                {importProgress.errorsCount > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                    <span>❌</span>
                    <span>{importProgress.errorsCount} error(s)</span>
                  </span>
                )}
                {importProgress.status === 'processing' && importProgress.total > 0 && (
                  <span className="text-gray-500 dark:text-gray-400">
                    Processing... Please wait
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="card">
        <div className="card-content">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, mobile, email, course, or center..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-secondary-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="card p-2">
        <div className="card-content">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <LoadingSpinner />
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-12">
              <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-secondary-500 dark:text-secondary-400">
                {search ? 'No students found matching your search.' : 'No student data imported yet. Click Import to upload an Excel file.'}
              </p>
            </div>
          ) : (
            <>
              {pagination && (
                <div className="mb-4 text-sm text-secondary-700 dark:text-secondary-300">
                  Showing {students.length} of {pagination.total || 0} students
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-12 whitespace-nowrap">
                        Sr. No.
                      </th>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Student Name
                      </th>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Mobile Number
                      </th>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Email
                      </th>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Course
                      </th>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Center
                      </th>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Status
                      </th>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Attended By
                      </th>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Created By
                      </th>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Attended At
                      </th>
                      <th className="px-2 sm:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {students.map((student, index) => {
                      const rowNumber = (page - 1) * limit + index + 1;
                      return (
                        <tr
                          key={student._id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-secondary-500 dark:text-secondary-400 font-medium">
                            {rowNumber}
                          </td>
                          <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-secondary-900 dark:text-white">
                            {formatValue(student.studentName)}
                          </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-secondary-900 dark:text-white">
                          {formatValue(student.mobileNumber)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-secondary-900 dark:text-white">
                          {formatValue(student.email)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-secondary-900 dark:text-white">
                          {formatValue(student.course)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-secondary-900 dark:text-white">
                          {formatValue(student.center)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-secondary-900 dark:text-white">
                          {formatValue(student.status)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-secondary-900 dark:text-white">
                          {formatValue(student.attendedBy)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-secondary-900 dark:text-white">
                          {formatValue(student.createdBy)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-secondary-900 dark:text-white">
                          {formatValue(student.attendedAt, true)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-sm text-secondary-900 dark:text-white max-w-xs truncate">
                          {formatValue(student.notes)}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pagination && pagination.pages > 1 && (
                <div className="mt-6">
                  <Pagination
                    currentPage={pagination.page || page}
                    totalPages={pagination.pages || 1}
                    totalItems={pagination.total || 0}
                    itemsPerPage={limit}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataTab;
