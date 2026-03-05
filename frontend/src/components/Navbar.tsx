import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { User, LogOut, Plus, Menu, Search, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

import { useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import apiService from '@/services/api';
import { CourseType, LocationType, MediumType, InquiryStatus, Inquiry } from '@/types';
import CreateInquiryModal from './CreateInquiryModal';
import Tooltip from './Tooltip';

interface NavbarProps {
  onMenuClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowUserMenu(false);
        setShowSearchResults(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showUserMenu, showSearchResults]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Determine which departments to search based on user role
  const getSearchDepartments = useCallback(() => {
    if (!user) return [];
    if (user.role === 'admin') return ['presales', 'sales'];
    if (user.role === 'presales') return ['presales', 'sales']; // Presales can search both departments
    if (user.role === 'sales') return ['sales'];
    return [];
  }, [user]);

  // Search inquiries
  const { data: searchResults, isLoading: isSearching } = useQuery(
    ['inquiry-search', debouncedSearchQuery, user?.role],
    () => {
      if (!debouncedSearchQuery.trim() || debouncedSearchQuery.length < 2) {
        return { data: { inquiries: [] } };
      }
      const departments = getSearchDepartments();
      // Search in all departments for admin, or specific department for presales/sales
      const searchPromises = departments.map(dept =>
        apiService.inquiries.getAll({
          search: debouncedSearchQuery,
          department: dept,
          limit: 5, // Limit results per department
          page: 1
        })
      );
      return Promise.all(searchPromises).then(results => {
        const allInquiries: Inquiry[] = [];
        results.forEach(result => {
          if (result?.data?.inquiries) {
            allInquiries.push(...result.data.inquiries);
          }
        });
        return { data: { inquiries: allInquiries.slice(0, 10) } }; // Limit total results to 10
      });
    },
    {
      enabled: !!debouncedSearchQuery && debouncedSearchQuery.length >= 2 && !!user,
      staleTime: 30 * 1000, // 30s – balance freshness with reduced API calls
      retry: false, // Do not retry search on failure
    }
  );

  const inquiries = searchResults?.data?.inquiries || [];

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowSearchResults(value.length >= 2);
  };

  const handleInquiryClick = (inquiryId: string) => {
    navigate(`/inquiries/${inquiryId}`);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleSearchFocus = () => {
    if (searchQuery.length >= 2) {
      setShowSearchResults(true);
    }
  };

  const handleCreateInquiry = () => {
    setIsCreateModalOpen(true);
  };

  const handleCreateInquirySubmit = async (data: {
    name: string;
    email: string;
    city: string;
    education: string;
    course: CourseType;
    preferredLocation: LocationType;
    medium: MediumType;
    message: string;
    status?: InquiryStatus;
  }) => {
    try {
      // Set default status based on user role
      const inquiryData = {
        ...data,
        status: data.status || 'warm' as InquiryStatus
      };

      await apiService.inquiries.create(inquiryData);

      // Refresh the appropriate queries based on current page
      queryClient.invalidateQueries(['inquiries']);
      queryClient.invalidateQueries(['my-inquiries']);
      queryClient.invalidateQueries(['dashboard-stats']);
      queryClient.invalidateQueries(['unattended-counts']);
      queryClient.invalidateQueries(['admin-dashboard-overview']);
      queryClient.invalidateQueries(['sales-dashboard-stats']);
      queryClient.invalidateQueries(['presales-dashboard-stats']);

      toast.success('Inquiry created successfully!');
      setIsCreateModalOpen(false);
    } catch (error: any) {
      console.error('Error creating inquiry:', error);
      const errorMessage = error?.response?.data?.message || 'Failed to create inquiry. Please try again.';
      toast.error(errorMessage);
      throw error;
    }
  };

  // No custom style object needed

  return (
    <header className="relative bg-white dark:bg-[#111319] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-none border border-gray-100 dark:border-gray-800 h-[56px] flex items-center transition-all z-30">
      <div className="px-4 w-full flex items-center">
        {/* Mobile Menu Toggle */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0 text-gray-600 dark:text-gray-400"
          aria-label="Toggle menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center justify-between w-full gap-4">
          {/* Search Bar */}
          {(user?.role === 'presales' || user?.role === 'sales' || user?.role === 'admin') && (
            <div className="flex-1  max-w-lg relative" ref={searchRef}>
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400 z-10" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={handleSearchFocus}
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-secondary-100 dark:bg-gray-800 hover:bg-[#EEF0F2] dark:hover:bg-gray-700/80 border-none rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400/20 transition-all font-medium"
                />

                {/* Clear button */}
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setShowSearchResults(false);
                    }}
                    className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors z-20 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}

                {/* Ctrl+K Hint */}
                {!searchQuery && (
                  <div className="absolute right-2.5 top-1/2 transform -translate-y-1/2 flex items-center gap-1 pointer-events-none select-none">
                    <kbd className="hidden sm:inline-flex items-center justify-center h-4 px-1 py-2.5 text-[10px] font-bold text-gray-400 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded shadow-sm">
                      ⌘K
                    </kbd>
                  </div>
                )}
              </div>

              {/* Search Results Dropdown */}
              {showSearchResults && debouncedSearchQuery.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 max-h-96 overflow-y-auto ring-1 ring-black/5">
                  {isSearching ? (
                    <div className="p-4 text-center text-xs text-gray-500">Searching...</div>
                  ) : inquiries.length > 0 ? (
                    <div className="py-1">
                      {inquiries.map((inquiry) => (
                        <button
                          key={inquiry._id}
                          onClick={() => handleInquiryClick(inquiry._id)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-50 dark:border-gray-700/50 last:border-0 group transition-colors"
                        >
                          <div className="font-medium text-sm text-gray-900 dark:text-white group-hover:text-primary-500 transition-colors">{inquiry.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px]">{inquiry.phone}</span>
                            {inquiry.course && (
                              <>
                                <span className="text-gray-300 dark:text-gray-600">•</span>
                                <span>{inquiry.course}</span>
                              </>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-gray-500">
                      <p>No results found for "{searchQuery}"</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Create Inquiry Button */}
            <Tooltip content="New Inquiry" position="bottom">
            <button
              onClick={handleCreateInquiry}
              className="flex items-center gap-1.5 bg-secondary-800 hover:bg-black text-white h-8 px-3 rounded-lg text-xs font-medium shadow-sm transition-all active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New Inquiry</span>
            </button>
            </Tooltip>

            <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-0.5 hidden sm:block"></div>

            {/* User menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2.5 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ring-1 ring-transparent hover:ring-gray-200 dark:hover:ring-gray-700 group"
              >
                <div className="relative">
                  <div className="h-8 w-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center shrink-0 border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <User className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                  </div>
                  <div className="absolute bottom-0 right-0 h-2 w-2 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full"></div>
                </div>
                <div className="hidden sm:block text-left mr-1">
                  <div className="text-xs font-semibold text-gray-900 dark:text-white leading-none">{user?.name?.split(' ')[0]}</div>
                  <div className="text-[9px] font-medium text-gray-500 uppercase tracking-wider mt-0.5">{user?.role}</div>
                </div>
                <div className="hidden sm:block text-gray-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>

              {/* User dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 z-50 py-1 animation-fade-in-up">
                  <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {user?.name || 'User'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {user?.email}
                    </p>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={logout}
                      className="flex items-center w-full px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors rounded-lg font-medium"
                    >
                      <LogOut className="h-3.5 w-3.5 mr-2" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {showUserMenu && (
            <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
          )}
        </div>
      </div>

      {/* Create Inquiry Modal */}
      <CreateInquiryModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateInquirySubmit}
        hideStatus={false}
      />
    </header>
  );
};

export default Navbar;
