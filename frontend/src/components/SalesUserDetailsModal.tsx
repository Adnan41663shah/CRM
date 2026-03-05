import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { X, Briefcase, Clock, Mail, Phone, MapPin, BookOpen, Calendar, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';
import apiService from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Inquiry, FollowUp } from '@/types';
import { startOfDay, endOfDay, isWithinInterval, parseISO } from 'date-fns';
import { getStatusColor, getStatusLabel } from '@/utils/constants';

type DateFilterType = 'today' | 'all' | 'custom';

const MODAL_STATE_KEY = 'sales-report-modal-state';

interface SalesUserDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

interface SalesUserDetails {
  user: {
    _id: string;
    name: string;
    email: string;
  };
  attendedInquiries: Inquiry[];
  pendingFollowups: Array<FollowUp & { inquiry: Partial<Inquiry> }>;
}

const SalesUserDetailsModal: React.FC<SalesUserDetailsModalProps> = ({
  isOpen,
  onClose,
  userId,
}) => {
  const navigate = useNavigate();
  
  // Restore active tab from sessionStorage
  const [activeTab, setActiveTab] = useState<'inquiries' | 'followups'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(MODAL_STATE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.activeTab || 'inquiries';
        } catch {
          return 'inquiries';
        }
      }
    }
    return 'inquiries';
  });

  // Independent filter states for each tab
  const [inquiryFilter, setInquiryFilter] = useState<DateFilterType>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(MODAL_STATE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.inquiryFilter || 'today';
        } catch { return 'today'; }
      }
    }
    return 'today';
  });

  const [inquiryCustomRange, setInquiryCustomRange] = useState<{ start: string; end: string }>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(MODAL_STATE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.inquiryCustomRange || { start: '', end: '' };
        } catch { return { start: '', end: '' }; }
      }
    }
    return { start: '', end: '' };
  });
  
  const [followupFilter, setFollowupFilter] = useState<DateFilterType>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(MODAL_STATE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.followupFilter || 'today';
        } catch { return 'today'; }
      }
    }
    return 'today';
  });

  const [followupCustomRange, setFollowupCustomRange] = useState<{ start: string; end: string }>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(MODAL_STATE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.followupCustomRange || { start: '', end: '' };
        } catch { return { start: '', end: '' }; }
      }
    }
    return { start: '', end: '' };
  });

  const { data, isLoading, error } = useQuery(
    ['sales-user-details', userId],
    () => apiService.inquiries.getSalesUserDetails(userId),
    {
      enabled: isOpen && !!userId,
      refetchOnWindowFocus: false,
      staleTime: 1 * 60 * 1000, // Cache for 1 minute
    }
  );



  const userDetails: SalesUserDetails | undefined = data?.data;

  // Filtered Data Logic
  const filteredInquiries = React.useMemo(() => {
    if (!userDetails?.attendedInquiries) return [];
    
    return userDetails.attendedInquiries.filter(inquiry => {
      if (inquiryFilter === 'all') return true;
      
      // Use first follow-up createdAt as attended proxy (attended = user engaged with inquiry)
      const firstFollowUp = inquiry.followUps?.[0]
        ? [...inquiry.followUps].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
        : null;
      const dateToCheck = firstFollowUp?.createdAt || inquiry.updatedAt;
      if (!dateToCheck) return false;
      
      const date = parseISO(dateToCheck);
      
      if (inquiryFilter === 'today') {
        const today = new Date();
        return isWithinInterval(date, { start: startOfDay(today), end: endOfDay(today) });
      }
      
      if (inquiryFilter === 'custom' && inquiryCustomRange.start && inquiryCustomRange.end) {
        const startDate = startOfDay(parseISO(inquiryCustomRange.start));
        const endDate = endOfDay(parseISO(inquiryCustomRange.end));
        
        if (startDate > endDate) return false;

        return isWithinInterval(date, {
          start: startDate,
          end: endDate
        });
      }
      
      return true;
    });
  }, [userDetails?.attendedInquiries, inquiryFilter, inquiryCustomRange]);

  const filteredFollowups = React.useMemo(() => {
    if (!userDetails?.pendingFollowups) return [];
    
    return userDetails.pendingFollowups.filter(followup => {
      if (followupFilter === 'all') return true;
      
      const dateToCheck = followup.nextFollowUpDate;
      if (!dateToCheck) return false;
      
      const date = parseISO(dateToCheck);
      
      if (followupFilter === 'today') {
        const today = new Date();
        return isWithinInterval(date, { start: startOfDay(today), end: endOfDay(today) });
      }
      
      if (followupFilter === 'custom' && followupCustomRange.start && followupCustomRange.end) {
        const startDate = startOfDay(parseISO(followupCustomRange.start));
        const endDate = endOfDay(parseISO(followupCustomRange.end));

        if (startDate > endDate) return false;

        return isWithinInterval(date, {
          start: startDate,
          end: endDate
        });
      }
      
      return true;
    });
  }, [userDetails?.pendingFollowups, followupFilter, followupCustomRange]);


  // Save active tab and filter states to sessionStorage when they change
  React.useEffect(() => {
    if (isOpen && userId && typeof window !== 'undefined') {
      sessionStorage.setItem(MODAL_STATE_KEY, JSON.stringify({ 
        isOpen: true,
        userId,
        activeTab,
        inquiryFilter,
        inquiryCustomRange,
        followupFilter,
        followupCustomRange
      }));
    }
  }, [activeTab, inquiryFilter, inquiryCustomRange, followupFilter, followupCustomRange, isOpen, userId]);

  const handleViewInquiry = (inquiryId: string) => {
    // Save current modal state before navigating
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(MODAL_STATE_KEY, JSON.stringify({
        isOpen: true,
        userId,
        activeTab,
        inquiryFilter,
        inquiryCustomRange,
        followupFilter,
        followupCustomRange
      }));
    }
    navigate(`/inquiries/${inquiryId}`);
    // Keep modal open so it's still visible when user navigates back
  };

  const handleTabChange = (tab: 'inquiries' | 'followups') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const currentState = sessionStorage.getItem(MODAL_STATE_KEY);
      let state = { isOpen: true, userId, activeTab: tab };
      if (currentState) {
        try {
          state = { ...JSON.parse(currentState), activeTab: tab };
        } catch {
          state = { isOpen: true, userId, activeTab: tab };
        }
      }
      sessionStorage.setItem(MODAL_STATE_KEY, JSON.stringify(state));
    }
  };

  // Close modal on Escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Enhanced Backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-50 transition-opacity"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Enhanced Header with gradient accent */}
              <div className="relative bg-linear-to-r from-primary-50 to-white dark:from-gray-800 dark:to-gray-900 border-b-2 border-primary-200 dark:border-primary-900/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-4 sm:p-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <Briefcase className="h-5 w-5 sm:h-6 sm:w-6 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white truncate">
                          {userDetails?.user.name || 'User Details'}
                        </h2>
                        {userDetails?.user.email && (
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 truncate flex items-center gap-1.5">
                            <Mail className="h-3 w-3 shrink-0" />
                            {userDetails.user.email}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="absolute top-4 right-4 sm:relative sm:top-0 sm:right-0 shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
                    aria-label="Close modal"
                  >
                    <X className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </div>

                {/* Enhanced Tabs and Filter Controls Container */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between border-t border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 sm:px-6 shadow-sm z-10">
                  {/* Tabs (Left) */}
                  <div className="flex overflow-x-auto scrollbar-hide -mb-px">
                  <button
                    onClick={() => handleTabChange('inquiries')}
                    className={cn(
                      'relative px-4 sm:px-6 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap shrink-0 group',
                      activeTab === 'inquiries'
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Briefcase className={cn(
                        'h-4 w-4 sm:h-5 sm:w-5 transition-colors',
                        activeTab === 'inquiries' 
                          ? 'text-primary-600 dark:text-primary-400' 
                          : 'text-gray-500 dark:text-gray-500 group-hover:text-primary-500'
                      )} />
                      <span className="hidden sm:inline">Attended Inquiries</span>
                      <span className="sm:hidden">Attended</span>
                      <span className={cn(
                        'ml-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold transition-colors',
                        activeTab === 'inquiries'
                          ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      )}>
                        {filteredInquiries.length} / {userDetails?.attendedInquiries.length || 0}
                      </span>
                    </div>
                    {activeTab === 'inquiries' && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400 rounded-t-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                  <button
                    onClick={() => handleTabChange('followups')}
                    className={cn(
                      'relative px-4 sm:px-6 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap shrink-0 group',
                      activeTab === 'followups'
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className={cn(
                        'h-4 w-4 sm:h-5 sm:w-5 transition-colors',
                        activeTab === 'followups' 
                          ? 'text-primary-600 dark:text-primary-400' 
                          : 'text-gray-500 dark:text-gray-500 group-hover:text-primary-500'
                      )} />
                      <span className="hidden sm:inline">Pending Followups</span>
                      <span className="sm:hidden">Followups</span>
                      <span className={cn(
                        'ml-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold transition-colors',
                        activeTab === 'followups'
                          ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      )}>
                        {filteredFollowups.length} / {userDetails?.pendingFollowups.length || 0}
                      </span>
                    </div>
                    {activeTab === 'followups' && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400 rounded-t-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                  </div>

                  {/* Filter Controls (Right) */}
                  <div className="flex items-center gap-4 py-2 lg:py-0 overflow-x-auto scrollbar-hide">
                    <div className="flex items-center gap-2 shrink-0">
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-700">
                      {(['today', 'all', 'custom'] as DateFilterType[]).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => activeTab === 'inquiries' ? setInquiryFilter(filter) : setFollowupFilter(filter)}
                          className={cn(
                            "px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 capitalize",
                            (activeTab === 'inquiries' ? inquiryFilter : followupFilter) === filter
                              ? "bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm"
                              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50"
                          )}
                        >
                          {filter === 'all' ? 'All Time' : filter}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Date Inputs */}
                  {((activeTab === 'inquiries' && inquiryFilter === 'custom') || (activeTab === 'followups' && followupFilter === 'custom')) && (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-1 border border-gray-200 dark:border-gray-700"
                    >
                      <input
                        type="date"
                        value={activeTab === 'inquiries' ? inquiryCustomRange.start : followupCustomRange.start}
                        onChange={(e) => activeTab === 'inquiries' 
                          ? setInquiryCustomRange(prev => ({ ...prev, start: e.target.value }))
                          : setFollowupCustomRange(prev => ({ ...prev, start: e.target.value }))
                        }
                        className="px-2 py-0.5 text-xs border-0 bg-transparent text-gray-900 dark:text-gray-100 focus:ring-0 outline-none w-28"
                      />
                      <span className="text-gray-400 text-xs">to</span>
                      <input
                        type="date"
                        value={activeTab === 'inquiries' ? inquiryCustomRange.end : followupCustomRange.end}
                        onChange={(e) => activeTab === 'inquiries' 
                          ? setInquiryCustomRange(prev => ({ ...prev, end: e.target.value }))
                          : setFollowupCustomRange(prev => ({ ...prev, end: e.target.value }))
                        }
                        className="px-2 py-0.5 text-xs border-0 bg-transparent text-gray-900 dark:text-gray-100 focus:ring-0 outline-none w-28"
                      />
                    </motion.div>
                  )}
                  </div>
                </div>
              </div>

              {/* Content Area with smooth scrolling */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-gray-50/50 dark:bg-gray-950/50">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <LoadingSpinner />
                  </div>
                ) : error ? (
                  <div className="text-center py-16">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                      <X className="h-8 w-8 text-red-600 dark:text-red-400" />
                    </div>
                    <p className="text-red-600 dark:text-red-400 font-medium">
                      Failed to load user details. Please try again.
                    </p>
                  </div>
                ) : activeTab === 'inquiries' ? (
                  <div className="space-y-4">
                    {filteredInquiries.length === 0 ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-20"
                      >
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-linear-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 mb-6 shadow-inner">
                          <Briefcase className="h-10 w-10 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Inquiries Found</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                          {inquiryFilter === 'today' ? 'No inquiries attended today' : inquiryFilter === 'custom' ? 'No inquiries found in the selected date range' : 'No inquiries attended by this user'}
                        </p>
                      </motion.div>
                    ) : (
                      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-linear-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-800/50">
                              <tr>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                  Name
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden sm:table-cell">
                                  Email
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                  Phone
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden md:table-cell">
                                  Course
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden lg:table-cell">
                                  Location
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                  Status
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden xl:table-cell">
                                  Created
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-center text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                  Action
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                              {filteredInquiries.map((inquiry, index) => (
                                <motion.tr
                                  key={inquiry._id}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.2, delay: index * 0.03 }}
                                  className="group hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-colors duration-150"
                                >
                                  <td className="px-3 sm:px-4 md:px-6 py-2">
                                    <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[140px] sm:max-w-none">
                                      {inquiry.name || '-'}
                                    </div>
                                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 sm:hidden mt-1 truncate flex items-center gap-1">
                                      <Mail className="h-3 w-3" />
                                      {inquiry.email || '-'}
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2 hidden sm:table-cell">
                                    <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                      <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                                      <span className="truncate max-w-[180px] md:max-w-[220px]">{inquiry.email || '-'}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2">
                                    <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                                      <span className="truncate font-mono">{inquiry.phone || '-'}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2 hidden md:table-cell">
                                    <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                                      <span className="truncate">{inquiry.course || '-'}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2 hidden lg:table-cell">
                                    <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                      <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                                      <span className="truncate">{inquiry.preferredLocation || '-'}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2">
                                    <span
                                      className={cn(
                                        'inline-flex items-center px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold shadow-sm',
                                        getStatusColor(inquiry.status)
                                      )}
                                    >
                                      {getStatusLabel(inquiry.status)}
                                    </span>
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2 hidden xl:table-cell">
                                    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                      <Calendar className="h-3 w-3 shrink-0" />
                                      <span className="whitespace-nowrap">
                                        {new Date(inquiry.createdAt).toLocaleDateString('en-US', {
                                          year: 'numeric',
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2 text-center">
                                    <button
                                      onClick={() => handleViewInquiry(inquiry._id)}
                                      className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-300 border border-primary-200 dark:border-primary-800 transition-all duration-200 hover:scale-110 active:scale-95 shadow-sm hover:shadow-md group"
                                      title="View Inquiry Details"
                                    >
                                      <Eye className="h-4 w-4 sm:h-5 sm:w-5 group-hover:scale-110 transition-transform" />
                                    </button>
                                  </td>
                                </motion.tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredFollowups.length === 0 ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-20"
                      >
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-linear-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 mb-6 shadow-inner">
                          <Clock className="h-10 w-10 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Pending Follow-ups</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                          {followupFilter === 'today' ? 'No follow-ups scheduled for today' : followupFilter === 'custom' ? 'No follow-ups found in the selected date range' : 'No pending follow-ups for this user'}
                        </p>
                      </motion.div>
                    ) : (
                      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-linear-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-800/50">
                              <tr>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                  Inquiry
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden md:table-cell">
                                  Course
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden lg:table-cell">
                                  Location
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden xl:table-cell">
                                  Message
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-left text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden lg:table-cell">
                                  Next
                                </th>
                                <th className="px-3 sm:px-4 md:px-6 py-2 text-center text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                  Action
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                              {filteredFollowups.map((followup, index) => (
                                <motion.tr
                                  key={followup._id}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.2, delay: index * 0.03 }}
                                  className="group hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-colors duration-150 border-l-4 border-warning-400 dark:border-warning-500"
                                >
                                  <td className="px-3 sm:px-4 md:px-6 py-2">
                                    <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[140px] sm:max-w-none">
                                      {followup.inquiry.name || '-'}
                                    </div>
                                    {followup.title && (
                                      <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 sm:hidden mt-1">
                                        {followup.title}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2 hidden md:table-cell">
                                    <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                                      <span className="truncate">{followup.inquiry.course || '-'}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2 hidden lg:table-cell">
                                    <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                      <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                                      <span className="truncate">{followup.inquiry.preferredLocation || '-'}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2 hidden xl:table-cell">
                                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 max-w-[180px] truncate">
                                      {followup.message || '-'}
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2 hidden lg:table-cell">
                                    {followup.nextFollowUpDate ? (
                                      <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                        <Calendar className="h-3 w-3 shrink-0" />
                                        <span className="whitespace-nowrap">
                                          {new Date(followup.nextFollowUpDate).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 sm:px-4 md:px-6 py-2 text-center">
                                    {followup.inquiry._id ? (
                                      <button
                                        onClick={() => handleViewInquiry(followup.inquiry._id!)}
                                        className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-300 border border-primary-200 dark:border-primary-800 transition-all duration-200 hover:scale-110 active:scale-95 shadow-sm hover:shadow-md group"
                                        title="View Inquiry Details"
                                      >
                                        <Eye className="h-4 w-4 sm:h-5 sm:w-5 group-hover:scale-110 transition-transform" />
                                      </button>
                                    ) : (
                                      <span className="text-gray-400 text-[10px] sm:text-xs">-</span>
                                    )}
                                  </td>
                                </motion.tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SalesUserDetailsModal;
