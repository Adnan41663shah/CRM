import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from 'react-query';
import { X, Calendar, Clock, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import { FollowUp, FollowUpType, SalesLeadStage } from '@/types';
import { FOLLOW_UP_TYPES } from '@/utils/constants';
import apiService from '@/services/api';

interface SalesFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  inquiryId: string;
  followUp?: FollowUp;
  onSuccess: () => void;
  isRequired?: boolean; // If true, modal cannot be closed until follow-up is set
  followUpToMarkComplete?: string; // ID of follow-up to mark as complete after adding new one
  phoneNumber?: string; // Inquiry phone number shown in header (sales follow-up form)
}

interface SalesFollowUpFormData {
  type: FollowUpType;
  leadStage: SalesLeadStage;
  subStage: string;
  nextFollowUpDate?: string;
  nextFollowUpTime?: string;
  message?: string;
}

const SalesFollowUpModal: React.FC<SalesFollowUpModalProps> = ({
  isOpen,
  onClose,
  inquiryId,
  followUp,
  onSuccess,
  isRequired = false,
  phoneNumber,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLeadStage, setSelectedLeadStage] = useState<SalesLeadStage | ''>('');

  // Fetch lead stages from API with improved caching
  const { data: optionsData, isLoading: isLoadingOptions, refetch: refetchOptions } = useQuery(
    'options',
    () => apiService.options.get(),
    { 
      staleTime: 60 * 1000, // Consider data fresh for 1 minute (reduced from 5 min for better sync)
      refetchOnWindowFocus: true, // Refetch when user focuses window
      refetchOnMount: true // Refetch when component mounts
    }
  );

  // Use API lead stages - no fallback to hardcoded constants
  // This ensures admin changes are always reflected
  const leadStages: Array<{ label: string; subStages: string[]; color?: string }> = useMemo(() => {
    if (optionsData?.data?.leadStages && optionsData.data.leadStages.length > 0) {
      return optionsData.data.leadStages.map((stage: any) => ({
        label: stage.label || stage.value || '',
        subStages: stage.subStages || [],
        color: stage.color || 'gray'
      }));
    }
    return []; // Return empty array if no data - will show loading/error state
  }, [optionsData?.data?.leadStages]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<SalesFollowUpFormData>({
    defaultValues: {
      type: 'call',
      leadStage: '' as SalesLeadStage, // Will be set dynamically when leadStages load
      subStage: '',
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

  const watchedLeadStage = watch('leadStage');

  // Update selected lead stage when form value changes
  useEffect(() => {
    if (watchedLeadStage) {
      setSelectedLeadStage(watchedLeadStage);
      // Reset sub-stage when lead stage changes
      setValue('subStage', '');
    }
  }, [watchedLeadStage, setValue]);

  // Get sub-stages for selected lead stage
  const selectedLeadStageData = leadStages.find(stage => stage.label === selectedLeadStage);
  const availableSubStages = selectedLeadStageData?.subStages || [];

  useEffect(() => {
    if (!isOpen) return; // Don't reset when modal is closed

    // Wait for options to load
    if (isLoadingOptions || leadStages.length === 0) return;

    const defaultLeadStage = leadStages[0].label as SalesLeadStage;

    if (followUp) {
      const nextFollowUpDate = followUp.nextFollowUpDate ? new Date(followUp.nextFollowUpDate) : undefined;
      // Use existing leadStage if valid, otherwise use default
      const validLeadStage = leadStages.find(s => s.label === followUp.leadStage) 
        ? followUp.leadStage 
        : defaultLeadStage;

      reset({
        type: followUp.type,
        leadStage: validLeadStage || defaultLeadStage,
        subStage: followUp.subStage || '',
        nextFollowUpDate: nextFollowUpDate?.toISOString().split('T')[0],
        nextFollowUpTime: nextFollowUpDate?.toTimeString().slice(0, 5),
        message: followUp.message || '',
      });
      setSelectedLeadStage(validLeadStage || defaultLeadStage);
    } else {
      // Set default values for new follow-up, including tomorrow's date and current time for next follow-up
      const now = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split('T')[0];
      const currentTime = now.toTimeString().slice(0, 5);

      reset({
        type: 'call',
        leadStage: defaultLeadStage,
        subStage: '',
        message: '',
        nextFollowUpDate: tomorrowDate,
        nextFollowUpTime: currentTime,
      });
      setSelectedLeadStage(defaultLeadStage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, followUp?._id, leadStages]);

  const handleFormSubmit = async (data: SalesFollowUpFormData) => {
    try {
      setIsLoading(true);

      const nextFollowUpDateTime = data.nextFollowUpDate && data.nextFollowUpTime
        ? new Date(`${data.nextFollowUpDate}T${data.nextFollowUpTime}`)
        : undefined;

      const followUpData: any = {
        type: data.type || 'call', // Ensure type is always sent, default to 'call'
        leadStage: data.leadStage,
      };

      // Only include subStage if it's not empty
      if (data.subStage && data.subStage.trim()) {
        followUpData.subStage = data.subStage.trim();
      }

      // Only include message if it's not empty
      if (data.message && data.message.trim()) {
        followUpData.message = data.message.trim();
      }

      if (nextFollowUpDateTime) {
        followUpData.nextFollowUpDate = nextFollowUpDateTime.toISOString();
      }

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
      // Reset to first available lead stage dynamically
      if (leadStages.length > 0) {
        setSelectedLeadStage(leadStages[0].label as SalesLeadStage);
      } else {
        setSelectedLeadStage('');
      }
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
    // If modal is required, prevent closing (regardless of whether editing or creating)
    // This ensures inquiries moved to unattended and then attended require a new follow-up
    if (isRequired) {
      return; // Don't close - onClose will handle the toast message
    }
    
    if (!isLoading) {
      reset();
      // Reset to first available lead stage dynamically
      if (leadStages.length > 0) {
        setSelectedLeadStage(leadStages[0].label as SalesLeadStage);
      } else {
        setSelectedLeadStage('');
      }
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50"
              onClick={isRequired ? undefined : handleClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-50 w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-secondary-200 dark:border-secondary-700 bg-black rounded-t-lg">
                <h2 className="text-xl font-semibold text-white">
                  {phoneNumber ? (
                    <>
                      {followUp ? 'Edit Follow-up' : 'Add Follow-up'}
                      <span className="text-white/90 font-medium ml-2">({phoneNumber})</span>
                    </>
                  ) : (
                    followUp ? 'Edit Follow-up' : 'Add Follow-up'
                  )}
                </h2>
                {!isRequired && (
                  <button
                    onClick={handleClose}
                    disabled={isLoading}
                    className="text-white hover:text-gray-300 disabled:opacity-50"
                  >
                    <X className="h-6 w-6" />
                  </button>
                )}
                {isRequired && (
                  <span className="text-xs text-white/70 italic">
                    First follow-up required
                  </span>
                )}
              </div>

              {/* Form */}
              {isLoadingOptions ? (
                <div className="p-6 flex items-center justify-center">
                  <LoadingSpinner size="md" />
                  <span className="ml-3 text-gray-600 dark:text-gray-400">Loading options...</span>
                </div>
              ) : leadStages.length === 0 ? (
                <div className="p-6 text-center space-y-4">
                  <p className="text-red-600 dark:text-red-400">No lead stages configured. Please contact admin.</p>
                  <button
                    type="button"
                    onClick={() => refetchOptions()}
                    className="btn btn-outline inline-flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </button>
                </div>
              ) : (
              <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-6">
                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register('type', { required: 'Type is required' })}
                    className={cn(
                      "input w-full",
                      errors.type && "border-red-500 focus:ring-red-500"
                    )}
                  >
                    {FOLLOW_UP_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                  {errors.type && (
                    <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
                  )}
                </div>

                {/* Lead Stage */}
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Lead Stage <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register('leadStage', { required: 'Lead stage is required' })}
                    className={cn(
                      "input w-full",
                      errors.leadStage && "border-red-500 focus:ring-red-500"
                    )}
                    onChange={(e) => {
                      setValue('leadStage', e.target.value as SalesLeadStage);
                      setSelectedLeadStage(e.target.value as SalesLeadStage);
                      setValue('subStage', '');
                    }}
                  >
                    {leadStages.map(stage => (
                      <option key={stage.label} value={stage.label}>{stage.label}</option>
                    ))}
                  </select>
                  {errors.leadStage && (
                    <p className="mt-1 text-sm text-red-600">{errors.leadStage.message}</p>
                  )}
                </div>

                {/* Sub-Stage */}
                {selectedLeadStage && availableSubStages.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                      Sub-Stage <span className="text-red-500">*</span>
                    </label>
                    <select
                      {...register('subStage', { required: 'Sub-stage is required' })}
                      className={cn(
                        "input w-full",
                        errors.subStage && "border-red-500 focus:ring-red-500"
                      )}
                    >
                      <option value="">Select sub-stage</option>
                      {availableSubStages.map(subStage => (
                        <option key={subStage} value={subStage}>{subStage}</option>
                      ))}
                    </select>
                    {errors.subStage && (
                      <p className="mt-1 text-sm text-red-600">{errors.subStage.message}</p>
                    )}
                  </div>
                )}

                {/* Next Follow-up Date and Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                      Next Follow-up Date
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 z-10 pointer-events-none" />
                      <input
                        type="date"
                        {...register('nextFollowUpDate')}
                        className="input pl-10! w-full"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                      Next Follow-up Time
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 z-10 pointer-events-none" />
                      <input
                        type="time"
                        {...register('nextFollowUpTime')}
                        className="input pl-10! w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Message (Optional)
                  </label>
                  <textarea
                    {...register('message')}
                    rows={4}
                    className="input w-full placeholder:text-black"
                    placeholder="Enter any additional notes or message..."
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary-200 dark:border-secondary-700">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isLoading}
                    className="btn btn-outline disabled:opacity-50 py-2 px-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn btn-primary disabled:opacity-50 py-2 px-2"
                  >
                    {isLoading ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span className="ml-2">Saving...</span>
                      </>
                    ) : (
                      followUp ? 'Update Follow-up' : 'Add Follow-up'
                    )}
                  </button>
                </div>
              </form>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SalesFollowUpModal;

