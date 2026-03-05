import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { X, User, Mail, Phone, MapPin, BookOpen, Building, MessageSquare, Thermometer, FileText, GraduationCap, Check, AlertCircle, Send, Calendar, RefreshCw, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import { CourseType, LocationType, MediumType, InquiryStatus } from '@/types';
import { useQuery, useQueryClient } from 'react-query';
import apiService from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

interface CreateInquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: CreateInquiryData) => Promise<void>;
  hideStatus?: boolean;
}

interface CreateInquiryData {
  name: string;
  email: string;
  phone: string;
  countryCode: string;
  city: string;
  education: string;
  course: CourseType;
  preferredLocation: LocationType;
  medium: MediumType;
  message: string;
  status?: InquiryStatus;
}

const CreateInquiryModal: React.FC<CreateInquiryModalProps> = ({
  isOpen,
  onClose,
  hideStatus = false,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [phoneExists, setPhoneExists] = useState(false);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [duplicateInquiryId, setDuplicateInquiryId] = useState<string | null>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [lastToastPhone, setLastToastPhone] = useState<string | null>(null);
  const [forwardToSales, setForwardToSales] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);

  // Existing-inquiry mode state
  const [isExistingMode, setIsExistingMode] = useState(false);
  // The full phone (countryCode+digits) that triggered existing mode — used to detect phone change
  const existingModeTriggerPhone = useRef<string | null>(null);

  const countryCodes = [
    { code: '+91', country: 'India' },
    { code: '+92', country: 'Pakistan' },
    { code: '+1', country: 'USA/Canada' },
    { code: '+44', country: 'UK' },
    { code: '+61', country: 'Australia' },
    { code: '+971', country: 'UAE' },
    { code: '+966', country: 'Saudi Arabia' },
    { code: '+65', country: 'Singapore' },
    { code: '+60', country: 'Malaysia' },
    { code: '+880', country: 'Bangladesh' },
    { code: '+94', country: 'Sri Lanka' },
    { code: '+977', country: 'Nepal' },
  ];

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    trigger,
    setError,
    clearErrors,
    setValue,
  } = useForm<CreateInquiryData & { nextFollowUpDate?: string; nextFollowUpTime?: string }>({
    defaultValues: {
      status: 'warm',
      countryCode: '+91',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (scheduleMode) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setValue('nextFollowUpDate', tomorrow.toISOString().split('T')[0]);
      setValue('nextFollowUpTime', new Date().toTimeString().slice(0, 5));
    }
  }, [scheduleMode, setValue]);

  const watchedValues = watch();

  // Reset existing mode whenever the modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsExistingMode(false);
      existingModeTriggerPhone.current = null;
    }
  }, [isOpen]);

  const exitExistingMode = () => {
    setIsExistingMode(false);
    existingModeTriggerPhone.current = null;
    // Clear all fields except phone/countryCode which the user is still editing
    setValue('name', '');
    setValue('email', '');
    setValue('city', '');
    setValue('education', '');
    setValue('course', '' as CourseType);
    setValue('preferredLocation', '' as LocationType);
    setValue('medium', '' as MediumType);
    setValue('message', '');
    setValue('status', 'warm');
    setForwardToSales(false);
    setScheduleMode(false);
    clearErrors();
  };

  const checkPhoneNumber = async (phone: string, countryCode: string): Promise<boolean> => {
    if (!phone || !/^[0-9]{10}$/.test(phone)) {
      setPhoneExists(false);
      setDuplicateInquiryId(null);
      setLastToastPhone(null);
      clearErrors('phone');
      return false;
    }

    const fullPhoneNumber = `${countryCode}${phone}`;

    try {
      setCheckingPhone(true);
      const response = await apiService.inquiries.checkPhoneExists(fullPhoneNumber);
      const exists = response.data?.exists || false;
      const inquiryId = response.data?.inquiryId || null;
      const admitted = response.data?.isAdmitted || false;
      const assigned = response.data?.isAssigned || false;

      setPhoneExists(exists);
      setDuplicateInquiryId(inquiryId);

      if (exists) {
        if (admitted) {
          setError('phone', { type: 'manual', message: 'This phone number already exists in Admitted Students' });
          if (lastToastPhone !== fullPhoneNumber) {
            setLastToastPhone(fullPhoneNumber);
          }
        } else if (!assigned) {
          setError('phone', { type: 'manual', message: 'An inquiry with the same phone number is present and not attended yet' });
          if (lastToastPhone !== fullPhoneNumber) {
            setLastToastPhone(fullPhoneNumber);
          }
        } else {
          setError('phone', { type: 'manual', message: 'This phone number already exists' });
        }
      } else {
        clearErrors('phone');
        if (lastToastPhone !== null) setLastToastPhone(null);
      }
      return exists;
    } catch (error) {
      console.error('Error checking phone number:', error);
      setPhoneExists(false);
      setDuplicateInquiryId(null);
      return false;
    } finally {
      setCheckingPhone(false);
    }
  };

  const { data: optionsData } = useQuery('options', () => apiService.options.get(), { staleTime: 5 * 60 * 1000 });
  const dynCourses: string[] = optionsData?.data?.courses || ['CDEC', 'X-DSAAI', 'DevOps', 'Full-Stack', 'Any'];
  const dynLocations: string[] = optionsData?.data?.locations || ['Nagpur', 'Pune', 'Nashik', 'Indore'];
  const dynStatuses: string[] = optionsData?.data?.statuses || ['hot', 'warm', 'cold'];

  const isSubmittingRef = useRef(false);

  const handleFormSubmit = async (data: CreateInquiryData & { nextFollowUpDate?: string; nextFollowUpTime?: string }) => {
    if (isSubmittingRef.current) return;

    // ── EXISTING INQUIRY MODE: append message only ──
    if (isExistingMode && duplicateInquiryId) {
      if (!data.message || data.message.trim().length < 3) {
        setError('message', { type: 'manual', message: 'Please enter a message (at least 3 characters)' });
        return;
      }
      try {
        isSubmittingRef.current = true;
        setIsLoading(true);
        await apiService.inquiries.appendMessage(duplicateInquiryId, data.message.trim());
        queryClient.invalidateQueries(['inquiry', duplicateInquiryId]);
        queryClient.invalidateQueries(['inquiry-activities', duplicateInquiryId]);
        toast.success('Message added to the existing inquiry successfully!');
        handleClose();
      } catch (error: any) {
        toast.error(error?.response?.data?.message || 'Failed to add message. Please try again.');
      } finally {
        setIsLoading(false);
        isSubmittingRef.current = false;
      }
      return;
    }

    // ── CREATE MODE: re-check phone then create ──
    if (data.phone && /^[0-9]{10}$/.test(data.phone)) {
      const fullPhoneNumber = `${data.countryCode || '+91'}${data.phone}`;
      try {
        const response = await apiService.inquiries.checkPhoneExists(fullPhoneNumber);
        const exists = response.data?.exists || false;
        const admitted = response.data?.isAdmitted || false;
        if (admitted) {
          return;
        }
        if (exists) {
          toast.error('This phone number already exists. Use the Fetch button to add a message instead.');
          return;
        }
      } catch {
        // Continue if check fails
      }
    }

    try {
      isSubmittingRef.current = true;
      setIsLoading(true);

      const fullPhoneNumber = data.countryCode ? `${data.countryCode}${data.phone}` : `+91${data.phone}`;
      const submitData: any = { ...data, phone: fullPhoneNumber };

      if (forwardToSales) {
        submitData.department = 'sales';
        submitData.assignmentStatus = 'forwarded_to_sales';
        submitData.forwardedBy = user?.id;
      }

      const response = await apiService.inquiries.create(submitData);
      const inquiryId = response.data?.inquiry?._id || response.data?._id;

      if (scheduleMode && inquiryId && data.nextFollowUpDate && data.nextFollowUpTime) {
        const nextFollowUpDateTime = new Date(`${data.nextFollowUpDate}T${data.nextFollowUpTime}`);
        await apiService.inquiries.addFollowUp(inquiryId, {
          type: 'call',
          title: 'Scheduled Follow-up',
          message: data.message,
          nextFollowUpDate: nextFollowUpDateTime.toISOString(),
          inquiryStatus: data.status || 'warm',
        });
      }

      queryClient.invalidateQueries(['inquiries']);
      queryClient.invalidateQueries(['my-inquiries']);
      queryClient.invalidateQueries(['dashboard-stats']);
      queryClient.invalidateQueries(['unattended-counts']);
      queryClient.invalidateQueries(['admin-dashboard-overview']);
      queryClient.invalidateQueries(['sales-dashboard-stats']);
      queryClient.invalidateQueries(['presales-dashboard-stats']);
      queryClient.invalidateQueries(['my-followups']);

      toast.success(
        forwardToSales
          ? 'Inquiry created and forwarded to Sales successfully!'
          : scheduleMode
          ? 'Inquiry created with scheduled follow-up successfully!'
          : 'Inquiry created successfully!'
      );

      reset();
      setPhoneExists(false);
      setDuplicateInquiryId(null);
      setForwardToSales(false);
      setScheduleMode(false);
      onClose();
    } catch (error: any) {
      console.error('Error creating inquiry:', error);
      toast.error(error?.response?.data?.message || 'Failed to create inquiry. Please try again.');
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleFetchDetails = async () => {
    if (!duplicateInquiryId) return;
    try {
      setIsFetchingDetails(true);
      const response = await apiService.inquiries.getById(duplicateInquiryId);
      const inquiry = response.data?.inquiry;
      if (!inquiry) {
        toast.error('Could not fetch inquiry details. Please try again.');
        return;
      }

      const storedPhone: string = inquiry.phone || '';
      const sortedCodes = [...countryCodes].sort((a, b) => b.code.length - a.code.length);
      let matchedCode = '+91';
      for (const cc of sortedCodes) {
        if (storedPhone.startsWith(cc.code)) { matchedCode = cc.code; break; }
      }

      if (inquiry.name) setValue('name', inquiry.name, { shouldDirty: true });
      if (inquiry.email) setValue('email', inquiry.email, { shouldDirty: true });
      if (inquiry.city) setValue('city', inquiry.city, { shouldDirty: true });
      if (inquiry.education) setValue('education', inquiry.education, { shouldDirty: true });
      if (inquiry.course) setValue('course', inquiry.course as CourseType, { shouldDirty: true });
      if (inquiry.preferredLocation) setValue('preferredLocation', inquiry.preferredLocation as LocationType, { shouldDirty: true });
      if (inquiry.medium) setValue('medium', inquiry.medium as MediumType, { shouldDirty: true });
      // Clear message so user writes a fresh note
      setValue('message', '', { shouldDirty: true });
      if (inquiry.status) setValue('status', inquiry.status as InquiryStatus, { shouldDirty: true });
      setValue('countryCode', matchedCode, { shouldDirty: true });

      // Enter existing mode
      existingModeTriggerPhone.current = `${matchedCode}${storedPhone.slice(matchedCode.length)}`;
      setIsExistingMode(true);

    } catch (error) {
      console.error('Error fetching inquiry details:', error);
      toast.error('Failed to fetch details. Please try again.');
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      reset();
      setPhoneExists(false);
      setDuplicateInquiryId(null);
      setLastToastPhone(null);
      setForwardToSales(false);
      setScheduleMode(false);
      setIsExistingMode(false);
      existingModeTriggerPhone.current = null;
      onClose();
    }
  };

  const handleForwardToSalesToggle = () => {
    setForwardToSales(!forwardToSales);
    if (!forwardToSales) setScheduleMode(false);
  };

  const handleScheduleToggle = () => {
    setScheduleMode(!scheduleMode);
    if (!scheduleMode) setForwardToSales(false);
  };

  // ── Shared disabled state for locked fields in existing mode ──
  const fieldDisabled = isExistingMode;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-white/10 dark:bg-black/20 backdrop-blur-xs"
              onClick={handleClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-secondary-200 dark:border-secondary-700 bg-black rounded-t-lg">
                <h2 className="text-xl font-semibold text-white">
                  {isExistingMode ? 'Existing Inquiry — Add Message' : 'Create New Inquiry'}
                </h2>
                <button onClick={handleClose} disabled={isLoading} className="text-gray-400 hover:text-white disabled:opacity-50">
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Existing-mode banner */}
              {isExistingMode && (
                <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    This inquiry already exists. All fields are read-only.{' '}
                    <strong>You can only add a new message.</strong>
                  </p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit(handleFormSubmit)} className="px-6 py-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Full Name {user?.role === 'sales' && !isExistingMode && '*'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        {...register('name', {
                          ...(user?.role === 'sales' && !isExistingMode && { required: 'Name is required' }),
                          minLength: { value: 2, message: 'Name must be at least 2 characters' },
                          maxLength: { value: 50, message: 'Name cannot exceed 50 characters' },
                        })}
                        type="text"
                        disabled={fieldDisabled}
                        onBlur={() => !fieldDisabled && trigger('name')}
                        className={cn(
                          'input pl-10! pr-10 placeholder:text-gray-500',
                          fieldDisabled && 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-75',
                          errors.name && watchedValues.name ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                          !errors.name && watchedValues.name && watchedValues.name.length >= 2 && !fieldDisabled ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                        )}
                        placeholder="Enter full name"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        {!fieldDisabled && errors.name && watchedValues.name && <AlertCircle className="h-5 w-5 text-red-500" />}
                        {!fieldDisabled && !errors.name && watchedValues.name && watchedValues.name.length >= 2 && <Check className="h-5 w-5 text-green-500" />}
                      </div>
                    </div>
                    {errors.name && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name.message}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <Mail className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        {...register('email', {
                          pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'The email address must include @' },
                        })}
                        type="email"
                        disabled={fieldDisabled}
                        onBlur={() => !fieldDisabled && trigger('email')}
                        className={cn(
                          'input pl-10! pr-10 placeholder:text-gray-500',
                          fieldDisabled && 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-75',
                          errors.email && watchedValues.email ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                          !errors.email && watchedValues.email && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(watchedValues.email) && !fieldDisabled ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                        )}
                        placeholder="Enter email address"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        {!fieldDisabled && errors.email && watchedValues.email && <AlertCircle className="h-5 w-5 text-red-500" />}
                        {!fieldDisabled && !errors.email && watchedValues.email && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(watchedValues.email) && <Check className="h-5 w-5 text-green-500" />}
                      </div>
                    </div>
                    {errors.email && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Phone Number *
                    </label>
                    <div className="flex gap-2">
                      <div className="relative w-26">
                        <select
                          {...register('countryCode', { required: 'Country code is required' })}
                          onChange={async (e) => {
                            setValue('countryCode', e.target.value);
                            // Any country code change while in existing mode → exit
                            if (isExistingMode) exitExistingMode();
                            if (watchedValues.phone && /^[0-9]{10}$/.test(watchedValues.phone)) {
                              await checkPhoneNumber(watchedValues.phone, e.target.value);
                            }
                          }}
                          className={cn('input', errors.countryCode && 'border-red-500 focus:ring-red-500 focus:border-red-500')}
                        >
                          {countryCodes.map((country) => (
                            <option key={country.code} value={country.code}>{country.code} ({country.country})</option>
                          ))}
                        </select>
                      </div>

                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                          <Phone className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          {...(() => {
                            const { onChange: _onChange, onBlur: registerOnBlur, ...rest } = register('phone', {
                              required: 'Phone number is required',
                              pattern: { value: /^[0-9]{10}$/, message: 'Please enter a valid 10-digit phone number' },
                            });
                            return {
                              ...rest,
                              onChange: async (e: React.ChangeEvent<HTMLInputElement>) => {
                                const digitsOnly = e.target.value.replace(/\D/g, '');
                                e.target.value = digitsOnly;
                                setValue('phone', digitsOnly, { shouldValidate: true, shouldDirty: true, shouldTouch: true });

                                // If user edits phone while in existing mode → exit immediately
                                if (isExistingMode) {
                                  exitExistingMode();
                                  setPhoneExists(false);
                                  setDuplicateInquiryId(null);
                                }

                                if (digitsOnly && /^[0-9]{10}$/.test(digitsOnly)) {
                                  await checkPhoneNumber(digitsOnly, watchedValues.countryCode || '+91');
                                } else {
                                  setPhoneExists(false);
                                  if (digitsOnly.length === 0) clearErrors('phone');
                                }
                              },
                              onBlur: async (e: React.FocusEvent<HTMLInputElement>) => {
                                registerOnBlur(e);
                                await trigger('phone');
                                const value = e.target.value.replace(/\D/g, '');
                                if (value && /^[0-9]{10}$/.test(value) && !isExistingMode) {
                                  await checkPhoneNumber(value, watchedValues.countryCode || '+91');
                                }
                              },
                            };
                          })()}
                          type="tel"
                          className={cn(
                            'input pl-10! pr-10 placeholder:text-gray-500',
                            (errors.phone || phoneExists) && watchedValues.phone ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                            !errors.phone && !phoneExists && watchedValues.phone && /^[0-9]{10}$/.test(watchedValues.phone) ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                          )}
                          placeholder="Ex: 1234567890"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          {checkingPhone && <LoadingSpinner size="sm" />}
                          {!checkingPhone && (errors.phone || phoneExists) && watchedValues.phone && <AlertCircle className="h-5 w-5 text-red-500" />}
                          {!checkingPhone && !errors.phone && !phoneExists && watchedValues.phone && /^[0-9]{10}$/.test(watchedValues.phone) && <Check className="h-5 w-5 text-green-500" />}
                        </div>
                      </div>
                    </div>

                    {(errors.phone || phoneExists) && (
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {phoneExists && !errors.phone?.message ? 'This phone number already exists' : errors.phone?.message}
                        </p>
                        {phoneExists && duplicateInquiryId && !isExistingMode && (
                          <button
                            type="button"
                            onClick={handleFetchDetails}
                            disabled={isFetchingDetails}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-60 transition-colors"
                          >
                            {isFetchingDetails ? <LoadingSpinner size="sm" className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                            <span>Fetch</span>
                          </button>
                        )}
                      </div>
                    )}
                    {errors.countryCode && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.countryCode.message}</p>}
                  </div>

                  {/* City */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      City {user?.role === 'sales' && !isExistingMode && '*'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <MapPin className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        {...register('city', {
                          ...(user?.role === 'sales' && !isExistingMode && { required: 'City is required' }),
                          minLength: { value: 2, message: 'City must be at least 2 characters' },
                          maxLength: { value: 30, message: 'City cannot exceed 30 characters' },
                        })}
                        type="text"
                        disabled={fieldDisabled}
                        onBlur={() => !fieldDisabled && trigger('city')}
                        className={cn(
                          'input pl-10! pr-10 placeholder:text-gray-500',
                          fieldDisabled && 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-75',
                          errors.city && watchedValues.city ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                          !errors.city && watchedValues.city && watchedValues.city.length >= 2 && !fieldDisabled ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                        )}
                        placeholder="Enter city name"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        {!fieldDisabled && errors.city && watchedValues.city && <AlertCircle className="h-5 w-5 text-red-500" />}
                        {!fieldDisabled && !errors.city && watchedValues.city && watchedValues.city.length >= 2 && <Check className="h-5 w-5 text-green-500" />}
                      </div>
                    </div>
                    {errors.city && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.city.message}</p>}
                  </div>

                  {/* Education */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Education {user?.role === 'sales' && !isExistingMode && '*'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <GraduationCap className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        {...register('education', {
                          ...(user?.role === 'sales' && !isExistingMode && { required: 'Education is required' }),
                          minLength: { value: 2, message: 'Education must be at least 2 characters' },
                          maxLength: { value: 100, message: 'Education cannot exceed 100 characters' },
                        })}
                        type="text"
                        disabled={fieldDisabled}
                        onBlur={() => !fieldDisabled && trigger('education')}
                        className={cn(
                          'input pl-10! pr-10 placeholder:text-gray-500',
                          fieldDisabled && 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-75',
                          errors.education && watchedValues.education ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                          !errors.education && watchedValues.education && watchedValues.education.length >= 2 && !fieldDisabled ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                        )}
                        placeholder="e.g., B.Sc. Computer Science"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        {!fieldDisabled && errors.education && watchedValues.education && <AlertCircle className="h-5 w-5 text-red-500" />}
                        {!fieldDisabled && !errors.education && watchedValues.education && watchedValues.education.length >= 2 && <Check className="h-5 w-5 text-green-500" />}
                      </div>
                    </div>
                    {errors.education && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.education.message}</p>}
                  </div>

                  {/* Course */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Preffered Course {user?.role === 'sales' && !isExistingMode && '*'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <BookOpen className="h-5 w-5 text-gray-400" />
                      </div>
                      <select
                        {...register('course', {
                          ...(user?.role === 'sales' && !isExistingMode && { required: 'Course selection is required' }),
                        })}
                        disabled={fieldDisabled}
                        className={cn(
                          'input pl-10!',
                          fieldDisabled && 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-75',
                          errors.course && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                        )}
                      >
                        <option value="">Select a course</option>
                        {dynCourses.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {errors.course && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.course.message}</p>}
                  </div>

                  {/* Preferred Location */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Preferred Location {!isExistingMode && '*'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <Building className="h-5 w-5 text-gray-400" />
                      </div>
                      <select
                        {...register('preferredLocation', {
                          ...(!isExistingMode && { required: 'Preferred location is required' }),
                        })}
                        disabled={fieldDisabled}
                        className={cn(
                          'input pl-10!',
                          fieldDisabled && 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-75',
                          errors.preferredLocation && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                        )}
                      >
                        <option value="">Select location</option>
                        {dynLocations.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    {errors.preferredLocation && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.preferredLocation.message}</p>}
                  </div>

                  {/* Medium */}
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Enquiry Source {!isExistingMode && '*'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <MessageSquare className="h-5 w-5 text-gray-400" />
                      </div>
                      <select
                        {...register('medium', { ...(!isExistingMode && { required: 'Medium is required' }) })}
                        disabled={fieldDisabled}
                        className={cn(
                          'input pl-10!',
                          fieldDisabled && 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-75',
                          errors.medium && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                        )}
                      >
                        <option value="">Select Source</option>
                        <option value="IVR">IVR</option>
                        <option value="Email">Email</option>
                        <option value="WhatsApp">WhatsApp</option>
                      </select>
                    </div>
                    {errors.medium && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.medium.message}</p>}
                  </div>

                  {/* Message — always editable, required in existing mode */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      {isExistingMode ? 'New Message *' : 'Message *'}
                    </label>
                    {isExistingMode && (
                      <p className="text-xs text-teal-700 dark:text-teal-400 mb-1">
                        This message will be appended to the existing inquiry's activity timeline.
                      </p>
                    )}
                    <div className="relative">
                      <div className="absolute top-3 left-3 flex items-start pointer-events-none z-10">
                        <FileText className="h-5 w-5 text-gray-400" />
                      </div>
                      <textarea
                        {...register('message', {
                          required: (user?.role === 'presales' || user?.role === 'admin' || isExistingMode)
                            ? 'Message is required'
                            : false,
                          minLength: { value: 3, message: 'Message must be at least 3 characters' },
                          maxLength: { value: 1000, message: 'Message cannot exceed 1000 characters' },
                        })}
                        rows={4}
                        onBlur={() => trigger('message')}
                        className={cn(
                          'input pl-10! pr-10 resize-none placeholder:text-gray-500',
                          errors.message && watchedValues.message ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                          !errors.message && watchedValues.message && watchedValues.message.length > 0 ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                        )}
                        placeholder={isExistingMode ? 'Enter your message to append...' : 'Enter your inquiry message...'}
                      />
                      <div className="absolute top-3 right-3 flex items-start pointer-events-none">
                        {errors.message && watchedValues.message && <AlertCircle className="h-5 w-5 text-red-500" />}
                        {!errors.message && watchedValues.message && watchedValues.message.length > 0 && <Check className="h-5 w-5 text-green-500" />}
                      </div>
                    </div>
                    {errors.message && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.message.message}</p>}
                  </div>

                  {/* Status — only in create mode */}
                  {!hideStatus && !isExistingMode && (
                    <div>
                      <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                        Status
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                          <Thermometer className="h-5 w-5 text-gray-400" />
                        </div>
                        <select {...register('status')} className="input pl-10!">
                          {dynStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Forward to Sales / Schedule — only in create mode */}
                  {!isExistingMode && (user?.role === 'presales' || user?.role === 'admin') && (
                    <div className="md:col-span-2 flex gap-3">
                      <button
                        type="button"
                        onClick={handleForwardToSalesToggle}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                          forwardToSales
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300 border-secondary-300 dark:border-secondary-600 hover:bg-secondary-50 dark:hover:bg-secondary-700'
                        )}
                      >
                        <Send className="h-4 w-4" />
                        <span>Forward to Sales</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleScheduleToggle}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                          scheduleMode
                            ? 'bg-purple-500 text-white border-purple-500'
                            : 'bg-white dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300 border-secondary-300 dark:border-secondary-600 hover:bg-secondary-50 dark:hover:bg-secondary-700'
                        )}
                      >
                        <Calendar className="h-4 w-4" />
                        <span>Schedule</span>
                      </button>
                    </div>
                  )}

                  {/* Schedule fields */}
                  {!isExistingMode && scheduleMode && (user?.role === 'presales' || user?.role === 'admin') && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                          Next Follow-up Date *
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                            <Calendar className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="date"
                            {...register('nextFollowUpDate', { required: scheduleMode ? 'Next follow-up date is required' : false })}
                            className="input pl-10!"
                            min={new Date().toISOString().split('T')[0]}
                          />
                        </div>
                        {errors.nextFollowUpDate && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.nextFollowUpDate.message}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                          Next Follow-up Time *
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                            <Calendar className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="time"
                            {...register('nextFollowUpTime', { required: scheduleMode ? 'Next follow-up time is required' : false })}
                            className="input pl-10!"
                          />
                        </div>
                        {errors.nextFollowUpTime && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.nextFollowUpTime.message}</p>}
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-3 pt-6 border-t border-secondary-200 dark:border-secondary-700">
                  <button type="button" onClick={handleClose} disabled={isLoading} className="btn btn-cancel px-2">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={cn('btn btn-primary px-4 py-2', isLoading && 'opacity-50 cursor-not-allowed')}
                  >
                    {isLoading ? (
                      <div className="flex items-center">
                        <LoadingSpinner size="sm" className="mr-2" />
                        {isExistingMode ? 'Adding...' : 'Creating...'}
                      </div>
                    ) : isExistingMode ? (
                      'Add Message'
                    ) : (
                      'Create Inquiry'
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

export default CreateInquiryModal;
