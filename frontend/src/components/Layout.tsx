import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

const Layout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // For sales users: Redirect to pending inquiry if there's one and user is not on that page
  useEffect(() => {
    if (user?.role === 'sales') {
      const pendingInquiryId = localStorage.getItem('pendingSalesFollowUp');
      if (pendingInquiryId && !location.pathname.includes(`/inquiries/${pendingInquiryId}`)) {
        // Check if we're already navigating to the inquiry page
        if (!location.pathname.startsWith('/inquiries/')) {
          navigate(`/inquiries/${pendingInquiryId}`);
        }
      }
    }
  }, [location.pathname, user?.role, navigate]);

  return (
    <div className="flex h-screen bg-[#F2F4F7] dark:bg-gray-900 font-sans overflow-hidden">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Now a direct child of the flex row container */}
      <Sidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        onMobileMenuClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Layout (Navbar + Content) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* Top Navbar - Floating Card Style, now inside the right column */}
        <div className="px-4 lg:px-6 pt-4 pb-0 z-30 shrink-0">
           <Navbar onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
        </div>

        {/* Main Content Area - Floating Card Style */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 lg:px-6 py-4">
          <div className="bg-white dark:bg-[#111319] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-none min-h-full flex flex-col border border-gray-100 dark:border-gray-800">
             <div className="flex-1 p-4 sm:p-5 lg:p-6">
               <Outlet />
             </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
