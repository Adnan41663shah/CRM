import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  className = '',
}) => {
  if (totalPages <= 1) return null;

  // Calculate pages
  const getPageNumbers = () => {
    const pages: number[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) pages.push(i);
      } else if (currentPage >= totalPages - 2) {
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
      }
    }
    return pages;
  };

  const pageNumbers = getPageNumbers();
  const [pageInput, setPageInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate start and end indices
  const start = Math.min((currentPage - 1) * itemsPerPage + 1, totalItems);
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  // Debounced page navigation
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (pageInput === '') {
      setErrorMessage('');
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      const pageNum = parseInt(pageInput, 10);
      
      if (isNaN(pageNum) || pageNum < 1) {
        setErrorMessage('Page doesn\'t exist');
        return;
      }

      if (pageNum > totalPages) {
        setErrorMessage('Page doesn\'t exist');
        return;
      }

      // Valid page number
      setErrorMessage('');
      if (pageNum !== currentPage) {
        onPageChange(pageNum);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [pageInput, totalPages, currentPage, onPageChange]);

  // Clear error when current page changes (user navigated successfully)
  useEffect(() => {
    if (pageInput && parseInt(pageInput, 10) === currentPage) {
      setErrorMessage('');
    }
  }, [currentPage, pageInput]);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numbers
    if (value === '' || /^\d+$/.test(value)) {
      setPageInput(value);
      setErrorMessage('');
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const pageNum = parseInt(pageInput, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        setErrorMessage('');
        if (pageNum !== currentPage) {
          onPageChange(pageNum);
        }
      } else if (pageInput !== '') {
        setErrorMessage('Page doesn\'t exist');
      }
    }
  };

  return (
    <div className={cn('flex flex-col items-center sm:flex-row sm:justify-between w-full gap-4 p-4', className)}>
      {/* Showing results text */}
      <div className="text-sm text-gray-700 dark:text-gray-300 text-center sm:text-left order-last sm:order-first w-full sm:w-auto">
        Showing <span className="font-medium text-gray-900 dark:text-white">{start}</span> to <span className="font-medium text-gray-900 dark:text-white">{end}</span> of <span className="font-medium text-gray-900 dark:text-white">{totalItems}</span> inquiries
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto justify-center sm:justify-end">
        {/* Desktop View */}
        <div className="hidden sm:flex sm:items-center sm:justify-center sm:gap-3">
          <nav className="relative z-0 inline-flex rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden" aria-label="Pagination">
            {/* Previous Button */}
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={cn(
                'relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors',
                currentPage === 1
                  ? 'bg-white dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              )}
            >
              <span className="sr-only">Previous</span>
              <ChevronLeft className="h-5 w-5" />
            </button>

            {/* Page Numbers */}
            {pageNumbers.map((pageNum, index) => (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={cn(
                  'relative inline-flex items-center px-4 py-2 text-sm font-medium transition-colors',
                  index > 0 && 'border-l border-gray-200 dark:border-gray-700',
                  currentPage === pageNum
                    ? 'z-10 bg-primary-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                )}
                aria-current={currentPage === pageNum ? 'page' : undefined}
              >
                {pageNum}
              </button>
            ))}

            {/* Next Button */}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={cn(
                'relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors',
                currentPage === totalPages
                  ? 'bg-white dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              )}
            >
              <span className="sr-only">Next</span>
              <ChevronRight className="h-5 w-5" />
            </button>
          </nav>
          
          {/* Page Number Input */}
          <div className="relative flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pageInput}
                onChange={handlePageInputChange}
                onKeyDown={handlePageInputKeyDown}
                onBlur={() => {
                  // Clear input if it matches current page or is invalid
                  if (pageInput && (parseInt(pageInput, 10) === currentPage || parseInt(pageInput, 10) < 1 || parseInt(pageInput, 10) > totalPages)) {
                    setPageInput('');
                    setErrorMessage('');
                  }
                }}
                placeholder="Go to..."
                className={cn(
                  'w-24 px-3 py-1.5 text-sm border rounded-md transition-colors',
                  'bg-white dark:bg-gray-800',
                  'border-gray-300 dark:border-gray-600',
                  'text-gray-900 dark:text-white',
                  'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                  errorMessage && 'border-red-500 focus:ring-red-500 focus:border-red-500'
                )}
              />
              {errorMessage && (
                <div className="absolute top-full left-0 mt-1 px-2 py-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800 whitespace-nowrap z-10">
                  {errorMessage}
                </div>
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              of {totalPages}
            </span>
          </div>
        </div>

        {/* Mobile View */}
        <div className="flex items-center justify-between gap-2 sm:hidden w-full">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={cn(
              'relative inline-flex items-center p-2 border border-gray-300 dark:border-gray-600 rounded-md transition-colors',
              currentPage === 1
                ? 'text-gray-300 dark:text-gray-600 bg-white dark:bg-gray-800 cursor-not-allowed'
                : 'text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
            )}
            aria-label="Previous Page"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <div className="relative flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Page</span>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pageInput}
                onChange={handlePageInputChange}
                onKeyDown={handlePageInputKeyDown}
                onBlur={() => {
                  if (pageInput && (parseInt(pageInput, 10) === currentPage || parseInt(pageInput, 10) < 1 || parseInt(pageInput, 10) > totalPages)) {
                    setPageInput('');
                    setErrorMessage('');
                  }
                }}
                placeholder={currentPage.toString()}
                className={cn(
                  'w-12 px-1 py-1.5 text-sm text-center border rounded-md transition-colors',
                  'bg-white dark:bg-gray-800',
                  'border-gray-300 dark:border-gray-600',
                  'text-gray-900 dark:text-white',
                  'placeholder:text-gray-900 dark:placeholder:text-white',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                  errorMessage && 'border-red-500 focus:ring-red-500 focus:border-red-500'
                )}
              />
              {errorMessage && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800 whitespace-nowrap z-10 shadow-sm">
                  {errorMessage}
                </div>
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              of {totalPages}
            </span>
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={cn(
              'relative inline-flex items-center p-2 border border-gray-300 dark:border-gray-600 rounded-md transition-colors',
              currentPage === totalPages
                ? 'text-gray-300 dark:text-gray-600 bg-white dark:bg-gray-800 cursor-not-allowed'
                : 'text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
            )}
            aria-label="Next Page"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
