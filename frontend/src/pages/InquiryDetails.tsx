import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import {
  ArrowLeft,
  User as UserIcon,
  Mail,
  Phone,
  MapPin,
  BookOpen,
  Building,
  MessageSquare,
  Thermometer,
  Clock,
  FileText,
  UserCheck,
  Plus,
  Edit,
  Calendar,
  Activity as ActivityIcon,
  Send,
  UserPlus,
  Copy,
  Check
} from 'lucide-react';
import { motion } from 'framer-motion';
import apiService from '@/services/api';
import { toast } from 'react-toastify';
import { Inquiry, FollowUp, InquiryStatus } from '@/types';
import type { User as AppUser } from '@/types';
import { getStatusColor as getStatusColorHelper } from '@/utils/constants';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import FollowUpModal from '@/components/FollowUpModal';
import SalesFollowUpModal from '@/components/SalesFollowUpModal';
import EditInquiryModal from '@/components/EditInquiryModal';
import WhatsAppButton from '@/components/WhatsAppButton';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getLeadStageBadgeClasses, LeadStageConfig } from '@/utils/leadStageColors';

const InquiryDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const queryClient = useQueryClient();

  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isSalesFollowUpModalOpen, setIsSalesFollowUpModalOpen] = useState(() => {
    // Initialize from localStorage to persist modal after refresh (only for sales inquiries)
    if (typeof window !== 'undefined' && id) {
      const pendingInquiryId = localStorage.getItem('pendingSalesFollowUp');
      return pendingInquiryId === id;
    }
    return false;
  });
  const [editingFollowUp, setEditingFollowUp] = useState<FollowUp | null>(null);
  const [salesUsers, setSalesUsers] = useState<AppUser[]>([]);
  const [selectedSales, setSelectedSales] = useState<string>('');
  const [showReassignSalesModal, setShowReassignSalesModal] = useState(false);
  const [reassignSalesSearch, setReassignSalesSearch] = useState('');
  const [isForwarding, setIsForwarding] = useState(false);
  const [showForwardConfirm, setShowForwardConfirm] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);

  const { data, isLoading, error, refetch } = useQuery(
    ['inquiry', id],
    () => apiService.inquiries.getById(id!),
    {
      enabled: !!id,
    }
  );

  // Fetch activities for the inquiry
  const { data: activitiesData, isLoading: activitiesLoading } = useQuery(
    ['inquiry-activities', id],
    () => apiService.inquiries.getActivities(id!),
    {
      enabled: !!id,
      staleTime: 30000, // Cache for 30 seconds
    }
  );

  // Fetch options for dynamic lead stage colors
  const { data: optionsData } = useQuery(
    'options',
    () => apiService.options.get(),
    { staleTime: 60 * 1000 }
  );

  const leadStagesConfig: LeadStageConfig[] = useMemo(() => {
    return optionsData?.data?.leadStages || [];
  }, [optionsData?.data?.leadStages]);

  const inquiry: Inquiry | undefined = data?.data?.inquiry;

  // Merge real activities with a synthetic "note" entry for the original inquiry message.
  // Sorted newest-first so it slots in chronologically. Works for all existing inquiries too.
  const displayActivities = useMemo(() => {
    const base: any[] = activitiesData?.data?.activities || [];
    if (!inquiry?.message) return base;
    const noteEntry = {
      type: 'note',
      details: 'Inquiry note',
      timestamp: inquiry.createdAt,
      noteContent: inquiry.message,
    };
    return [...base, noteEntry].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [activitiesData, inquiry?.message, inquiry?.createdAt]);

  const getId = (u: any | undefined | null): string | undefined => {
    if (!u) return undefined;
    // Support both API shapes: { id } and { _id }
    // Handle ObjectId, string, and populated object cases
    if (typeof u === 'string') return u;
    // Try id first (Mongoose virtual), then _id, then $oid (MongoDB extended JSON)
    const id = (u as any).id || (u as any)._id || (u as any).$oid;
    if (!id) return undefined;
    // Handle nested ObjectId format and convert to string
    if (typeof id === 'object' && id.$oid) return String(id.$oid);
    return String(id);
  };

  // Helper to compare two IDs (handles various formats)
  const idsMatch = (id1: any, id2: any): boolean => {
    const str1 = getId(id1);
    const str2 = getId(id2);
    if (!str1 || !str2) return false;
    return str1 === str2;
  };

  // Presales users can create/edit follow-ups for any presales inquiry (no attendance required)
  // Admin can add follow-ups to any presales inquiry (no assignment required)
  const canAddFollowUp = !!(
    user &&
    inquiry?.department === 'presales' &&
    (
      user.role === 'presales' || // Any presales user can add follow-ups
      user.role === 'admin' // Admin can add follow-ups to any presales inquiry
    )
  );

  // Helper to check if the current user has created at least one follow-up
  // Using a function call instead of useMemo to ensure it recalculates on every render
  const checkUserHasCreatedFollowUp = (): boolean => {
    if (!user || !inquiry?.followUps || inquiry.followUps.length === 0) return false;

    const userId = String(user.id || (user as any)._id);
    return inquiry.followUps.some((fu: any) => {
      const followUpCreatedById = getId(fu.createdBy);
      // Compare as strings after normalizing
      return followUpCreatedById && String(followUpCreatedById) === userId;
    });
  };

  const userHasCreatedFollowUp = checkUserHasCreatedFollowUp();

  // Check if the inquiry has any follow-ups (fallback for when user ID comparison fails)
  const inquiryHasFollowUps = inquiry?.followUps && inquiry.followUps.length > 0;

  // Only assigned Sales user or Admin (for sales inquiries) can create/edit sales follow-ups
  // But only after they have attended the inquiry (created at least one follow-up)
  // Use inquiryHasFollowUps as a fallback if user ID comparison fails
  const canAddSalesFollowUp = !!(
    user &&
    inquiry?.department === 'sales' &&
    idsMatch(inquiry?.assignedTo, user.id || (user as any)._id) &&
    (user.role === 'sales' || user.role === 'admin') &&
    (userHasCreatedFollowUp || inquiryHasFollowUps)
  );

  // Check if user can attend (claim) the inquiry
  // For admin: only allow attending sales inquiries (not presales)
  // Admin can attend sales inquiries even if there's a pending follow-up for another inquiry
  const canAttend = useMemo(() => {
    // Early return if data not loaded
    if (!user || !inquiry) {
      return false;
    }

    // Inquiry must not be assigned - use getId helper to check if assignedTo has an ID
    const assignedToId = getId(inquiry.assignedTo);
    if (assignedToId) {
      return false;
    }

    // Check role and department match
    const userRole = user.role;
    const inquiryDepartment = inquiry.department;

    // Presales users no longer need to attend - explicitly exclude them
    if (userRole === 'presales') {
      return false;
    }

    // Admin can only attend sales inquiries (not presales)
    const isAdmin = userRole === 'admin' && inquiryDepartment === 'sales';
    const isSalesViewingSales = userRole === 'sales' && inquiryDepartment === 'sales';

    const roleDepartmentMatch = isAdmin || isSalesViewingSales;

    if (!roleDepartmentMatch) {
      return false;
    }

    // For sales users: Check if there's no pending follow-up for another inquiry
    // Admin can attend sales inquiries even if there's a pending follow-up (more flexibility)
    if (userRole === 'sales') {
      const pendingInquiryId = localStorage.getItem('pendingSalesFollowUp');
      if (pendingInquiryId && pendingInquiryId !== inquiry._id) {
        return false; // There's a pending follow-up for another inquiry
      }
    }
    // Admin can always attend unassigned sales inquiries (no pending follow-up check)

    return true;
  }, [user, inquiry, inquiry?.assignedTo, inquiry?.department, inquiry?._id]);

  const handleClaim = async () => {
    if (!inquiry || !id) return;

    // For sales users only: Check if there's already a pending follow-up
    // Admin can attend even if there's a pending follow-up for another inquiry
    if (user?.role === 'sales' && inquiry.department === 'sales') {
      const pendingInquiryId = localStorage.getItem('pendingSalesFollowUp');
      if (pendingInquiryId && pendingInquiryId !== id) {
        toast.error('Please complete the follow-up for the previously attended inquiry before attending a new one.');
        return;
      }
    }

    try {
      await apiService.inquiries.claim(id);
      toast.success('Inquiry claimed successfully!');

      // For sales users and admin (for sales inquiries): Store inquiry ID and follow-up count, then open follow-up modal
      if ((user?.role === 'sales' || user?.role === 'admin') && inquiry.department === 'sales') {
        localStorage.setItem('pendingSalesFollowUp', id);
        // Store the current follow-up count to track if a new follow-up is created
        const currentFollowUpCount = inquiry.followUps ? inquiry.followUps.length : 0;
        localStorage.setItem(`followUpCount_${id}`, currentFollowUpCount.toString());
        setEditingFollowUp(null);
        // Open modal immediately before refetch
        setIsSalesFollowUpModalOpen(true);
      }

      // Invalidate queries to refresh the data
      queryClient.invalidateQueries(['inquiry', id]);
      queryClient.invalidateQueries(['inquiries']);
      queryClient.invalidateQueries(['dashboard-stats']);
      queryClient.invalidateQueries(['admin-dashboard-overview']);
      queryClient.invalidateQueries(['sales-dashboard-stats']);
      queryClient.invalidateQueries(['presales-dashboard-stats']);
      queryClient.invalidateQueries(['sales-assigned']);
      queryClient.invalidateQueries(['presales-assigned']);

      // For sales inquiries, ensure modal stays open after refetch
      if ((user?.role === 'sales' || user?.role === 'admin') && inquiry.department === 'sales') {
        // Refetch the inquiry to get updated data
        await refetch();

        // Ensure modal stays open after refetch
        const pendingInquiryId = localStorage.getItem('pendingSalesFollowUp');
        if (pendingInquiryId === id) {
          setIsSalesFollowUpModalOpen(true);
        }
      } else {
        // For non-sales inquiries, just refetch normally
        await refetch();
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || 'Failed to claim inquiry. Please try again.';
      toast.error(errorMessage);
    }
  };

  const handleFollowUpSuccess = async () => {
    await refetch();
    setIsFollowUpModalOpen(false);
    setEditingFollowUp(null);

    queryClient.invalidateQueries(['inquiry', id]);
    queryClient.invalidateQueries(['inquiry-activities', id]);
    queryClient.invalidateQueries(['inquiries']);
    queryClient.invalidateQueries(['my-follow-ups']);
    queryClient.invalidateQueries(['sales-assigned']);
    queryClient.invalidateQueries(['presales-assigned']);
    queryClient.invalidateQueries(['dashboard-stats']);
    queryClient.invalidateQueries(['admin-dashboard-overview']);
    queryClient.invalidateQueries(['sales-dashboard-stats']);
    queryClient.invalidateQueries(['presales-dashboard-stats']);
  };

  const handleSalesFollowUpSuccess = async () => {
    // Clear pending follow-up from localStorage when successfully created
    if (id && localStorage.getItem('pendingSalesFollowUp') === id) {
      localStorage.removeItem('pendingSalesFollowUp');
      localStorage.removeItem(`followUpCount_${id}`);
    }

    // Close the modal first
    setIsSalesFollowUpModalOpen(false);
    setEditingFollowUp(null);

    // Wait a bit to ensure backend has processed the follow-up
    await new Promise(resolve => setTimeout(resolve, 500));

    // Invalidate all related queries first to force fresh data
    await queryClient.invalidateQueries(['inquiry', id]);
    await queryClient.invalidateQueries(['inquiry-activities', id]);
    await queryClient.invalidateQueries(['inquiries']);
    await queryClient.invalidateQueries(['my-follow-ups']);
    await queryClient.invalidateQueries(['sales-assigned']);
    await queryClient.invalidateQueries(['presales-assigned']);
    await queryClient.invalidateQueries(['dashboard-stats']);
    await queryClient.invalidateQueries(['admin-dashboard-overview']);
    await queryClient.invalidateQueries(['sales-dashboard-stats']);
    await queryClient.invalidateQueries(['presales-dashboard-stats']);

    // Refetch the inquiry to get updated data with the new follow-up
    // This is critical for the buttons to appear
    await refetch();

    // Refetch sales-assigned queries to update "My Attended Inquiries" page
    await queryClient.refetchQueries(['sales-assigned'], { active: true, exact: false });
    queryClient.invalidateQueries(['my-follow-ups']);
    queryClient.invalidateQueries(['sales-my-follow-ups']);
  };

  // Prevent navigation/refresh when there's a pending follow-up
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const pendingInquiryId = localStorage.getItem('pendingSalesFollowUp');
      if (pendingInquiryId && id === pendingInquiryId && inquiry && inquiry.department === 'sales' && (user?.role === 'sales' || user?.role === 'admin')) {
        const storedCount = localStorage.getItem(`followUpCount_${id}`);
        if (storedCount) {
          const storedCountNum = parseInt(storedCount, 10);
          const currentCount = inquiry.followUps ? inquiry.followUps.length : 0;
          if (currentCount <= storedCountNum) {
            e.preventDefault();
            e.returnValue = 'You have a pending follow-up that must be completed. Are you sure you want to leave?';
            return e.returnValue;
          }
        } else {
          e.preventDefault();
          e.returnValue = 'You have a pending follow-up that must be completed. Are you sure you want to leave?';
          return e.returnValue;
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [id, inquiry, user?.role]);

  useEffect(() => {
    // Fetch sales users for both sales and admin roles
    if (user?.role === 'sales' || user?.role === 'admin') {
      apiService.users.getAll({ role: 'sales', isActive: true, limit: 100 }).then((res) => {
        const list = res.data?.users || [];
        // For sales users, exclude themselves; for admin, show all sales users
        if (user.role === 'sales') {
          setSalesUsers(list.filter((u: AppUser) => getId(u) !== user.id));
        } else {
          setSalesUsers(list);
        }
      }).catch(() => {
        // Silently handle error - user list is optional
      });
    }
  }, [user?.role, user?.id]); // Only depend on role and id to prevent duplicate calls

  // Check for pending follow-up on mount and when inquiry loads (for sales users and admin for sales inquiries)
  // This ensures the modal persists after refresh, tab close, logout, and after login
  useEffect(() => {
    if (!id || !user) return;

    const pendingInquiryId = localStorage.getItem('pendingSalesFollowUp');

    // Only process if there's a pending follow-up for this inquiry and user is sales/admin
    if (pendingInquiryId === id && (user.role === 'sales' || user.role === 'admin')) {
      // If inquiry is loaded, verify it's a sales inquiry and user is assigned
      if (inquiry) {
        if (inquiry.department === 'sales' && inquiry.assignedTo && idsMatch(inquiry.assignedTo, user.id || (user as any)._id)) {
          const storedCount = localStorage.getItem(`followUpCount_${id}`);
          const currentCount = inquiry.followUps ? inquiry.followUps.length : 0;

          // If no stored count, this is a fresh claim - store the current count and open modal
          if (!storedCount) {
            localStorage.setItem(`followUpCount_${id}`, currentCount.toString());
            setIsSalesFollowUpModalOpen(true);
          } else {
            // Check if a new follow-up was created (current count > stored count)
            const storedCountNum = parseInt(storedCount, 10);

            if (currentCount > storedCountNum) {
              // New follow-up was created, clear the pending flag
              localStorage.removeItem('pendingSalesFollowUp');
              localStorage.removeItem(`followUpCount_${id}`);
              setIsSalesFollowUpModalOpen(false);
            } else {
              // No new follow-up yet, ensure modal is open
              setIsSalesFollowUpModalOpen(true);
            }
          }
        } else if (inquiry.department === 'sales') {
          // Sales inquiry but user not assigned yet (might be right after claim, before refetch completes)
          // Keep modal open if pending flag exists
          const storedCount = localStorage.getItem(`followUpCount_${id}`);
          if (storedCount !== null) {
            setIsSalesFollowUpModalOpen(true);
          }
        } else {
          // Inquiry doesn't match conditions, but pending flag exists - clear it
          localStorage.removeItem('pendingSalesFollowUp');
          localStorage.removeItem(`followUpCount_${id}`);
          setIsSalesFollowUpModalOpen(false);
        }
      } else {
        // Inquiry not loaded yet, but pending flag exists - keep modal state as initialized
        // Modal will be verified when inquiry loads
      }
    } else if (pendingInquiryId !== id) {
      // No pending follow-up for this inquiry - ensure modal is closed
      setIsSalesFollowUpModalOpen(false);
    }
  }, [inquiry, user?.role, user?.id, id]);

  // Forward to Sales button - any presales user can forward (no attendance required)
  const canForward = !!(
    user &&
    inquiry &&
    inquiry.department === 'presales' &&
    (user.role === 'presales' || user.role === 'admin')
  );

  // Presales users can edit any inquiry in presales department (no attendance required)
  // Sales users can edit inquiry if they have attended it (assigned to them)
  // Admin users can edit any presales inquiry (no assignment required) or sales inquiry if assigned
  const canEditInquiry = !!( 
    user &&
    inquiry &&
    (
      // Presales: can edit any inquiry in presales department (no attendance required)
      (user.role === 'presales' && inquiry.department === 'presales') ||
      // Sales: can edit if attended (assigned to them)
      (user.role === 'sales' &&
       inquiry.department === 'sales' &&
       idsMatch(inquiry.assignedTo, user.id || (user as any)._id)) ||
      // Admin: can edit any presales inquiry or sales inquiry if assigned
      (user.role === 'admin' &&
       (
         inquiry.department === 'presales' || // Admin can edit any presales inquiry
         (inquiry.department === 'sales' && idsMatch(inquiry.assignedTo, user.id || (user as any)._id)) // Admin can edit sales inquiry if assigned
       ))
    )
  );
  // WhatsApp visibility rules:
  // Presales inquiries: visible to everyone who can view the inquiry
  // Sales inquiries: visible only to the attending user after attendance
  const canWhatsApp = !!(
    user &&
    inquiry?.phone &&
    (
      inquiry.department === 'presales' ||
      (
        inquiry.department === 'sales' &&
        idsMatch(inquiry.assignedTo, user.id || (user as any)._id) &&
        (userHasCreatedFollowUp || inquiryHasFollowUps)
      )
    )
  );

  // Reassign to Sales User button should only show after the inquiry has been attended
  // (assigned user has created at least one follow-up)
  // Use inquiryHasFollowUps as a fallback if user ID comparison fails
  const canReassignSales = !!(
    user &&
    inquiry &&
    inquiry.department === 'sales' &&
    idsMatch(inquiry.assignedTo, user.id || (user as any)._id) &&
    (user.role === 'sales' || user.role === 'admin') &&
    (userHasCreatedFollowUp || inquiryHasFollowUps)
  );


  const handleForwardToSales = async () => {
    if (!inquiry) return;
    try {
      setIsForwarding(true);
      await apiService.inquiries.forwardToSales(inquiry._id);
      toast.success('Inquiry forwarded to sales successfully!');
      setShowForwardConfirm(false);
      queryClient.invalidateQueries(['inquiries']);
      queryClient.invalidateQueries(['inquiry-activities', id]);
      queryClient.invalidateQueries(['dashboard-stats']);
      queryClient.invalidateQueries(['unattended-counts']);
      queryClient.invalidateQueries(['admin-dashboard-overview']);
      queryClient.invalidateQueries(['sales-dashboard-stats']);
      queryClient.invalidateQueries(['presales-dashboard-stats']);
      navigate('/dashboard');
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || 'Failed to forward inquiry to sales. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsForwarding(false);
    }
  };

  const handleReassignToSales = async () => {
    if (!inquiry || !selectedSales) return;
    try {
      setIsForwarding(true);
      await apiService.inquiries.reassignToSales(inquiry._id, selectedSales);
      const newUser = salesUsers.find(u => getId(u) === selectedSales);
      toast.success(`Inquiry reassigned to ${newUser?.name || 'selected user'} successfully!`);
      setSelectedSales('');
      setShowReassignSalesModal(false);
      queryClient.invalidateQueries(['inquiries']);
      queryClient.invalidateQueries(['inquiry-activities', id]);
      queryClient.invalidateQueries(['dashboard-stats']);
      queryClient.invalidateQueries(['unattended-counts']);
      queryClient.invalidateQueries(['admin-dashboard-overview']);
      queryClient.invalidateQueries(['sales-dashboard-stats']);
      queryClient.invalidateQueries(['presales-dashboard-stats']);
      if (user?.role === 'sales') {
        navigate('/sales/my-inquiries-unified');
      } else {
        navigate('/inquiries');
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || 'Failed to reassign inquiry. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsForwarding(false);
    }
  };

  const handleCopyPhone = async () => {
    if (!inquiry?.phone) return;
    try {
      await navigator.clipboard.writeText(inquiry.phone);
      setPhoneCopied(true);
      setTimeout(() => {
        setPhoneCopied(false);
      }, 2000); // Reset after 2 seconds (blink effect)
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = inquiry.phone;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setPhoneCopied(true);
        setTimeout(() => {
          setPhoneCopied(false);
        }, 2000);
      } catch (err) {
        toast.error('Failed to copy phone number');
      }
      document.body.removeChild(textArea);
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64 sm:min-h-96">
        <LoadingSpinner size="lg" label="Loading inquiry..." />
      </div>
    );
  }

  if (error || !inquiry) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
              Inquiry Not Found
            </h1>
            <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
              The inquiry you're looking for doesn't exist or has been removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Use helper function from constants for status color
  const getStatusColor = (status: InquiryStatus) => {
    return getStatusColorHelper(status);
  };

  // Check if inquiry is forwarded to sales (for presales users)
  const isForwardedToSales = inquiry.assignmentStatus === 'forwarded_to_sales' && inquiry.department === 'sales';

  // No gradient - use solid backgrounds matching new theme
  const cardBackground = theme === 'dark'
    ? 'bg-secondary-800/50 backdrop-blur-sm'
    : 'bg-white/80 backdrop-blur-sm';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Top Row: Back Button, Title, and Action Buttons (on lg screens) */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-secondary-900 dark:text-white truncate">
              Inquiry Details
            </h1>
          </div>
          
          {/* Action Buttons - Visible on lg screens (1024px+) in line with heading */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            {canAttend && (
              <button
                onClick={handleClaim}
                className="btn btn-primary text-xs sm:text-sm px-2 sm:px-3 py-2 sm:py-2.5 flex items-center justify-center whitespace-nowrap shrink-0"
              >
                <UserCheck className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                Attend
              </button>
            )}
            {canWhatsApp && (
              <WhatsAppButton
                phone={inquiry.phone}
                inquiryId={inquiry._id}
                userName={user?.name}
              />
            )}
            {canAddFollowUp && (
              <button
                onClick={() => {
                  setEditingFollowUp(null);
                  setIsFollowUpModalOpen(true);
                }}
                className="text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 transition-all duration-200 hover:bg-black hover:dark:bg-black hover:text-white hover:border-transparent"
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5 shrink-0" />
                <span>Add Follow-Up</span>
              </button>
            )}
            {canAddSalesFollowUp && (
              <button
                onClick={() => {
                  setEditingFollowUp(null);
                  setIsSalesFollowUpModalOpen(true);
                }}
                className="text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-900 dark:border-gray-600 transition-all duration-200 hover:bg-black hover:dark:bg-black hover:text-white hover:border-transparent"
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5 shrink-0" />
                <span>Add Follow-Up</span>
              </button>
            )}
            {canForward && (
              <button
                className="text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 transition-all duration-200 hover:bg-black hover:dark:bg-black hover:text-white hover:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setShowForwardConfirm(true)}
                disabled={isForwarding}
              >
                <span>Forward to Sales</span>
              </button>
            )}
            {canReassignSales && (
              <button
                className="text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 transition-all duration-200 hover:bg-black hover:dark:bg-black hover:text-white hover:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setShowReassignSalesModal(true)}
                disabled={isForwarding}
              >
                <span>Reassign</span>
              </button>
            )}
            {canEditInquiry && (
              <button
                className="text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 transition-all duration-200 hover:bg-black hover:dark:bg-black hover:text-white hover:border-transparent"
                onClick={() => setIsEditModalOpen(true)}
              >
                <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5 shrink-0" />
                <span>Edit Inquiry</span>
              </button>
            )}
          </div>
        </div>

        {/* Second Row: Department Badge and Status Tags */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide border shrink-0",
            inquiry.department === 'presales' 
              ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800" 
              : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
          )}>
            {inquiry.department}
          </span>
          
          {/* Forwarded to Sales Badge */}
          {isForwardedToSales && user?.role === 'presales' && (
            <span className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 whitespace-nowrap shrink-0">
              Forwarded to Sales
            </span>
          )}
          
          {/* Display status or lead stage based on department */}
          {inquiry.department === 'sales' && inquiry.followUps && inquiry.followUps.length > 0 ? (
            (() => {
              const sortedFollowUps = [...inquiry.followUps].sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
              });
              const latestFollowUp = sortedFollowUps[0];
              const leadStage = latestFollowUp.leadStage;
              const subStage = latestFollowUp.subStage;
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  {leadStage && (
                    <span
                      className={cn(
                        'inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap shrink-0',
                        getLeadStageBadgeClasses(leadStage, leadStagesConfig)
                      )}
                    >
                      {leadStage}
                    </span>
                  )}
                  {subStage && (
                    <span className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-secondary-100 text-secondary-800 dark:bg-secondary-900 dark:text-secondary-200 whitespace-nowrap shrink-0">
                      {subStage}
                    </span>
                  )}
                </div>
              );
            })()
          ) : (
            <span
              className={cn(
                'inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap shrink-0',
                getStatusColor(inquiry.status)
              )}
            >
              <Thermometer className="h-4 w-4 sm:h-5 sm:w-5 mr-1" />
              {inquiry.status.charAt(0).toUpperCase() + inquiry.status.slice(1)}
            </span>
          )}
        </div>

        {/* Third Row: Action Buttons - Hidden on lg screens (shown in header), visible on smaller screens */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:hidden">
          {canAttend && (
            <button
              onClick={handleClaim}
              className="btn btn-primary text-xs sm:text-sm px-2 sm:px-3 py-2 sm:py-2.5 flex items-center justify-center whitespace-nowrap shrink-0"
            >
              <UserCheck className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Attend
            </button>
          )}
          {canWhatsApp && (
            <WhatsAppButton
              phone={inquiry.phone}
              inquiryId={inquiry._id}
              userName={user?.name}
            />
          )}
          {canAddFollowUp && (
            <button
              onClick={() => {
                setEditingFollowUp(null);
                setIsFollowUpModalOpen(true);
              }}
              className="text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 transition-all duration-200 hover:bg-black hover:dark:bg-black hover:text-white hover:border-transparent"
            >
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5 shrink-0" />
              <span>Add Follow-Up</span>
            </button>
          )}
          {canAddSalesFollowUp && (
            <button
              onClick={() => {
                setEditingFollowUp(null);
                setIsSalesFollowUpModalOpen(true);
              }}
              className="text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 transition-all duration-200 hover:bg-black hover:dark:bg-black hover:text-white hover:border-transparent"
            >
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5 shrink-0" />
              <span>Add Follow-Up</span>
            </button>
          )}
          {canForward && (
            <button
              className="text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 transition-all duration-200 hover:bg-black hover:dark:bg-black hover:text-white hover:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setShowForwardConfirm(true)}
              disabled={isForwarding}
            >
              <span>Forward to Sales</span>
            </button>
          )}
          {canReassignSales && (
            <button
              className="text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 transition-all duration-200 hover:bg-black hover:dark:bg-black hover:text-white hover:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setShowReassignSalesModal(true)}
              disabled={isForwarding}
            >
              <span>Reassign</span>
            </button>
          )}
          {canEditInquiry && (
            <button
              className="text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 transition-all duration-200 hover:bg-black hover:dark:bg-black hover:text-white hover:border-transparent"
              onClick={() => setIsEditModalOpen(true)}
            >
              <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5 shrink-0" />
              <span>Edit Inquiry</span>
            </button>
          )}
        </div>
      </div>

      {/* Two Column Layout: Basic Information (Left) and Activities (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
        {/* Left Column: Basic Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`card ${cardBackground} flex flex-col h-full`}
        >
            <div className="card-header p-2">
              <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">
                Basic Information
              </h2>
            </div>
            <div className="card-content space-y-4 p-2">
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-8">
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <UserIcon className="h-4 w-4 inline mr-1" />
                    Full Name
                  </label>
                  <p className="text-sm text-secondary-900 font-bold dark:text-white wrap-break-word">
                    {inquiry.name || '-'}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <Mail className="h-4 w-4 inline mr-1" />
                    Email Address
                  </label>
                  <p className="text-sm text-secondary-900 font-bold dark:text-white break-all">
                    {inquiry.email || '-'}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <Phone className="h-4 w-4 inline mr-1" />
                    Phone Number
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-secondary-900 font-bold dark:text-white wrap-break-word">
                      {inquiry.phone}
                    </p>
                    {inquiry.phone && (
                      <button
                        onClick={handleCopyPhone}
                        className="p-1 text-secondary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors rounded hover:bg-secondary-100 dark:hover:bg-secondary-700 shrink-0"
                        title="Copy phone number"
                        aria-label="Copy phone number"
                      >
                        {phoneCopied ? (
                          <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <MapPin className="h-4 w-4 inline mr-1" />
                    City
                  </label>
                  <p className="text-sm text-secondary-900 font-bold dark:text-white wrap-break-word">
                    {inquiry.city || '-'}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Education
                  </label>
                  <p className="text-sm text-secondary-900 dark:text-white font-bold wrap-break-word">
                    {inquiry.education || '-'}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <BookOpen className="h-4 w-4 inline mr-1" />
                    Course
                  </label>
                  <p className="text-sm text-secondary-900 dark:text-white font-bold wrap-break-word">
                    {inquiry.course || '-'}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <Building className="h-4 w-4 inline mr-1" />
                    Preferred Location
                  </label>
                  <p className="text-sm text-secondary-900 dark:text-white font-bold wrap-break-word">
                    {inquiry.preferredLocation || '-'}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <MessageSquare className="h-4 w-4 inline mr-1" />
                    Medium
                  </label>
                  <p className="text-sm text-secondary-900 dark:text-white font-bold wrap-break-word">
                    {inquiry.medium}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <UserCheck className="h-4 w-4 inline mr-1" />
                    Assigned To
                  </label>
                  <p className="text-sm text-secondary-900 dark:text-white font-bold wrap-break-word">
                    {inquiry.assignedTo?.name || 'Unassigned'}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <Clock className="h-4 w-4 inline mr-1" />
                    Forwarded At
                  </label>
                  <p className="text-sm text-secondary-900 dark:text-white font-bold wrap-break-word">
                    {inquiry.forwardedAt
                      ? new Date(inquiry.forwardedAt).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Not forwarded'}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <UserIcon className="h-4 w-4 inline mr-1" />
                    Created By
                  </label>
                  <p className="text-sm text-secondary-900 dark:text-white font-bold wrap-break-word">
                    {inquiry.createdBy.name}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    <Calendar className="h-4 w-4 inline mr-1" />
                    Created At
                  </label>
                  <p className="text-sm text-secondary-900 dark:text-white font-bold wrap-break-word">
                     {new Date(inquiry.createdAt).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                  </p>
                </div>
              </div>
            </div>
        </motion.div>

        {/* Right Column: Activities */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`card ${cardBackground} flex flex-col h-full lg:h-[calc(100vh-300px)] min-h-[400px] sm:min-h-[500px]`}
        >
          <div className="card-header p-2 shrink-0">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white flex items-center">
              <ActivityIcon className="h-5 w-5 inline mr-2" />
              Activities
            </h2>
          </div>
          <div className="card-content p-0 flex-1 overflow-hidden flex flex-col">
            {activitiesLoading ? (
              <div className="flex items-center justify-center p-8 flex-1">
                <LoadingSpinner size="md" />
              </div>
            ) : displayActivities.length > 0 ? (
              <div className="overflow-y-auto flex-1 px-2 py-2">
                <div className="space-y-3">
                  {displayActivities.map((activity: any, index: number) => {
                    const timestamp = new Date(activity.timestamp);
                    const formattedDate = timestamp.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    });
                    const formattedTime = timestamp.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    });

                    // Get icon and color based on activity type
                    let icon: React.ReactNode;
                    let iconColor = 'text-primary-600 dark:text-primary-400';
                    let bgColor = 'bg-primary-50 dark:bg-primary-900/20';

                    switch (activity.type) {
                      case 'created':
                        icon = <UserIcon className="h-4 w-4" />;
                        iconColor = 'text-green-600 dark:text-green-400';
                        bgColor = 'bg-green-50 dark:bg-green-900/20';
                        break;
                      case 'claimed':
                        icon = <UserCheck className="h-4 w-4" />;
                        iconColor = 'text-blue-600 dark:text-blue-400';
                        bgColor = 'bg-blue-50 dark:bg-blue-900/20';
                        break;
                      case 'assigned':
                      case 'reassigned':
                        icon = <UserPlus className="h-4 w-4" />;
                        iconColor = 'text-purple-600 dark:text-purple-400';
                        bgColor = 'bg-purple-50 dark:bg-purple-900/20';
                        break;
                      case 'forwarded_to_sales':
                        icon = <Send className="h-4 w-4" />;
                        iconColor = 'text-primary-600 dark:text-primary-400';
                        bgColor = 'bg-primary-50 dark:bg-primary-900/20';
                        break;
                      case 'follow_up':
                        icon = <MessageSquare className="h-4 w-4" />;
                        iconColor = 'text-indigo-600 dark:text-indigo-400';
                        bgColor = 'bg-indigo-50 dark:bg-indigo-900/20';
                        break;
                      case 'edited':
                        icon = <Edit className="h-4 w-4" />;
                        iconColor = 'text-amber-600 dark:text-amber-400';
                        bgColor = 'bg-amber-50 dark:bg-amber-900/20';
                        break;
                      case 'whatsapp_contact':
                        icon = <Phone className="h-4 w-4" />;
                        iconColor = 'text-emerald-600 dark:text-emerald-400';
                        bgColor = 'bg-emerald-50 dark:bg-emerald-900/20';
                        break;
                      case 'message_added':
                        icon = <MessageSquare className="h-4 w-4" />;
                        iconColor = 'text-teal-600 dark:text-teal-400';
                        bgColor = 'bg-teal-50 dark:bg-teal-900/20';
                        break;
                      case 'note':
                        icon = <FileText className="h-4 w-4" />;
                        iconColor = 'text-slate-600 dark:text-slate-400';
                        bgColor = 'bg-slate-50 dark:bg-slate-900/20';
                        break;
                      default:
                        icon = <ActivityIcon className="h-4 w-4" />;
                    }

                    return (
                      <div
                        key={index}
                        className={cn(
                          'border-l-4 pl-3 py-2 rounded-r-lg transition-all hover:shadow-sm',
                          activity.type === 'created' ? 'border-l-green-500' :
                          activity.type === 'claimed' ? 'border-l-blue-500' :
                          activity.type === 'assigned' || activity.type === 'reassigned' ? 'border-l-purple-500' :
                          activity.type === 'forwarded_to_sales' ? 'border-l-primary-500' :
                          activity.type === 'follow_up' ? 'border-l-indigo-500' :
                          activity.type === 'whatsapp_contact' ? 'border-l-emerald-500' :
                          activity.type === 'message_added' ? 'border-l-teal-500' :
                          activity.type === 'note' ? 'border-l-slate-400' :
                          'border-l-gray-500',
                          bgColor
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className={cn('mt-0.5 shrink-0', iconColor)}>
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-secondary-900 dark:text-white wrap-break-word">
                              {activity.details}
                            </p>
                            {activity.type === 'edited' && activity.editDetails && (
                              <div className="mt-1.5 space-y-1">
                                <div className="text-xs text-secondary-600 dark:text-secondary-400 bg-secondary-100 dark:bg-secondary-800 rounded px-2 py-1.5">
                                  <p className="font-medium mb-1">Changes:</p>
                                  {activity.editDetails.split('; ').map((change: string, idx: number) => (
                                    <p key={idx} className="text-xs wrap-break-word">
                                      • {change}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                            {activity.type === 'message_added' && activity.messageContent && (
                              <p className="mt-1 text-xs text-secondary-700 dark:text-secondary-300 bg-teal-50 dark:bg-teal-900/30 rounded px-2 py-1.5 wrap-break-word whitespace-pre-wrap border border-teal-200 dark:border-teal-800">
                                {activity.messageContent}
                              </p>
                            )}
                            {activity.type === 'note' && activity.noteContent && (
                              <p className="mt-1 text-xs text-secondary-700 dark:text-secondary-300 bg-secondary-100 dark:bg-secondary-800 rounded px-2 py-1.5 wrap-break-word whitespace-pre-wrap">
                                {activity.noteContent}
                              </p>
                            )}
                            {activity.followUpData && (
                              <div className="mt-1.5 space-y-1">
                                {activity.followUpData.leadStage && (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={cn(
                                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                                      getLeadStageBadgeClasses(activity.followUpData.leadStage, leadStagesConfig)
                                    )}>
                                      {activity.followUpData.leadStage}
                                    </span>
                                    {activity.followUpData.subStage && (
                                      <>
                                        <span className="text-xs text-secondary-400">•</span>
                                        <span className="text-xs text-secondary-600 dark:text-secondary-400">
                                          {activity.followUpData.subStage}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}
                                {activity.followUpData.message && (
                                  <p className="text-xs text-secondary-600 dark:text-secondary-400 italic wrap-break-word">
                                    "{activity.followUpData.message}"
                                  </p>
                                )}
                                {activity.followUpData.nextFollowUpDate && (
                                  <p className="text-xs text-secondary-500 dark:text-secondary-500">
                                    Next: {new Date(activity.followUpData.nextFollowUpDate).toLocaleDateString()}
                                    {activity.followUpData.nextFollowUpTime && ` at ${activity.followUpData.nextFollowUpTime}`}
                                  </p>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-xs text-secondary-500 dark:text-secondary-400">
                                {formattedDate}
                              </span>
                              <span className="text-xs text-secondary-400 dark:text-secondary-500">•</span>
                              <span className="text-xs text-secondary-500 dark:text-secondary-400">
                                {formattedTime}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center p-8 flex-1">
                <p className="text-sm text-secondary-500 dark:text-secondary-400">
                  No activities found
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Follow-Ups Section (Below the two columns) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className={`card ${cardBackground}`}
      >
            <div className="card-header p-2">
              <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">
                <Clock className="h-5 w-5 inline mr-2" />
                Follow-Ups
              </h2>
            </div>
            <div className="card-content p-0">
              {inquiry.followUps && inquiry.followUps.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-secondary-200 dark:divide-secondary-700">
                    <thead className="bg-secondary-50 dark:bg-secondary-900/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
                          Type
                        </th>
                        {inquiry.department === 'sales' && (
                          <>
                            <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
                              Lead Stage
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
                              Sub Stage
                            </th>
                          </>
                        )}
                        {inquiry.department === 'presales' && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
                            Status
                          </th>
                        )}
                        <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
                          Created By
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
                          Created At
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
                          Next Follow-Up
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
                          Message
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-secondary-900 divide-y divide-secondary-200 dark:divide-secondary-700">
                      {[...inquiry.followUps].sort((a, b) => {
                        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        return dateB - dateA; // Most recent first (descending order)
                      }).map((fu) => (
                        <tr key={fu._id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-secondary-900 dark:text-white font-medium">
                              {fu.type}
                            </span>
                          </td>
                          {inquiry.department === 'sales' && (
                            <>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {fu.leadStage ? (
                                  <span
                                    className={cn(
                                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                                      getLeadStageBadgeClasses(fu.leadStage, leadStagesConfig)
                                    )}
                                  >
                                    {fu.leadStage}
                                  </span>
                                ) : fu.inquiryStatus ? (
                                  <span
                                    className={cn(
                                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                                      fu.inquiryStatus === 'hot' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                        fu.inquiryStatus === 'warm' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                          fu.inquiryStatus === 'cold' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' :
                                            'bg-secondary-100 text-secondary-800 dark:bg-secondary-900 dark:text-secondary-200'
                                    )}
                                  >
                                    {fu.inquiryStatus.charAt(0).toUpperCase() + fu.inquiryStatus.slice(1)}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {fu.subStage && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary-100 text-secondary-800 dark:bg-secondary-900 dark:text-secondary-200">
                                    {fu.subStage}
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                          {inquiry.department === 'presales' && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={cn(
                                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                                  inquiry.status === 'hot' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                    inquiry.status === 'warm' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                      inquiry.status === 'cold' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' :
                                        'bg-secondary-100 text-secondary-800 dark:bg-secondary-900 dark:text-secondary-200'
                                )}
                              >
                                {inquiry.status ? inquiry.status.charAt(0).toUpperCase() + inquiry.status.slice(1) : '-'}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-secondary-900 dark:text-white">
                              {fu.createdBy?.name || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-secondary-900 dark:text-white">
                              {fu.createdAt ? new Date(fu.createdAt).toLocaleString() : 'N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-secondary-900 dark:text-white">
                               {fu.nextFollowUpDate ? new Date(fu.nextFollowUpDate).toLocaleString() : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-secondary-900 dark:text-white line-clamp-1">
                              {fu.message || '-'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="mx-auto h-12 w-12 text-secondary-400" />
                  <h3 className="mt-2 text-sm font-medium text-secondary-900 dark:text-white">No follow-ups yet</h3>
                  <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
                    {(canAddFollowUp || canAddSalesFollowUp) ? 'Use the Add Follow-Up button above to create one.' : 'No follow-ups have been added to this inquiry.'}
                  </p>
                </div>
              )}
            </div>
      </motion.div>

      {/* Follow-Up Modal */}
      {inquiry && canAddFollowUp && (
        <FollowUpModal
          isOpen={isFollowUpModalOpen}
          onClose={() => {
            setIsFollowUpModalOpen(false);
            setEditingFollowUp(null);
          }}
          inquiryId={inquiry._id}
          followUp={editingFollowUp || undefined}
          onSuccess={handleFollowUpSuccess}
          inquiryStatus={inquiry.status}
        />
      )}

      {/* Sales Follow-Up Modal */}
      {inquiry && id && (canAddSalesFollowUp || ((user?.role === 'sales' || user?.role === 'admin') && inquiry.department === 'sales' && localStorage.getItem('pendingSalesFollowUp') === id)) && (
        <SalesFollowUpModal
          isOpen={isSalesFollowUpModalOpen}
          onClose={() => {
            const pendingInquiryId = localStorage.getItem('pendingSalesFollowUp');
            if (pendingInquiryId === id && inquiry.department === 'sales' && (user?.role === 'sales' || user?.role === 'admin')) {
              const storedCount = localStorage.getItem(`followUpCount_${id}`);
              const currentCount = inquiry?.followUps ? inquiry.followUps.length : 0;

              if (!storedCount || currentCount <= parseInt(storedCount, 10)) {
                toast.error('Please create a follow-up before closing. This is required to complete the attendance.');
                return;
              }
            }
            setIsSalesFollowUpModalOpen(false);
            setEditingFollowUp(null);
          }}
          inquiryId={inquiry._id}
          followUp={editingFollowUp || undefined}
          onSuccess={handleSalesFollowUpSuccess}
          isRequired={!!((user?.role === 'sales' || user?.role === 'admin') && id && inquiry.department === 'sales' && localStorage.getItem('pendingSalesFollowUp') === id && (inquiry.assignedTo && idsMatch(inquiry.assignedTo, user.id || (user as any)._id) || !inquiry.assignedTo))}
          phoneNumber={inquiry.phone}
        />
      )}


      {/* Reassign to Sales Modal */}
      {showReassignSalesModal && canReassignSales && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl w-full max-w-lg p-6 border border-secondary-200 dark:border-secondary-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Reassign to Sales User</h3>
              <button className="text-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300" onClick={() => setShowReassignSalesModal(false)}>✕</button>
            </div>
            <div className="mb-4">
              <input
                type="text"
                value={reassignSalesSearch}
                onChange={(e) => setReassignSalesSearch(e.target.value)}
                placeholder="Search by name or email"
                className="input w-full"
              />
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-secondary-200 dark:divide-secondary-700 rounded-md border border-secondary-200 dark:border-secondary-700">
              {salesUsers
                .filter(u => u.name.toLowerCase().includes(reassignSalesSearch.toLowerCase()) || u.email.toLowerCase().includes(reassignSalesSearch.toLowerCase()))
                .map(u => (
                  <label key={getId(u)!} className="flex items-center justify-between p-3 cursor-pointer hover:bg-secondary-50 dark:hover:bg-secondary-700">
                    <div>
                      <div className="text-sm font-medium text-secondary-900 dark:text-white">{u.name}</div>
                      <div className="text-xs text-secondary-500 dark:text-secondary-400">{u.email}</div>
                    </div>
                    <input
                      type="radio"
                      name="reassignSalesUser"
                      className="h-4 w-4"
                      checked={selectedSales === (getId(u) as string)}
                      onChange={() => setSelectedSales(getId(u)!)}
                    />
                  </label>
                ))}
              {salesUsers.length === 0 && (
                <div className="p-3 text-sm text-secondary-500 dark:text-secondary-400">No sales users found.</div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="btn btn-cancel px-2 py-2" onClick={() => setShowReassignSalesModal(false)}>Cancel</button>
              <button className="btn btn-secondary px-2 py-2" disabled={!selectedSales || isForwarding} onClick={handleReassignToSales}>Reassign</button>
            </div>
          </div>
        </div>
      )}

      {/* Forward to Sales Confirm Modal */}
      {showForwardConfirm && canForward && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-secondary-200 dark:border-secondary-700">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-2">Forward to Sales</h3>
            <p className="text-sm text-secondary-600 dark:text-secondary-300 mb-4">
              Are you sure you want to forward this inquiry to Sales?
              You will no longer be able to update it in Presales.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                className="btn btn-cancel px-2 py-2"
                onClick={() => setShowForwardConfirm(false)}
                disabled={isForwarding}
              >
                Cancel
              </button>
              <button
                className="btn btn-warning px-2 py-2"
                onClick={handleForwardToSales}
                disabled={isForwarding}
              >
                {isForwarding ? 'Forwarding...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Inquiry Modal */}
      {inquiry && (
        <EditInquiryModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          inquiry={inquiry}
          onSuccess={() => {
            refetch();
            queryClient.invalidateQueries(['inquiry-activities', id]);
            queryClient.invalidateQueries(['inquiries']);
            queryClient.invalidateQueries(['presales-inquiries']);
            queryClient.invalidateQueries(['sales-inquiries']);
            queryClient.invalidateQueries(['my-inquiries']);
            queryClient.invalidateQueries(['sales-assigned']);
            queryClient.invalidateQueries(['presales-assigned']);
            queryClient.invalidateQueries(['dashboard-stats']);
            queryClient.invalidateQueries(['unattended-counts']);
            queryClient.invalidateQueries(['admin-dashboard-overview']);
            queryClient.invalidateQueries(['sales-dashboard-stats']);
            queryClient.invalidateQueries(['presales-dashboard-stats']);
            queryClient.invalidateQueries(['inquiry', id]);
          }}
        />
      )}
    </div>
  );
};

export default InquiryDetails;
