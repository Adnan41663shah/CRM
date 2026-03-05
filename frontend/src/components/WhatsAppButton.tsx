import React, { useCallback } from 'react';
import { MessageCircle } from 'lucide-react';
import { buildWhatsAppUrl } from '@/utils/whatsapp';
import apiService from '@/services/api';
import { useQueryClient } from 'react-query';

interface WhatsAppButtonProps {
  phone: string;
  inquiryId: string;
  userName?: string;
  className?: string;
}

const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({
  phone,
  inquiryId,
  userName,
  className = '',
}) => {
  const queryClient = useQueryClient();

  const handleClick = useCallback(() => {
    const prefill = userName
      ? `Hi, I am ${userName} from CRM`
      : undefined;

    const url = buildWhatsAppUrl(phone, prefill);
    window.open(url, '_blank', 'noopener,noreferrer');

    apiService.inquiries.logWhatsAppContact(inquiryId).then(() => {
      queryClient.invalidateQueries(['inquiry-activities', inquiryId]);
    }).catch(() => {});
  }, [phone, inquiryId, userName, queryClient]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Chat on WhatsApp"
      aria-label="Chat on WhatsApp"
      className={`text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-white dark:bg-gray-800 text-[#25D366] dark:text-[#25D366] border border-[#25D366] dark:border-[#25D366] transition-all duration-200 hover:bg-[#25D366] hover:text-white hover:border-[#25D366] dark:hover:bg-[#25D366] dark:hover:text-white ${className}`}
    >
      <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5 shrink-0" />
      <span>WhatsApp</span>
    </button>
  );
};

export default WhatsAppButton;
