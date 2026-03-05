import React from 'react';
import { useQuery } from 'react-query';
import { useLocation } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import PresalesUserDetailsModal from '@/components/PresalesUserDetailsModal';
import { cn } from '@/utils/cn';

const MODAL_STATE_KEY = 'presales-report-modal-state';

interface PresalesUserStats {
  userId: string;
  name: string;
  email: string;
  totalInquiriesCreated: number;
  totalInquiriesForwarded: number;
  totalFollowupsCompleted: number;
  totalPendingFollowups: number;
}

interface PresalesReportProps {
  filterParams?: { dateRange?: string; dateFrom?: string; dateTo?: string };
  searchTerm?: string;
}

const PresalesReport: React.FC<PresalesReportProps> = ({ filterParams = {}, searchTerm }) => {
  const location = useLocation();
  
  // Restore modal state from sessionStorage on mount or when coming back from inquiry detail
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(MODAL_STATE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.userId || null;
        } catch {
          return null;
        }
      }
    }
    return null;
  });
  
  const [isModalOpen, setIsModalOpen] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(MODAL_STATE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.isOpen || false;
        } catch {
          return false;
        }
      }
    }
    return false;
  });

  // Restore modal state when coming back from inquiry detail page
  React.useEffect(() => {
    const restoreModalState = () => {
      if (typeof window !== 'undefined' && location.pathname.includes('/reports')) {
        const saved = sessionStorage.getItem(MODAL_STATE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            // If we're on the reports page and modal state exists, restore it
            if (parsed.isOpen && parsed.userId) {
              setSelectedUserId(parsed.userId);
              setIsModalOpen(true);
              // Also ensure the presales tab is active in the Reports page
              const reportsTab = sessionStorage.getItem('reports-active-tab');
              if (reportsTab !== 'presales') {
                sessionStorage.setItem('reports-active-tab', 'presales');
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    };

    // Small delay to ensure Reports component has mounted and can restore tab
    const timeoutId = setTimeout(() => {
      restoreModalState();
    }, 100);

    // Also restore when page becomes visible (e.g., user switches back to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        restoreModalState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also listen for focus events (when user comes back to the window)
    window.addEventListener('focus', restoreModalState);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', restoreModalState);
    };
  }, [location.pathname]);

  const { data, isLoading, error, refetch } = useQuery(
    ['presales-report', filterParams],
    () => apiService.inquiries.getPresalesReport(filterParams),
    {
      refetchOnWindowFocus: false,
      staleTime: 2 * 60 * 1000, // Cache for 2 minutes
      retry: 2,
    }
  );

  const presalesUsers: PresalesUserStats[] = React.useMemo(() => {
    const users = data?.data?.users || [];
    const term = (searchTerm || '').trim().toLowerCase();

    const filtered = term
      ? users.filter((user: PresalesUserStats) =>
          user.name.toLowerCase().includes(term)
        )
      : users;

    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.data?.users, searchTerm]);

  const handleViewClick = (userId: string) => {
    setSelectedUserId(userId);
    setIsModalOpen(true);
    // Save modal state to sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(MODAL_STATE_KEY, JSON.stringify({
        isOpen: true,
        userId,
      }));
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUserId(null);
    // Clear modal state from sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(MODAL_STATE_KEY);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 dark:text-red-400 mb-4">
          Failed to load presales report. Please try again.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="card">
        <div className="p-0.5 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Inquiries Created
                </th>
                <th className="px-4 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Inquiries Forwarded
                </th>
                <th className="px-4 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Followups Completed
                </th>
                <th className="px-4 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Pending Followups
                </th>
                <th className="px-4 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {presalesUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No presales users found
                  </td>
                </tr>
              ) : (
                presalesUsers.map((user, index) => (
                  <motion.tr
                    key={user.userId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-1.5">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {user.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {user.email}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-center text-sm text-gray-900 dark:text-white">
                      {user.totalInquiriesCreated}
                    </td>
                    <td className="px-4 py-1.5 text-center text-sm text-gray-900 dark:text-white">
                      {user.totalInquiriesForwarded}
                    </td>
                    <td className="px-4 py-1.5 text-center text-sm text-gray-900 dark:text-white">
                      {user.totalFollowupsCompleted}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                        user.totalPendingFollowups > 0
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      )}>
                        {user.totalPendingFollowups}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      <button
                        onClick={() => handleViewClick(user.userId)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {selectedUserId && (
        <PresalesUserDetailsModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          userId={selectedUserId}
        />
      )}
    </div>
  );
};

export default PresalesReport;
