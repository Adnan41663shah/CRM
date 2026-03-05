import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Files,
  Phone,
  Briefcase,
  ClipboardCheck,
  Calendar,
  PenTool,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  MapPin,
  ChevronDown,
  ChevronUp,
  X,
  GraduationCap,
  FileBarChart,
  TrendingUp,
  Activity,
  Database,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useQuery } from 'react-query';
import apiService from '@/services/api';
import { cn } from '@/utils/cn';
import Tooltip from './Tooltip';

interface SidebarProps {
  isMobileMenuOpen: boolean;
  onMobileMenuClose: () => void;
}

const SIDEBAR_ACTIVE_PATH_KEY = 'crm-sidebar-active-path';

// Map fromPage (from navigation state) to sidebar path for inquiry detail pages
const FROM_PAGE_TO_PATH: Record<string, string> = {
  'inquiries': '/inquiries',
  'presales-inquiries': '/admin/presales-inquiries',
  'sales-inquiries': '/admin/sales-inquiries',
};

const Sidebar: React.FC<SidebarProps> = ({ isMobileMenuOpen, onMobileMenuClose }) => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  // Determine effective active path for sidebar highlighting (persists when on inquiry detail or other sub-pages)
  const isInquiryDetailPage = /^\/inquiries\/[^/]+$/.test(location.pathname);
  const effectiveActivePath = React.useMemo(() => {
    if (isInquiryDetailPage) {
      const state = location.state as { fromPage?: string; centerLocation?: string } | undefined;
      if (state?.fromPage === 'center-inquiries' && state?.centerLocation) {
        return `/centers/${encodeURIComponent(state.centerLocation)}`;
      }
      if (state?.fromPage && FROM_PAGE_TO_PATH[state.fromPage]) {
        return FROM_PAGE_TO_PATH[state.fromPage];
      }
      const stored = sessionStorage.getItem(SIDEBAR_ACTIVE_PATH_KEY);
      return stored || '/inquiries';
    }
    return location.pathname;
  }, [location.pathname, location.state, isInquiryDetailPage]);

  // Persist current path when on a list/dashboard page (not inquiry detail) so sidebar stays highlighted when navigating to detail
  React.useEffect(() => {
    if (!isInquiryDetailPage) {
      sessionStorage.setItem(SIDEBAR_ACTIVE_PATH_KEY, location.pathname);
    }
  }, [location.pathname, isInquiryDetailPage]);

  // Check if we're on a centers page (or came from one when on inquiry detail)
  const isCentersPage = effectiveActivePath.startsWith('/centers/');
  const [centersOpen, setCentersOpen] = React.useState(isCentersPage);
  
  // Mobile Dashboard Expand State
  const [mobileDashboardOpen, setMobileDashboardOpen] = React.useState(() => {
    return location.pathname === '/dashboard' && (new URLSearchParams(location.search).has('tab'));
  });

  // Floating menu state for collapsed sidebar and dashboard hover
  const [floatingMenuOpen, setFloatingMenuOpen] = React.useState(false);
  const [floatingMenuType, setFloatingMenuType] = React.useState<'centers' | 'dashboard' | null>(null);
  const [floatingMenuTop, setFloatingMenuTop] = React.useState(0);
  const closeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (e: React.MouseEvent, type: 'centers' | 'dashboard') => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setFloatingMenuTop(rect.top);
    setFloatingMenuType(type);
    setFloatingMenuOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setFloatingMenuOpen(false);
      setFloatingMenuType(null); // Optional: clear type after closing
    }, 200);
  };

  const handleMenuMouseEnter = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  };

  const handleMenuMouseLeave = () => {
    setFloatingMenuOpen(false);
  };

  // Auto-open centers menu if on centers page
  React.useEffect(() => {
    if (isCentersPage) {
      setCentersOpen(true);
    }
  }, [isCentersPage]);

  // Fetch locations for Centers submenu
  const { data: optionsData } = useQuery(
    'options',
    () => apiService.options.get(),
    { staleTime: 5 * 60 * 1000, enabled: user?.role === 'presales' || user?.role === 'sales' || user?.role === 'admin' }
  );
  const locations: string[] = optionsData?.data?.locations || ['Nagpur', 'Pune', 'Nashik', 'Indore'];

  // Fetch unattended inquiry counts – 60s polling to reduce API calls (excluded from socket invalidation)
  const { data: countsData } = useQuery(
    'unattended-counts',
    () => apiService.inquiries.getUnattendedCounts(),
    {
      staleTime: 90000,
      refetchOnWindowFocus: false,
      refetchInterval: 60000,
      enabled: user?.role === 'presales' || user?.role === 'sales' || user?.role === 'admin'
    }
  );
  const unattendedCounts = countsData?.data || { total: 0, byLocation: {} };

  const sidebarItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['presales', 'sales', 'admin'],
    },
    {
      label: 'All Inquiries',
      href: '/inquiries',
      icon: Files,
      roles: ['presales', 'admin'],
    },
    {
      label: 'Presales Inquiries',
      href: '/admin/presales-inquiries',
      icon: Phone,
      roles: ['admin'],
    },
    {
      label: 'Sales Inquiries',
      href: '/admin/sales-inquiries',
      icon: Briefcase,
      roles: ['admin'],
    },
    {
      label: 'My Inquiries',
      href: '/sales/my-inquiries-unified',
      icon: ClipboardCheck,
      roles: ['sales'],
    },
    {
      label: 'My Follow-Ups',
      href: '/my-follow-ups',
      icon: Calendar,
      roles: ['presales'],
    },
    {
      label: 'My Follow-Ups',
      href: '/sales/my-follow-ups',
      icon: Calendar,
      roles: ['sales'],
    },
    {
      label: 'My Follow-Ups',
      href: '/admin/my-follow-ups',
      icon: Calendar,
      roles: ['admin'],
    },
    {
      label: 'My Raised Inquiries',
      href: '/my-inquiries',
      icon: PenTool,
      roles: ['presales'],
    },
    {
      label: 'My Inquiries',
      href: '/admin/my-inquiries-unified',
      icon: ClipboardCheck,
      roles: ['admin'],
    },

    {
      label: 'Conversions',
      href: '/conversions',
      icon: TrendingUp,
      roles: ['admin', 'sales'],
    },
    {
      label: 'Admissions',
      href: '/admitted-students',
      icon: GraduationCap,
      roles: ['admin', 'sales'],
    },
    {
      label: 'Reports',
      href: '/reports',
      icon: FileBarChart,
      roles: ['admin'],
    },
    {
      label: 'User Management',
      href: '/users',
      icon: Users,
      roles: ['admin'],
    },
    {
      label: 'Option Setting',
      href: '/manage-options',
      icon: Settings,
      roles: ['admin'],
    },
  ];

  const filteredItems = sidebarItems.filter(item =>
    user && item.roles.includes(user.role)
  );

  // Close mobile menu when a link is clicked
  const handleLinkClick = () => {
    onMobileMenuClose();
  };

  return (
    <>
      {/* Mobile Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col w-72 lg:hidden',
          'bg-[#F6F7F9] dark:bg-[#111319] border-r border-[#EAEAEA] dark:border-gray-800', 
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile Header */}
        <div className="px-6 py-4 border-b border-[#EAEAEA] dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900 dark:text-white">CRM</span>
          </div>
          <button
            onClick={onMobileMenuClose}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 transition-colors lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto scrollbar-hide">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = effectiveActivePath === item.href;
            
            // Logic for Dashboard Expansion (Admin only)
            const isDashboard = item.href === '/dashboard';
            const showDashboardSubmenu = isDashboard && user?.role === 'admin';
            
            // Logic for Centers Expansion (Attached to All Inquiries for Presales/Sales/Admin)
            // Note: Mirroring desktop logic where Centers is attached to Inquiries
            const isInquiries = item.href === '/inquiries';
            const showCentersSubmenu = (isInquiries && (user?.role === 'presales' || user?.role === 'admin')) || 
                                       (isDashboard && user?.role === 'sales');

            return (
              <React.Fragment key={item.href}>
                <div className="relative">
                  <NavLink
                    to={item.href}
                    onClick={handleLinkClick}
                    className={cn(
                      'group flex items-center gap-4 px-2 py-2 rounded-full transition-all duration-200 relative',
                      isActive ? 'bg-indigo-50 dark:bg-indigo-900/10' : 'hover:bg-white dark:hover:bg-gray-800'
                    )}
                  >
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 shadow-sm border",
                      isActive 
                        ? "bg-linear-to-br from-[#4F46E5] to-[#4338CA] border-transparent text-white shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-100 dark:ring-indigo-900/20" 
                        : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-400 group-hover:text-[#4F46E5] group-hover:border-indigo-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/10"
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    
                    <span className={cn(
                      "font-medium text-[15px] flex-1",
                      isActive ? "text-[#4F46E5] font-semibold" : "text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200"
                    )}>
                      {item.label}
                    </span>
                    
                    {/* Dashboard Toggle Button Only */}
                    {showDashboardSubmenu && (
                       <div 
                         role="button"
                         tabIndex={0}
                         className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 z-10"
                         onClick={(e) => {
                           e.preventDefault();
                           e.stopPropagation();
                           setMobileDashboardOpen(!mobileDashboardOpen);
                         }}
                       >
                          {mobileDashboardOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                       </div>
                    )}
                  </NavLink>
                </div>
                
                {/* Mobile Dashboard Submenu */}
                {showDashboardSubmenu && mobileDashboardOpen && (
                   <div className="pl-14 space-y-1 mt-1 mb-2 animate-in slide-in-from-top-2 duration-200">
                      {[
                        { label: 'Overview', tab: 'overview', icon: Activity },
                        { label: 'Data', tab: 'data', icon: Database }
                      ].map((subItem) => (
                         <NavLink
                           key={subItem.tab}
                           to={`/dashboard?tab=${subItem.tab}`}
                           onClick={handleLinkClick}
                           className={cn(
                             'flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors',
                             location.pathname === '/dashboard' && location.search.includes(`tab=${subItem.tab}`)
                               ? 'bg-[#4F46E5]/10 text-[#4F46E5] font-medium'
                               : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                           )}
                         >
                            <subItem.icon className="h-4 w-4" />
                            <span>{subItem.label}</span>
                         </NavLink>
                      ))}
                   </div>
                )}

                {/* Separate Mobile Centers Item */}
                {showCentersSubmenu && (
                   <>
                      <button
                        onClick={() => setCentersOpen(!centersOpen)}
                        className={cn(
                          'group flex items-center gap-4 px-2 py-2 w-full rounded-full transition-all duration-200 mt-1',
                          isCentersPage 
                            ? 'bg-indigo-50 dark:bg-indigo-900/10' 
                            : 'hover:bg-white dark:hover:bg-gray-800'
                        )}
                      >
                         {/* Circle Icon Placeholder - matching style */}
                         <div className={cn(
                           "h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 shadow-sm border bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-400 group-hover:text-[#4F46E5] group-hover:border-[#4F46E5]/30",
                           isCentersPage ? "border-[#4F46E5] text-[#4F46E5]" : ""
                         )}>
                            <MapPin className="h-5 w-5" />
                         </div>
                         
                         <span className={cn(
                             "font-medium text-[15px] flex-1 text-left",
                             isCentersPage ? "text-[#4F46E5]" : "text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200"
                           )}>
                             Centers
                         </span>
                         
                         <div className="p-2 -mr-2 text-gray-400">
                            {centersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                         </div>
                      </button>

                      {/* Mobile Centers Locations List */}
                      {centersOpen && (
                         <div className="pl-14 space-y-1 mt-1 mb-2 animate-in slide-in-from-top-2 duration-200">
                            {locations.map((locationName) => {
                              const locationPath = `/centers/${encodeURIComponent(locationName)}`;
                              const isLocationActive = effectiveActivePath === locationPath || effectiveActivePath.startsWith(locationPath + '/');
                              return (
                                <NavLink
                                  key={locationName}
                                  to={locationPath}
                                  onClick={handleLinkClick}
                                  className={cn(
                                    'flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors',
                                    isLocationActive
                                      ? 'bg-[#4F46E5]/10 text-[#4F46E5] font-medium'
                                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                  )}
                                >
                                  <span className="truncate">{locationName}</span>
                                  {unattendedCounts.byLocation[locationName] > 0 && (
                                     <span className="inline-flex items-center justify-center min-h-5 min-w-5 px-2 rounded-full text-[10px] font-bold tabular-nums text-white bg-red-500 shrink-0">
                                        {unattendedCounts.byLocation[locationName]}
                                     </span>
                                  )}
                                </NavLink>
                              );
                            })}
                         </div>
                      )}
                   </>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Mobile Footer - Theme Toggle */}
        <div className="p-4 border-t border-[#EAEAEA] dark:border-gray-800 flex items-center justify-between shrink-0">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Theme</span>
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-500 hover:text-[#4F46E5] hover:border-[#4F46E5]/30 transition-all"
            title="Toggle theme"
            aria-label="Toggle dark/light mode"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <aside
        className={cn(
          'hidden lg:flex flex-col transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] z-20 h-[96vh] relative top-4 left-4 rounded-xl border border-gray-100',
          'bg-white dark:bg-[#111319] border-r border-gray-100 dark:border-gray-800', 
          // Removed rounded corners and floating margins
          isCollapsed ? 'w-16' : 'w-[250px]'
        )}
      >
        {/* Brand */}
        <div className={cn(
          "flex items-center pt-3 px-6 mb-2",
          isCollapsed ? "justify-center px-0" : "justify-start"
        )}>
           <span className={cn(
             "font-bold text-gray-900 dark:text-white transition-all duration-300",
             isCollapsed ? "text-sm" : "text-lg"
           )}>CRM</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-hide py-3">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = effectiveActivePath === item.href;

            return (
              <React.Fragment key={item.href}>
                <Tooltip content={isCollapsed ? item.label : undefined} position="right">
                <NavLink
                  to={item.href}
                  onMouseEnter={(e) => {
                    if (item.href === '/dashboard' && user?.role === 'admin') {
                      handleMouseEnter(e, 'dashboard');
                    }
                  }}
                  onMouseLeave={() => {
                    if (item.href === '/dashboard' && user?.role === 'admin') {
                      handleMouseLeave();
                    }
                  }}
                  className={cn(
                    'group flex items-center gap-2.5 py-1.5 transition-all duration-200 rounded-full',
                    isCollapsed 
                      ? 'justify-center px-0' 
                      : isActive 
                        ? 'px-2.5 bg-indigo-50 dark:bg-indigo-900/10' 
                        : 'px-2.5 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                  )}
                >
                  {/* Icon Circle */}
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 shadow-sm border relative",
                    isActive 
                      ? "bg-linear-to-br from-[#4F46E5] to-[#4338CA] border-transparent text-white shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-100 dark:ring-indigo-900/20 scale-105" 
                      : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-400 group-hover:text-[#4F46E5] group-hover:border-indigo-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/10 group-hover:shadow-sm"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  
                  {/* Text Label */}
                  {!isCollapsed && (
                    <>
                      <span className={cn(
                        "font-semibold text-sm flex-1 transition-colors",
                         isActive ? "text-[#4F46E5] font-bold" : "text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200"
                      )}>
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
                </Tooltip>

                {/* Centers Submenu (Desktop) */}
                {((item.href === '/inquiries' && (user?.role === 'presales' || user?.role === 'admin')) || 
                  (item.href === '/dashboard' && user?.role === 'sales')) && (
                   <div className="space-y-0.5 mt-0.5 mb-1.5">
                       {isCollapsed ? (
                          /* Collapsed Center Trigger */
                          <div className="w-full flex justify-center py-2 relative group/center">
                              <Tooltip content="Centers" position="right">
                              <button
                                onMouseEnter={(e) => handleMouseEnter(e, 'centers')}
                                onMouseLeave={handleMouseLeave}
                                onClick={() => setCentersOpen(!centersOpen)}
                                className={cn(
                                   "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors bg-white dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700 shadow-sm relative",
                                    isCentersPage ? "border-[#4F46E5] text-[#4F46E5]" : "text-gray-400 hover:border-[#4F46E5]/30 hover:text-[#4F46E5]"
                                )}
                              >
                                 <MapPin className="h-4 w-4" />
                                 {(() => {
                                      const totalCenterCount = locations.reduce((sum, loc) => sum + (unattendedCounts.byLocation[loc] || 0), 0);
                                      return totalCenterCount > 0 ? (
                                          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white dark:border-[#111319]"></span>
                                      ) : null;
                                  })()}
                              </button>
                              </Tooltip>
                          </div>
                       ) : (
                         /* Expanded Center Menu */
                         <>
                           <button
                              onClick={() => setCentersOpen(!centersOpen)}
                              className={cn(
                                'group flex items-center gap-2.5 px-2.5 py-1.5 w-full rounded-full transition-all duration-200',
                                isCentersPage 
                                  ? 'bg-indigo-50 dark:bg-indigo-900/10' 
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              )}
                            >
                               <div className={cn(
                                 "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors bg-white dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700 shadow-sm",
                                 isCentersPage ? "border-[#4F46E5] text-[#4F46E5]" : "text-gray-400 group-hover:border-[#4F46E5]/30 group-hover:text-[#4F46E5]"
                               )}>
                                 <MapPin className="h-4 w-4" />
                               </div>
                               <span className={cn(
                                 "text-sm font-semibold flex-1 text-left",
                                 isCentersPage ? "text-[#4F46E5]" : "text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200"
                               )}>Centers</span>
                               {centersOpen ? <ChevronUp className="h-3 w-3 text-gray-400"/> : <ChevronDown className="h-3 w-3 text-gray-400"/>}
                           </button>

                           {centersOpen && (
                             <div className="ml-11 mt-0.5 space-y-0.5"> 
                                {locations.map((locationName) => {
                                   const locationPath = `/centers/${encodeURIComponent(locationName)}`;
                                   const isLocationActive = effectiveActivePath === locationPath || effectiveActivePath.startsWith(locationPath + '/');
                                   return (
                                     <NavLink
                                       key={locationName}
                                       to={locationPath}
                                       className={cn(
                                         'flex items-center justify-between gap-2 py-1 px-3 text-sm font-medium transition-colors relative rounded-md',
                                         isLocationActive 
                                           ? 'text-[#4F46E5] bg-indigo-50 dark:bg-indigo-900/10' 
                                           : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                       )}
                                     >
                                        <span className="truncate">{locationName}</span>
                                        {unattendedCounts.byLocation[locationName] > 0 && (
                                           <span className="inline-flex items-center justify-center min-h-5 min-w-5 px-2 rounded-full text-[10px] font-bold tabular-nums text-red-500 bg-red-50 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                                              {unattendedCounts.byLocation[locationName]}
                                           </span>
                                        )}
                                     </NavLink>
                                   )
                                })}
                             </div>
                           )}
                         </>
                       )}
                   </div>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Footer Toggle */}
        <div className="p-3 flex items-center justify-between border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#111319] rounded-b-2xl">
          <Tooltip content="Toggle Theme" position="right">
          <button
            onClick={toggleTheme}
            className={cn(
               "p-1.5 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-500 hover:text-[#4F46E5] hover:border-[#4F46E5]/30 transition-all",
               isCollapsed ? "hidden" : "block"
            )}
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          </Tooltip>
          
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "p-1.5 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-500 hover:text-[#4F46E5] hover:border-[#4F46E5]/30 transition-all",
              isCollapsed && "mx-auto"
            )}
          >
             {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>
      </aside>

      {/* Fixed Floating Menu for Collapsed Sidebar & Dashboard Hover */}
      {floatingMenuOpen && (isCollapsed || floatingMenuType === 'dashboard') && (
        <div
          className={cn(
            "fixed bg-white dark:bg-[#1a1c23] border border-gray-100 dark:border-gray-700 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.1)] z-9999 overflow-hidden py-2 transition-all duration-200",
             isCollapsed ? "left-16 w-56" : "left-[272px] w-48"
          )}
          style={{ top: floatingMenuTop }}
          onMouseEnter={handleMenuMouseEnter}
          onMouseLeave={handleMenuMouseLeave}
        >
          {floatingMenuType === 'centers' && (
             <div className="flex flex-col p-1">
                {locations.map((locationName) => {
                  const locationPath = `/centers/${encodeURIComponent(locationName)}`;
                  const isLocationActive = effectiveActivePath === locationPath || effectiveActivePath.startsWith(locationPath + '/');
                  const locationCount = unattendedCounts.byLocation[locationName] || 0;

                  return (
                    <NavLink
                      key={locationName}
                      to={locationPath}
                      onClick={() => setFloatingMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors',
                        isLocationActive 
                           ? 'bg-[#4F46E5]/10 text-[#4F46E5] font-medium' 
                           : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      )}
                    >
                      <MapPin className="h-4 w-4" />
                      <span>{locationName}</span>
                      {locationCount > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center min-h-5 min-w-5 px-2 rounded-full text-[10px] font-bold tabular-nums text-white bg-red-500 shrink-0">
                          {locationCount}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
             </div>

          )}

          {floatingMenuType === 'dashboard' && (
            <>
              <div className="flex flex-col p-1">
                {[
                  { label: 'Overview', tab: 'overview', icon: Activity },
                  { label: 'Data', tab: 'data', icon: Database }
                ].map((item) => (
                  <NavLink
                    key={item.tab}
                    to={`/dashboard?tab=${item.tab}`}
                    onClick={() => setFloatingMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors',
                      location.pathname === '/dashboard' && location.search.includes(`tab=${item.tab}`)
                        ? 'bg-[#4F46E5]/10 text-[#4F46E5] font-medium'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default Sidebar;
