import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from 'react-query';
import { X, Calendar, Clock, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import { FollowUp, FollowUpType, InquiryStatus } from '@/types';
import { FOLLOW_UP_TYPES, INQUIRY_STATUSES } from '@/utils/constants';
import apiService from '@/services/api';

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  inquiryId: string;
  followUp?: FollowUp;
  onSuccess: () => void;
  inquiryStatus?: InquiryStatus; // Current inquiry status
  followUpToMarkComplete?: string; // ID of follow-up to mark as complete after adding new one
}

interface FollowUpFormData {
  type: FollowUpType;
  message: string;
  nextFollowUpDate?: string;
  nextFollowUpTime?: string;
  inquiryStatus: InquiryStatus;
}

const FollowUpModal: React.FC<FollowUpModalProps> = ({
  isOpen,
  onClose,
  inquiryId,
  followUp,
  onSuccess,
  inquiryStatus = 'warm',
}) => {
  const [isLoading, setIsLoading] = useState(false);

  // Fetch statuses from API
  const { data: optionsData } = useQuery(
    'options',
    () => apiService.options.get(),
    { staleTime: 2 * 60 * 1000 } // 2 min – socket-driven invalidation handles inquiry updates
  );

  // Use API statuses if available, otherwise fall back to constants
  // Map API statuses (string array) to the format needed (value, label, color)
  const availableStatuses = useMemo(() => {
    const apiStatuses = optionsData?.data?.statuses || [];
    if (apiStatuses.length > 0) {
      // Map API statuses to the format needed, using colors from constants
      return apiStatuses
        .map((status: string) => {
          const statusFromConstants = INQUIRY_STATUSES.find(s => s.value === status);
          if (statusFromConstants) {
            return statusFromConstants;
          }
          // If status not found in constants, create a basic entry
          return {
            value: status as InquiryStatus,
            label: status.charAt(0).toUpperCase() + status.slice(1),
            color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
          };
        })
        .filter((status: { value: InquiryStatus; label: string; color: string }) => ['hot', 'warm', 'cold'].includes(status.value));
    }
    // Fall back to constants, filtered for presales (hot, warm, cold only)
    return INQUIRY_STATUSES.filter(status => 
      status.value === 'hot' || status.value === 'warm' || status.value === 'cold'
    );
  }, [optionsData?.data?.statuses]);
  
  // Helper function to ensure inquiryStatus is one of the allowed values
  const getAllowedInquiryStatus = (status: InquiryStatus): InquiryStatus => {
    const validStatus = availableStatuses.find((s: { value: InquiryStatus; label: string; color: string }) => s.value === status);
    if (validStatus) {
      return status;
    }
    // Default to first available status or 'warm'
    return (availableStatuses[0]?.value as InquiryStatus) || 'warm';
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    trigger,
  } = useForm<FollowUpFormData>({
    defaultValues: {
      type: 'call',
      inquiryStatus: 'warm' as InquiryStatus,
      nextFollowUpDate: (() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
      })(),
      nextFollowUpTime: new Date().toTimeString().slice(0, 5),
      message: '',
    },
    mode: 'onChange',
  });

  // Watch all fields for real-time validation
  const watchedValues = watch();

  useEffect(() => {
    if (!isOpen) return; // Don't reset when modal is closed
    // Only proceed if statuses are available
    if (availableStatuses.length === 0) return;

    if (followUp) {
      const nextFollowUpDate = followUp.nextFollowUpDate ? new Date(followUp.nextFollowUpDate) : undefined;

      reset({
        type: followUp.type,
        message: followUp.message || followUp.title || '', // Support both for backward compatibility
        nextFollowUpDate: nextFollowUpDate?.toISOString().split('T')[0],
        nextFollowUpTime: nextFollowUpDate?.toTimeString().slice(0, 5),
        inquiryStatus: getAllowedInquiryStatus(inquiryStatus),
      });
    } else {
      // Set default values for new follow-up, including tomorrow's date and current time for next follow-up
      const now = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split('T')[0];
      const currentTime = now.toTimeString().slice(0, 5);

      reset({
        type: 'call',
        inquiryStatus: getAllowedInquiryStatus(inquiryStatus),
        nextFollowUpDate: tomorrowDate,
        nextFollowUpTime: currentTime,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, followUp?._id, inquiryStatus]);

  const handleFormSubmit = async (data: FollowUpFormData) => {
    try {
      setIsLoading(true);

      const nextFollowUpDateTime = data.nextFollowUpDate && data.nextFollowUpTime
        ? new Date(`${data.nextFollowUpDate}T${data.nextFollowUpTime}`)
        : undefined;

      const followUpData: any = {
        type: data.type,
        message: data.message,
        inquiryStatus: data.inquiryStatus, // This will update the inquiry status
      };

      if (nextFollowUpDateTime) followUpData.nextFollowUpDate = nextFollowUpDateTime.toISOString();

      if (followUp) {
        await apiService.inquiries.updateFollowUp(inquiryId, followUp._id, followUpData);
        toast.success('Follow-up updated successfully!');
      } else {
        // addFollowUp already marks all previous pending follow-ups as complete on the backend
        await apiService.inquiries.addFollowUp(inquiryId, followUpData);
        toast.success('Follow-up added successfully!');
      }

      // Wait a bit to ensure backend has processed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      onSuccess();
      reset();
      onClose();
    } catch (error: any) {
      console.error('Error saving follow-up:', error);
      const errorMessage = error?.response?.data?.message || 'Failed to save follow-up. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  

  const handleClose = () => {
    if (!isLoading) {
      reset();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-50 w-full max-w-4xl bg-white dark:bg-gray-800 rounded-lg shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-secondary-200 dark:border-secondary-700 bg-black rounded-t-lg">
                <h2 className="text-2xl font-bold text-white">
                  {followUp ? 'Edit Follow-Up' : 'Add Follow-Up'}
                </h2>
                <button
                  onClick={handleClose}
                  disabled={isLoading}
                  className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Type */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Type *
                    </label>
                    <select
                      {...register('type', { required: 'Type is required' })}
                      className={cn(
                        'input',
                        errors.type && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                      )}
                    >
                      {FOLLOW_UP_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Inquiry Status */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Inquiry Status *
                    </label>
                    <select
                      {...register('inquiryStatus', { required: 'Inquiry status is required' })}
                      className={cn(
                        'input',
                        errors.inquiryStatus && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                      )}
                    >
                      {availableStatuses.map((status: { value: InquiryStatus; label: string; color: string }) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                    {errors.inquiryStatus && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.inquiryStatus.message}
                      </p>
                    )}
                  </div>

                  {/* Message */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Message *
                    </label>
                    <div className="relative">
                      <textarea
                        {...register('message', {
                          required: 'Message is required',
                          maxLength: { value: 1000, message: 'Message cannot exceed 1000 characters' },
                        })}
                        rows={4}
                        onBlur={() => trigger('message')}
                        className={cn(
                          'input pr-10 placeholder:text-gray-500',
                          errors.message && watchedValues.message ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                          !errors.message && watchedValues.message && watchedValues.message.length > 0 ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                        )}
                        placeholder="Enter follow-up message"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 pt-3 flex items-start pointer-events-none">
                        {errors.message && watchedValues.message && (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        )}
                        {!errors.message && watchedValues.message && watchedValues.message.length > 0 && (
                          <Check className="h-5 w-5 text-green-500" />
                        )}
                      </div>
                    </div>
                    {errors.message && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.message.message}
                      </p>
                    )}
                  </div>

                  {/* Next Follow-up Date & Time */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Next Follow-up Date
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <Calendar className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        {...register('nextFollowUpDate')}
                        type="date"
                        className="input pl-10!"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Next Follow-up Time
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <Clock className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        {...register('nextFollowUpTime')}
                        type="time"
                        className="input pl-10!"
                      />
                    </div>
                  </div>

                  

                  
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-secondary-200 dark:border-secondary-700">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isLoading}
                    className="btn btn-cancel py-2 px-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn btn-primary py-2 px-2"
                  >
                    {isLoading ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Saving...
                      </>
                    ) : (
                      followUp ? 'Update Follow-Up' : 'Create Follow-Up'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default FollowUpModal;

