/**
 * Sanitize a phone number for use in WhatsApp API URLs.
 * Strips everything except digits, preserving the country code.
 */
export function sanitizePhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Build a wa.me redirect URL.
 * @param phone  Raw phone string (e.g. "+91 98765 43210")
 * @param text   Optional pre-filled message (user can still edit/delete it)
 */
export function buildWhatsAppUrl(phone: string, text?: string): string {
  const sanitized = sanitizePhoneForWhatsApp(phone);
  const url = new URL(`https://wa.me/${sanitized}`);
  if (text) {
    url.searchParams.set('text', text);
  }
  return url.toString();
}
