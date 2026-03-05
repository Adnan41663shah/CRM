import { Inquiry } from '@/types';

/**
 * Escapes a CSV field value by wrapping it in quotes if necessary
 */
const escapeCSVField = (field: string | null | undefined): string => {
  if (field === null || field === undefined) return '';
  const str = String(field);
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Converts an array of inquiries to CSV format
 */
export const convertInquiriesToCSV = (inquiries: Inquiry[]): string => {
  if (inquiries.length === 0) {
    return '';
  }

  // CSV Headers
  const headers = [
    'Name',
    'Email',
    'Phone',
    'City',
    'Education',
    'Course',
    'Location',
    'Medium',
    'Status',
    'Department',
    'Assignment Status',
    'Assigned To',
    'Created By',
    'Created Date',
    'Created Time',
    'Message'
  ];

  // Create CSV rows
  const rows = inquiries.map((inquiry) => {
    return [
      escapeCSVField(inquiry.name),
      escapeCSVField(inquiry.email),
      formatPhoneNumber(inquiry.phone), // Use formatted phone number to prevent scientific notation
      escapeCSVField(inquiry.city),
      escapeCSVField(inquiry.education),
      escapeCSVField(inquiry.course),
      escapeCSVField(inquiry.preferredLocation),
      escapeCSVField(inquiry.medium),
      escapeCSVField(inquiry.status),
      escapeCSVField(inquiry.department),
      escapeCSVField((inquiry as any).assignmentStatus || 'not_assigned'),
      escapeCSVField(inquiry.assignedTo?.name || 'Unassigned'),
      escapeCSVField(inquiry.createdBy?.name || 'Unknown'),
      escapeCSVField(new Date(inquiry.createdAt).toLocaleDateString()),
      escapeCSVField(new Date(inquiry.createdAt).toLocaleTimeString()),
      escapeCSVField(inquiry.message || '')
    ];
  });

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
};

/**
 * Converts inquiries to CSV for presales "My Raised" export.
 * Same as convertInquiriesToCSV but omits Department and Assignment Status columns.
 */
export const convertInquiriesToCSVForPresalesRaised = (inquiries: Inquiry[]): string => {
  if (inquiries.length === 0) {
    return '';
  }

  const headers = [
    'Name',
    'Email',
    'Phone',
    'City',
    'Education',
    'Course',
    'Location',
    'Medium',
    'Status',
    'Assigned To',
    'Created By',
    'Created Date',
    'Created Time',
    'Message'
  ];

  const rows = inquiries.map((inquiry) => {
    return [
      escapeCSVField(inquiry.name),
      escapeCSVField(inquiry.email),
      formatPhoneNumber(inquiry.phone),
      escapeCSVField(inquiry.city),
      escapeCSVField(inquiry.education),
      escapeCSVField(inquiry.course),
      escapeCSVField(inquiry.preferredLocation),
      escapeCSVField(inquiry.medium),
      escapeCSVField(inquiry.status),
      escapeCSVField(inquiry.assignedTo?.name || 'Unassigned'),
      escapeCSVField(inquiry.createdBy?.name || 'Unknown'),
      escapeCSVField(new Date(inquiry.createdAt).toLocaleDateString()),
      escapeCSVField(new Date(inquiry.createdAt).toLocaleTimeString()),
      escapeCSVField(inquiry.message || '')
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
};

/**
 * Returns a normalized phone string (no scientific notation) with spaces so Excel treats it as text.
 * Use this when you will wrap the value in CSV quotes yourself (e.g. escapeCsv).
 */
export const getFormattedPhoneNumber = (phone: string | number | null | undefined): string => {
  if (phone === null || phone === undefined || phone === '') return '';

  let phoneStr: string;
  if (typeof phone === 'number') {
    phoneStr = phone.toFixed(0);
  } else {
    phoneStr = String(phone).trim();
    if (phoneStr.includes('E+') || phoneStr.includes('e+') || phoneStr.includes('E-') || phoneStr.includes('e-')) {
      const num = parseFloat(phoneStr);
      if (!isNaN(num)) phoneStr = num.toFixed(0);
    }
  }

  const digits = phoneStr.replace(/[^\d+]/g, '');
  if (!digits || digits.length === 0) return '';

  let countryCode = '';
  let number = '';

  if (digits.startsWith('+')) {
    const withoutPlus = digits.substring(1);
    if (withoutPlus.length >= 10) {
      countryCode = withoutPlus.slice(0, withoutPlus.length - 10);
      number = withoutPlus.slice(withoutPlus.length - 10);
    } else {
      number = withoutPlus;
    }
  } else {
    if (digits.length === 10) {
      number = digits;
    } else if (digits.length > 10 && digits.length <= 13) {
      countryCode = digits.slice(0, digits.length - 10);
      number = digits.slice(digits.length - 10);
    } else {
      number = digits;
    }
  }

  if (countryCode && number.length === 10) {
    return `${countryCode} ${number.slice(0, 5)} ${number.slice(5)}`;
  } else if (number.length === 10) {
    return `${number.slice(0, 5)} ${number.slice(5)}`;
  } else {
    const fullNumber = countryCode ? `${countryCode}${number}` : number;
    return ` ${fullNumber}`;
  }
};

/**
 * Formats phone number to prevent Excel from converting it to scientific notation
 * Ensures phone number is always treated as text and formatted correctly (returns CSV-quoted value)
 */
const formatPhoneNumber = (phone: string | number | null | undefined): string => {
  const inner = getFormattedPhoneNumber(phone);
  if (!inner) return '';
  return `"${inner.replace(/"/g, '""')}"`;
};

/** Get latest lead stage and sub stage from inquiry follow-ups (sales) */
function getLatestLeadStageFromInquiry(inquiry: Inquiry): { leadStage: string; subStage: string } {
  if (!inquiry.followUps || inquiry.followUps.length === 0) {
    return { leadStage: '', subStage: '' };
  }
  const sorted = [...inquiry.followUps].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const latest = sorted[0];
  return {
    leadStage: latest.leadStage ?? '',
    subStage: latest.subStage ?? ''
  };
}

/**
 * Converts inquiries to CSV for Sales My Attended Inquiries export.
 * Columns: Name, Phone, Lead Stage, Sub Stage, City, Education, Preferred Course, Preferred Location, Created By, Forwarded By, Created At
 */
export const convertInquiriesToCSVForSalesMyAttended = (inquiries: Inquiry[]): string => {
  if (inquiries.length === 0) {
    return '';
  }

  const headers = [
    'Name',
    'Phone',
    'Lead Stage',
    'Sub Stage',
    'City',
    'Education',
    'Preferred Course',
    'Preferred Location',
    'Created By',
    'Forwarded By',
    'Attended At',
    'Created At'
  ];

  const formatDateTime = (iso: string | undefined): string => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return '';
    }
  };

  const rows = inquiries.map((inquiry) => {
    const { leadStage, subStage } = getLatestLeadStageFromInquiry(inquiry);
    return [
      escapeCSVField(inquiry.name),
      formatPhoneNumber(inquiry.phone),
      escapeCSVField(leadStage),
      escapeCSVField(subStage),
      escapeCSVField(inquiry.city),
      escapeCSVField(inquiry.education),
      escapeCSVField(inquiry.course),
      escapeCSVField(inquiry.preferredLocation),
      escapeCSVField(inquiry.createdBy?.name || 'Unknown'),
      escapeCSVField(inquiry.forwardedBy?.name ?? ''),
      escapeCSVField(formatDateTime(inquiry.forwardedAt)),
      escapeCSVField(formatDateTime(inquiry.createdAt))
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
};

/**
 * Converts inquiries to CSV for Admin My Attended Inquiries export.
 * Columns: Name, Phone, Course, Location, Department, Lead Stage, Sub Stage, Attended At, Created At
 */
export const convertInquiriesToCSVForAdminMyAttended = (inquiries: Inquiry[]): string => {
  if (inquiries.length === 0) {
    return '';
  }

  const headers = [
    'Name',
    'Phone',
    'Course',
    'Location',
    'Department',
    'Lead Stage',
    'Sub Stage',
    'Attended At',
    'Created At'
  ];

  const formatDateTime = (iso: string | undefined): string => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return '';
    }
  };

  const rows = inquiries.map((inquiry) => {
    const { leadStage, subStage } = getLatestLeadStageFromInquiry(inquiry);
    return [
      escapeCSVField(inquiry.name),
      formatPhoneNumber(inquiry.phone),
      escapeCSVField(inquiry.course),
      escapeCSVField(inquiry.preferredLocation),
      escapeCSVField(inquiry.department),
      escapeCSVField(leadStage),
      escapeCSVField(subStage),
      escapeCSVField(formatDateTime(inquiry.forwardedAt)),
      escapeCSVField(formatDateTime(inquiry.createdAt))
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
};

/**
 * Converts admitted students data to CSV format
 * Columns: Name, Mobile, Course, Center, Admission Date, Counselor
 */
export const convertAdmittedStudentsToCSV = (students: Array<{
  name: string;
  phone: string;
  course: string;
  center: string;
  admissionDate: string;
  counselor: string;
}>): string => {
  if (students.length === 0) {
    return '';
  }

  // CSV Headers
  const headers = [
    'Name',
    'Mobile',
    'Course',
    'Center',
    'Admission Date',
    'Counselor'
  ];

  // Create CSV rows
  const rows = students.map((student) => {
    return [
      escapeCSVField(student.name),
      formatPhoneNumber(student.phone), // Use formatted phone number
      escapeCSVField(student.course),
      escapeCSVField(student.center),
      escapeCSVField(student.admissionDate),
      escapeCSVField(student.counselor)
    ];
  });

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
};

/**
 * Downloads a CSV file
 */
export const downloadCSV = (csvContent: string, filename: string): void => {
  // Create blob with BOM for Excel compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Create download link
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  // Append to body, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up URL
  URL.revokeObjectURL(url);
};

