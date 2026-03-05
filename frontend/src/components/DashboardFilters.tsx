import React, { useState, useRef, useEffect } from 'react';
import { Calendar, X } from 'lucide-react';
import { cn } from '@/utils/cn';


export type DateRangeOption = 'today' | '7d' | '30d' | 'quarter' | 'custom' | 'allTime' | 'lastWeek' | 'lastMonth' | 'lastYear';

interface DashboardFiltersProps {
  dateRange: DateRangeOption;
  setDateRange: (range: DateRangeOption) => void;
  customDateFrom: string;
  setCustomDateFrom: (date: string) => void;
  customDateTo: string;
  setCustomDateTo: (date: string) => void;
}

const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  dateRange,
  setDateRange,
  customDateFrom,
  setCustomDateFrom,
  customDateTo,
  setCustomDateTo
}) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowCustomPicker(false);
      }
    };

    if (showCustomPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCustomPicker]);

  const options: { value: DateRangeOption; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'custom', label: 'Custom' },
  ];

  const handleOptionClick = (option: DateRangeOption) => {
    if (option === 'custom') {
      setShowCustomPicker(true);
      // Don't set dateRange to custom immediately if we want to keep previous selection until apply? 
      // Actually usually you switch to custom mode.
      setDateRange('custom');
    } else {
      setDateRange(option);
      setShowCustomPicker(false);
      // Clear custom dates if switching away? Optional, but good for cleanliness.
      // But maybe user wants to switch back. Let's keep them but ignore them in logic.
    }
  };

{/* Action column removed */}

  return (
    <div className="relative">
      <div className="flex items-center gap-1 p-1 bg-secondary-100 dark:bg-secondary-800 rounded-lg overflow-x-auto no-scrollbar max-w-[100vw] sm:max-w-none">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => handleOptionClick(option.value)}
            className={cn(
              "relative px-2 sm:px-4 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
              dateRange === option.value
                ? "bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white shadow-sm"
                : "text-secondary-500 hover:text-secondary-900 dark:text-secondary-400 dark:hover:text-secondary-200"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Custom Date Picker Popover */}
      {showCustomPicker && (
        <div 
          ref={pickerRef}
          className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-secondary-900 rounded-xl shadow-xl border border-secondary-200 dark:border-secondary-800 p-4 transform origin-top-right transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary-500" />
              Custom Range
            </h3>
            <button 
              onClick={() => setShowCustomPicker(false)}
              className="text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary-600 dark:text-secondary-400">From</label>
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                max={customDateTo || new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 text-sm bg-secondary-50 dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all text-secondary-900 dark:text-white"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary-600 dark:text-secondary-400">To</label>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                min={customDateFrom}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 text-sm bg-secondary-50 dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all text-secondary-900 dark:text-white"
              />
            </div>

            <button
              onClick={() => setShowCustomPicker(false)}
              className="w-full mt-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              Apply Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardFilters;
