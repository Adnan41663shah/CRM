import { InquiryStatus, FollowUpType } from '@/types';

export const INQUIRY_STATUSES: { value: InquiryStatus; label: string; color: string }[] = [
  { value: 'hot', label: 'Hot', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  { value: 'warm', label: 'Warm', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { value: 'cold', label: 'Cold', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { value: 'walkin', label: 'Walkin', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  { value: 'not_interested', label: 'Not Interested', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' },
  { value: 'online_conversion', label: 'Online-Conversion', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
];

// Helper function to get status color
export const getStatusColor = (status: InquiryStatus): string => {
  const statusObj = INQUIRY_STATUSES.find(s => s.value === status);
  return statusObj?.color || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
};

// Helper function to get status label
export const getStatusLabel = (status: InquiryStatus): string => {
  const statusObj = INQUIRY_STATUSES.find(s => s.value === status);
  return statusObj?.label || status;
};

export const FOLLOW_UP_TYPES: { value: FollowUpType; label: string; icon: string; color: string }[] = [
  { value: 'call', label: 'Call', icon: 'Phone', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { value: 'email', label: 'Email', icon: 'Mail', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: 'whatsapp', label: 'WhatsApp', icon: 'MessageSquare', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
];

// Global pagination constant - change this value to update page limit across all pages
export const ITEMS_PER_PAGE = 50;