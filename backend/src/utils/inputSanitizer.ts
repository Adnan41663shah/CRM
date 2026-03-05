import mongoose from 'mongoose';

/**
 * Sanitize user input to prevent NoSQL injection attacks
 */
export class InputSanitizer {
  /**
   * Sanitize string input for regex queries
   * Escapes all regex special characters to prevent injection
   */
  static sanitizeRegexInput(input: string): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    
    // Escape all regex special characters
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Sanitize and validate ObjectId
   */
  static sanitizeObjectId(input: string): mongoose.Types.ObjectId | null {
    if (typeof input !== 'string') {
      return null;
    }
    
    // Remove any non-alphanumeric characters except for valid ObjectId characters
    const cleaned = input.replace(/[^a-fA-F0-9]/g, '');
    
    if (!mongoose.Types.ObjectId.isValid(cleaned)) {
      return null;
    }
    
    return new mongoose.Types.ObjectId(cleaned);
  }

  /**
   * Sanitize enum values against allowed values
   */
  static sanitizeEnum(input: string, allowedValues: string[]): string | null {
    if (typeof input !== 'string') {
      return null;
    }
    
    // Only allow exact matches from the allowed values
    return allowedValues.includes(input) ? input : null;
  }

  /**
   * Sanitize general string input
   * Removes potentially dangerous characters and limits length
   */
  static sanitizeString(input: string, maxLength: number = 100): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    
    // Remove null bytes and control characters
    let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }
    
    return sanitized;
  }

  /**
   * Sanitize search query specifically
   * More restrictive than general string sanitization
   */
  static sanitizeSearchQuery(input: string): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    
    // Remove potentially dangerous characters
    let sanitized = input.replace(/[\x00-\x1F\x7F${}]/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit length to prevent DoS
    if (sanitized.length > 50) {
      sanitized = sanitized.substring(0, 50);
    }
    
    // Escape regex special characters
    return this.sanitizeRegexInput(sanitized);
  }

  /**
   * Validate and sanitize sort field
   */
  static sanitizeSortField(input: string, allowedFields: string[]): string {
    if (typeof input !== 'string') {
      return 'createdAt'; // Default safe value
    }
    
    // Only allow alphanumeric characters and underscores
    const cleaned = input.replace(/[^a-zA-Z0-9_]/g, '');
    
    // Check against allowed fields
    return allowedFields.includes(cleaned) ? cleaned : 'createdAt';
  }

  /**
   * Validate and sanitize sort order
   */
  static sanitizeSortOrder(input: string): 'asc' | 'desc' {
    if (typeof input !== 'string') {
      return 'desc'; // Default safe value
    }
    
    const cleaned = input.toLowerCase().trim();
    return cleaned === 'asc' ? 'asc' : 'desc';
  }
}