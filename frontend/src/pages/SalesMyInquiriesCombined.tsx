import React, { useState } from 'react';
import SalesAssigned from './SalesAssigned';
import MyInquiries from './MyInquiries';
import { cn } from '@/utils/cn';

const STORAGE_KEY = 'sales-my-inquiries-active-tab';

const SalesMyInquiriesCombined: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'attended' | 'raised'>(() => {
    // Initialize from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved as 'attended' | 'raised') || 'attended';
  });

  const handleTabChange = (tab: 'attended' | 'raised') => {
    setActiveTab(tab);
    localStorage.setItem(STORAGE_KEY, tab);
  };

  return (
    <div className="space-y-6">
      <div className="flex border-b border-gray-200 dark:border-gray-800 pb-0 relative z-10">
        <div className="flex flex-row items-center gap-1 overflow-x-auto scrollbar-hide w-full sm:w-auto -mb-px shrink-0">
          <button
            onClick={() => handleTabChange('attended')}
            className={cn(
              "nav-tab group",
              activeTab === 'attended' && "active"
            )}
          >
            My Attended Inquiries
            {activeTab === 'attended' && (
              <div className="nav-tab-indicator" />
            )}
          </button>
          <button
            onClick={() => handleTabChange('raised')}
            className={cn(
              "nav-tab group",
              activeTab === 'raised' && "active"
            )}
          >
            My Raised Inquiries
            {activeTab === 'raised' && (
              <div className="nav-tab-indicator" />
            )}
          </button>
        </div>
      </div>

      <div className="mt-4">
        {activeTab === 'attended' ? <SalesAssigned /> : <MyInquiries />}
      </div>
    </div>
  );
};

export default SalesMyInquiriesCombined;

