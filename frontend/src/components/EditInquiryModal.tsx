import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { X, User, Mail, Phone, MapPin, BookOpen, Building, MessageSquare, GraduationCap, Check, AlertCircle, FileText, Thermometer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';
import { CourseType, LocationType, MediumType, InquiryStatus, Inquiry } from '@/types';
import { useQuery } from 'react-query';
import apiService from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

interface EditInquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  inquiry: Inquiry;
  onSuccess: () => void;
}

interface EditInquiryData {
  name: string;
  email?: string;
  phone: string;
  countryCode: string;
  city: string;
  education: string;
  course: CourseType;
  preferredLocation: LocationType;
  medium: MediumType;
  message?: string;
  status?: InquiryStatus;
}

const EditInquiryModal: React.FC<EditInquiryModalProps> = ({
  isOpen,
  onClose,
  inquiry,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Country codes list
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

  // Extract country code and phone number from full phone
  const extractPhoneData = (fullPhone: string) => {
    if (!fullPhone) return { countryCode: '+91', phone: '' };
    
    // Handle different phone formats
    // Expected format: +[country code][10 digits]
    // Example: +911234567890 or +11234567890
    
    if (fullPhone.startsWith('+')) {
      // Try to find country code by matching known codes
      for (const cc of countryCodes) {
        if (fullPhone.startsWith(cc.code)) {
          const phone = fullPhone.substring(cc.code.length);
          return { countryCode: cc.code, phone: phone };
        }
      }
      // Fallback: assume country code is first 3 chars (e.g., +91)
      const countryCode = fullPhone.substring(0, 3);
      const phone = fullPhone.substring(3);
      return { countryCode, phone };
    }
    
    return { countryCode: '+91', phone: fullPhone };
  };

  const phoneData = extractPhoneData(inquiry.phone);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    trigger,
  } = useForm<EditInquiryData>({
    defaultValues: {
      name: inquiry.name || '',
      email: inquiry.email || '',
      phone: phoneData.phone,
      countryCode: phoneData.countryCode,
      city: inquiry.city || '',
      education: inquiry.education || '',
      course: inquiry.course || '',
      preferredLocation: inquiry.preferredLocation || '',
      medium: inquiry.medium,
      message: inquiry.message || '',
      status: inquiry.status as InquiryStatus,
    },
    mode: 'onChange',
  });

  // Watch all fields for real-time validation
  const watchedValues = watch();

  // Fetch dynamic options
  const { data: optionsData } = useQuery(
    'options',
    () => apiService.options.get(),
    {
      staleTime: 5 * 60 * 1000,
    }
  );

  const dynCourses: string[] = optionsData?.data?.courses || [];
  const dynLocations: string[] = optionsData?.data?.locations || [];
  const dynStatuses: string[] = optionsData?.data?.statuses || [];

  // Reset form when inquiry changes
  useEffect(() => {
    if (isOpen && inquiry) {
      const phoneData = extractPhoneData(inquiry.phone);
      reset({
        name: inquiry.name || '',
        email: inquiry.email || '',
        phone: phoneData.phone,
        countryCode: phoneData.countryCode,
        city: inquiry.city || '',
        education: inquiry.education || '',
        course: inquiry.course || '',
        preferredLocation: inquiry.preferredLocation || '',
        medium: inquiry.medium,
        message: inquiry.message || '',
        status: inquiry.status as InquiryStatus,
      });
    }
  }, [isOpen, inquiry, reset]);

  const handleFormSubmit = async (data: EditInquiryData) => {
    try {
      setIsLoading(true);
      
      const updateData: any = {
        name: data.name || undefined,
        phone: data.countryCode + data.phone,
        city: data.city || undefined,
        education: data.education || undefined,
        course: data.course || undefined,
        preferredLocation: data.preferredLocation || undefined,
        medium: data.medium,
        message: data.message || undefined,
        status: data.status,
      };
      
      // Handle email - convert empty string to undefined
      if (data.email && data.email.trim() !== '') {
        updateData.email = data.email.trim();
      } else {
        updateData.email = undefined;
      }

      await apiService.inquiries.update(inquiry._id, updateData);
      
      toast.success('Inquiry updated successfully!');
      onSuccess();
      onClose();
    } catch (error: any) {
      // Extract error message from response
      let errorMessage = 'Failed to update inquiry';
      
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        // Handle validation errors array
        errorMessage = error.response.data.errors.map((err: any) => err.message).join(', ');
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      // Use a consistent toastId to prevent duplicate toasts
      const toastId = `update-inquiry-error-${inquiry._id}`;
      toast.error(errorMessage, { toastId });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

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
              className="fixed inset-0 bg-white/10 dark:bg-black/20 backdrop-blur-xs"
              onClick={onClose}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-secondary-200 dark:border-secondary-700 bg-black rounded-t-lg">
                <h2 className="text-xl font-semibold text-white">
                  Edit Inquiry
                </h2>
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="text-gray-400 hover:text-white disabled:opacity-50"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

          {/* Form */}
          <form onSubmit={handleSubmit(handleFormSubmit)} className="px-6 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Full Name {user?.role === 'sales' && '*'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    {...register('name', {
                      ...(user?.role === 'sales' && {
                        required: 'Name is required',
                      }),
                      minLength: {
                        value: 2,
                        message: 'Name must be at least 2 characters',
                      },
                      maxLength: {
                        value: 50,
                        message: 'Name cannot exceed 50 characters',
                      },
                    })}
                    type="text"
                    onBlur={() => trigger('name')}
                    className={cn(
                      'input pl-10! pr-10 placeholder:text-gray-500',
                      errors.name && watchedValues.name ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                      !errors.name && watchedValues.name && watchedValues.name.length >= 2 ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                    )}
                    placeholder="Enter full name"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    {errors.name && watchedValues.name && (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    )}
                    {!errors.name && watchedValues.name && watchedValues.name.length >= 2 && (
                      <Check className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                </div>
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.name.message}
                  </p>
                )}
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
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'The email address must include @',
                      },
                    })}
                    type="email"
                    onBlur={() => trigger('email')}
                    className={cn(
                      'input pl-10! pr-10 placeholder:text-gray-500',
                      errors.email && watchedValues.email ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                      !errors.email && watchedValues.email && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(watchedValues.email) ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                    )}
                    placeholder="Enter email address"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    {errors.email && watchedValues.email && (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    )}
                    {!errors.email && watchedValues.email && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(watchedValues.email) && (
                      <Check className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Phone Number *
                </label>
                <div className="flex gap-2">
                  {/* Country Code Selector */}
                  <div className="relative w-32">
                    <select
                      {...register('countryCode', {
                        required: 'Country code is required',
                      })}
                      className={cn(
                        'input',
                        errors.countryCode && 'border-red-500 focus:ring-red-500 focus:border-red-500'
                      )}
                      disabled
                    >
                      {countryCodes.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.code} ({country.country})
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Phone Number Input */}
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <Phone className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      {...register('phone', {
                        required: 'Phone number is required',
                        pattern: {
                          value: /^[0-9]{10}$/,
                          message: 'Please enter a valid 10-digit phone number',
                        },
                      })}
                      type="tel"
                      className={cn(
                        'input pl-10! pr-10 placeholder:text-gray-500',
                        errors.phone ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                        !errors.phone && watchedValues.phone && /^[0-9]{10}$/.test(watchedValues.phone) ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                      )}
                      placeholder="Ex: 1234567890"
                      disabled
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      {!errors.phone && watchedValues.phone && /^[0-9]{10}$/.test(watchedValues.phone) && (
                        <Check className="h-5 w-5 text-green-500" />
                      )}
                    </div>
                  </div>
                </div>
                {errors.phone && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.phone.message}
                  </p>
                )}
                {errors.countryCode && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.countryCode.message}
                  </p>
                )}
              </div>

              {/* City */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  City {user?.role === 'sales' && '*'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    <MapPin className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    {...register('city', {
                      ...(user?.role === 'sales' && {
                        required: 'City is required',
                      }),
                      minLength: {
                        value: 2,
                        message: 'City must be at least 2 characters',
                      },
                      maxLength: {
                        value: 30,
                        message: 'City cannot exceed 30 characters',
                      },
                    })}
                    type="text"
                    onBlur={() => trigger('city')}
                    className={cn(
                      'input pl-10! pr-10 placeholder:text-gray-500',
                      errors.city && watchedValues.city ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                      !errors.city && watchedValues.city && watchedValues.city.length >= 2 ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                    )}
                    placeholder="Enter city name"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    {errors.city && watchedValues.city && (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    )}
                    {!errors.city && watchedValues.city && watchedValues.city.length >= 2 && (
                      <Check className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                </div>
                {errors.city && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.city.message}
                  </p>
                )}
              </div>

              {/* Education */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Education {user?.role === 'sales' && '*'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    <GraduationCap className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    {...register('education', {
                      ...(user?.role === 'sales' && {
                        required: 'Education is required',
                      }),
                      minLength: { value: 2, message: 'Education must be at least 2 characters' },
                      maxLength: { value: 100, message: 'Education cannot exceed 100 characters' }
                    })}
                    type="text"
                    onBlur={() => trigger('education')}
                    className={cn(
                      'input pl-10! pr-10 placeholder:text-gray-500',
                      errors.education && watchedValues.education ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                      !errors.education && watchedValues.education && watchedValues.education.length >= 2 ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                    )}
                    placeholder="e.g., B.Sc. Computer Science"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    {errors.education && watchedValues.education && (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    )}
                    {!errors.education && watchedValues.education && watchedValues.education.length >= 2 && (
                      <Check className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                </div>
                {errors.education && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.education.message}
                  </p>
                )}
              </div>
              {/* Course */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Preffered Course {user?.role === 'sales' && '*'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    <BookOpen className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    {...register('course', {
                      ...(user?.role === 'sales' && {
                        required: 'Course selection is required',
                      }),
                    })}
                    className={cn(
                      'input pl-10!',
                      errors.course && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    )}
                  >
                    <option value="">Select a course</option>
                    {dynCourses.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {errors.course && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.course.message}
                  </p>
                )}
              </div>

              {/* Preferred Location */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Preferred Location *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    <Building className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    {...register('preferredLocation', {
                      required: 'Preferred location is required',
                    })}
                    className={cn(
                      'input pl-10!',
                      errors.preferredLocation && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    )}
                  >
                    <option value="">Select location</option>
                    {dynLocations.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                {errors.preferredLocation && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.preferredLocation.message}
                  </p>
                )}
              </div>

              {/* Medium */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Enquiry Source *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    <MessageSquare className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    {...register('medium', { required: 'Medium is required' })}
                    className={cn(
                      'input pl-10!',
                      errors.medium && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    )}
                  >
                    <option value="">Select Source</option>
                    <option value="IVR">IVR</option>
                    <option value="Email">Email</option>
                    <option value="WhatsApp">WhatsApp</option>
                  </select>
                </div>
                {errors.medium && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.medium.message}
                  </p>
                )}
              </div>

              {/* Message */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Message
                </label>
                <div className="relative">
                  <div className="absolute top-3 left-3 flex items-start pointer-events-none">
                    <FileText className="h-5 w-5 text-gray-400" />
                  </div>
                  <textarea
                    {...register('message', {
                      maxLength: {
                        value: 1000,
                        message: 'Message cannot exceed 1000 characters',
                      },
                    })}
                    rows={4}
                    onBlur={() => trigger('message')}
                    className={cn(
                      'input pl-10! pr-10 resize-none placeholder:text-gray-500',
                      errors.message && watchedValues.message ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
                      !errors.message && watchedValues.message && watchedValues.message.length > 0 ? 'border-green-500 focus:ring-green-500 focus:border-green-500' : ''
                    )}
                    placeholder="Enter your inquiry message..."
                  />
                  <div className="absolute top-3 right-3 flex items-start pointer-events-none">
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

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Status
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    <Thermometer className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    {...register('status')}
                    className="input pl-10!"
                  >
                    {dynStatuses.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-secondary-200 dark:border-secondary-700">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="btn btn-cancel px-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  'btn btn-primary px-4 py-2',
                  isLoading && 'opacity-50 cursor-not-allowed'
                )}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <LoadingSpinner size="sm" className="mr-2" />
                    Updating...
                  </div>
                ) : (
                  'Update Inquiry'
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

export default EditInquiryModal;
