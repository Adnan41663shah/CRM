import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { toast } from 'react-toastify';
import { ApiResponse } from '@/types';

class ApiService {
  private api: AxiosInstance;
  private errorToastCache: Map<string, number> = new Map();
  private readonly ERROR_THROTTLE_MS = 10000; // 10 seconds between same error messages (increased from 5)
  private networkErrorShown: boolean = false; // Flag to prevent multiple network error toasts
  private networkErrorTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_URL || '/api',
      timeout: 60000, // Increased timeout for file uploads
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Important: This enables cookies to be sent with requests
    });

    this.setupInterceptors();
  }

  // Helper to show error toast with deduplication
  private showErrorToast(message: string, errorKey?: string) {
    const key = errorKey || message;
    const now = Date.now();
    const lastShown = this.errorToastCache.get(key);

    // Throttle: only show same error once per ERROR_THROTTLE_MS
    if (lastShown && (now - lastShown) < this.ERROR_THROTTLE_MS) {
      return;
    }

    this.errorToastCache.set(key, now);
    
    // Clean up old entries periodically (keep cache size manageable)
    if (this.errorToastCache.size > 50) {
      const entries = Array.from(this.errorToastCache.entries());
      entries.sort((a, b) => b[1] - a[1]); // Sort by timestamp, newest first
      this.errorToastCache.clear();
      entries.slice(0, 20).forEach(([k, v]) => this.errorToastCache.set(k, v));
    }

    toast.error(message, {
      toastId: key, // Prevent duplicate toasts with same ID
      autoClose: 2000,
    });
  }

  // Get user-friendly error message
  private getErrorMessage(error: AxiosError): { message: string; isNetworkError: boolean } {
    // Network errors (server down, connection refused, etc.)
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return {
          message: 'Request timed out. The server is taking too long to respond.',
          isNetworkError: true
        };
      }
      if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
        return {
          message: 'Unable to connect to the server. Please check your internet connection.',
          isNetworkError: true
        };
      }
      if (error.code === 'ERR_CONNECTION_REFUSED' || error.message.includes('Connection refused')) {
        return {
          message: 'Cannot connect to the server. The server may be down or unreachable.',
          isNetworkError: true
        };
      }
      return {
        message: 'Network error. Please check your connection.',
        isNetworkError: true
      };
    }

    const status = error.response.status;
    const data = error.response.data as { message?: string } | undefined;

    // Server errors (500+)
    if (status >= 500) {
      // Check if there's a specific error message from backend
      if (data?.message && typeof data.message === 'string') {
        // Only show backend message if it's user-friendly (not technical details)
        const message = data.message.toLowerCase();
        if (!message.includes('error:') && !message.includes('stack') && !message.includes('at ')) {
          return { message: data.message, isNetworkError: false };
        }
      }
      return {
        message: 'Server is temporarily unavailable. Please try again in a few moments.',
        isNetworkError: false
      };
    }

    // Client errors
    if (status === 400) {
      return { message: data?.message || 'Invalid request. Please check your input and try again.', isNetworkError: false };
    }
    if (status === 401) {
      return { message: 'Your session has expired. Please log in again.', isNetworkError: false };
    }
    if (status === 403) {
      return { message: 'You do not have permission to perform this action.', isNetworkError: false };
    }
    if (status === 404) {
      return { message: 'The requested resource was not found.', isNetworkError: false };
    }
    if (status === 429) {
      return {
        message: data?.message || 'Too many requests. Please wait a moment and try again.',
        isNetworkError: false
      };
    }

    // Default error message
    return {
      message: data?.message || 'An unexpected error occurred. Please try again.',
      isNetworkError: false
    };
  }

  private setupInterceptors() {
    // Request interceptor to add auth token (fallback for API clients)
    this.api.interceptors.request.use(
      (config) => {
        // Cookies are automatically sent with withCredentials: true
        // But we still check localStorage for backward compatibility with API clients
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle errors
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        // Clear network error flag on successful response (connection restored)
        if (this.networkErrorShown) {
          this.networkErrorShown = false;
          if (this.networkErrorTimeout) {
            clearTimeout(this.networkErrorTimeout);
            this.networkErrorTimeout = null;
          }
          // Dismiss the network error toast
          toast.dismiss('network-error');
        }
        return response;
      },
      (error: AxiosError) => {
        // Only show toast for non-login/register requests to avoid duplicate toasts
        const isAuthRequest = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/register') || error.config?.url?.includes('/auth/exchange-code');
        
        // Special handling for 401 - redirect to login
        if (error.response?.status === 401) {
          if (!isAuthRequest) {
            // Clear both localStorage and cookies (via logout API call)
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            
            // Call logout to clear httpOnly cookies
            this.auth.logout().catch(() => {
              // Ignore logout errors during cleanup
            });
            
            window.location.href = '/login';
            // Use regular toast for auth errors (only shown once on redirect)
            toast.error('Your session has expired. Please log in again.', { toastId: 'session-expired' });
          }
          return Promise.reject(error);
        }

        // Skip showing toasts for certain request types that handle their own errors
        const method = error.config?.method?.toUpperCase();
        const isUpdateRequest = method === 'PUT' || method === 'PATCH';
        const isInquiryUpdate = error.config?.url?.includes('/inquiries/') && isUpdateRequest;
        const isProfileRequest = error.config?.url?.includes('/auth/profile');
        const is403OnInquiriesGet = error.response?.status === 403 && method === 'GET' && error.config?.url?.includes('/inquiries');
        // 429 (rate limit): skip toast - usually from socket-driven refetches; data will refresh when limit resets
        const is429 = error.response?.status === 429;
        const shouldSkipToast = isAuthRequest || isProfileRequest || isInquiryUpdate || is403OnInquiriesGet || is429;

        if (!shouldSkipToast) {
          const errorInfo = this.getErrorMessage(error);
          
          // Special handling for network errors - show only once until connection is restored
          if (errorInfo.isNetworkError) {
            if (!this.networkErrorShown) {
              this.networkErrorShown = true;
              toast.error(errorInfo.message, {
                toastId: 'network-error',
                autoClose: false, // Don't auto-close network errors
                closeButton: true,
              });
              
              // Reset the flag after 30 seconds to allow showing again if issue persists
              if (this.networkErrorTimeout) {
                clearTimeout(this.networkErrorTimeout);
              }
              this.networkErrorTimeout = setTimeout(() => {
                this.networkErrorShown = false;
              }, 30000);
            }
          } else {
            // For non-network errors, use the existing deduplication logic
            const errorKey = `${error.config?.method || 'GET'}_${error.config?.url || 'unknown'}_${error.response?.status || 'network'}_${error.code || ''}`;
            this.showErrorToast(errorInfo.message, errorKey);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Generic request method
  private async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.api.request({
        method,
        url,
        data,
        ...config,
      });

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Auth endpoints
  auth = {
    login: (credentials: { email: string; password: string }) =>
      this.request('POST', '/auth/login', credentials),
    
    register: (userData: any) =>
      this.request('POST', '/auth/register', userData),
    
    logout: () =>
      this.request('POST', '/auth/logout'),
    
    
    getProfile: () =>
      this.request('GET', '/auth/profile'),
    
    updateProfile: (userData: any) =>
      this.request('PUT', '/auth/profile', userData),
  };

  // Inquiry endpoints
  inquiries = {
    getAll: (params?: any) => {
      // Normalize parameters for consistent caching
      // If page/limit are not provided, use 'all' to match backend normalization
      const normalizedParams = {
        ...params,
        page: params?.page ?? 'all',
        limit: params?.limit ?? 'all',
        search: params?.search || '',
        sort: params?.sort || 'createdAt',
        order: params?.order || 'desc',
      };
      return this.request('GET', '/inquiries', undefined, { params: normalizedParams });
    },
    
    getById: (id: string) =>
      this.request('GET', `/inquiries/${id}`),
    
    getActivities: (id: string) =>
      this.request('GET', `/inquiries/${id}/activities`),
    
    create: (data: any) =>
      this.request('POST', '/inquiries', data),
    
    update: (id: string, data: any) =>
      this.request('PUT', `/inquiries/${id}`, data),
    
    delete: (id: string) =>
      this.request('DELETE', `/inquiries/${id}`),
    
    assign: (id: string, assignedTo: string) =>
      this.request('POST', `/inquiries/${id}/assign`, { assignedTo }),

    claim: (id: string) =>
      this.request('POST', `/inquiries/${id}/claim`),

    forwardToSales: (id: string) =>
      this.request('POST', `/inquiries/${id}/forward-to-sales`),

    reassignToPresales: (id: string, targetUserId: string) =>
      this.request('POST', `/inquiries/${id}/reassign`, { targetUserId }),
    
    reassignToSales: (id: string, targetUserId: string) =>
      this.request('POST', `/inquiries/${id}/reassign-sales`, { targetUserId }),
    
    addFollowUp: (id: string, data: any) =>
      this.request('POST', `/inquiries/${id}/follow-up`, data),
    
    updateFollowUp: (id: string, followUpId: string, data: any) =>
      this.request('PUT', `/inquiries/${id}/follow-up/${followUpId}`, data),
    
    deleteFollowUp: (id: string, followUpId: string) =>
      this.request('DELETE', `/inquiries/${id}/follow-up/${followUpId}`),
    markFollowUpComplete: (id: string, followUpId: string) =>
      this.request('POST', `/inquiries/${id}/follow-up/${followUpId}/mark-complete`),
    
    getDashboardStats: () =>
      this.request('GET', '/inquiries/dashboard'),
    
    getAdminDashboardOverview: (params?: { dateRange?: string; dateFrom?: string; dateTo?: string }) =>
      this.request('GET', '/inquiries/dashboard/admin-overview', undefined, { params }),
    
    getCenterDashboardStats: (center: string, params?: { dateRange?: string; dateFrom?: string; dateTo?: string }) =>
      this.request('GET', '/inquiries/dashboard/center', undefined, { params: { center, ...params } }),
    
    getPresalesDashboardStats: (params?: { dateRange?: string; dateFrom?: string; dateTo?: string }) =>
      this.request('GET', '/inquiries/dashboard/presales', undefined, { params }),
    
    getSalesDashboardStats: (params?: { dateRange?: string; dateFrom?: string; dateTo?: string }) =>
      this.request('GET', '/inquiries/dashboard/sales', undefined, { params }),
    
    getUnattendedCounts: () =>
      this.request('GET', '/inquiries/unattended-counts'),
    
    getMyFollowUps: () =>
      this.request('GET', '/inquiries/my-follow-ups'),
    
    checkPhoneExists: (phone: string) =>
      this.request('GET', '/inquiries/check-phone', undefined, { params: { phone } }),
    
    getPresalesReport: (params?: { dateRange?: string; dateFrom?: string; dateTo?: string }) =>
      this.request('GET', '/inquiries/reports/presales', undefined, { params }),
    
    getPresalesUserDetails: (userId: string) =>
      this.request('GET', `/inquiries/reports/presales/${userId}`),
    
    getSalesReport: (params?: { dateRange?: string; dateFrom?: string; dateTo?: string }) =>
      this.request('GET', '/inquiries/reports/sales', undefined, { params }),
    
    getSalesUserDetails: (userId: string) =>
      this.request('GET', `/inquiries/reports/sales/${userId}`),

    logWhatsAppContact: (id: string) =>
      this.request('POST', `/inquiries/${id}/whatsapp-contact`),

    appendMessage: (id: string, message: string) =>
      this.request('POST', `/inquiries/${id}/messages`, { message }),
  };

  // User endpoints
  users = {
    getAll: (params?: any) =>
      this.request('GET', '/users', undefined, { params }),
    
    getById: (id: string) =>
      this.request('GET', `/users/${id}`),
    
    update: (id: string, data: any) =>
      this.request('PUT', `/users/${id}`, data),
    
    delete: (id: string) =>
      this.request('DELETE', `/users/${id}`),
    
    toggleStatus: (id: string) =>
      this.request('PATCH', `/users/${id}/toggle-status`),
  };

  // Options endpoints (admin only)
  options = {
    get: () => this.request('GET', '/options'),
    update: (data: { courses?: string[]; locations?: string[]; statuses?: string[]; leadStages?: Array<{ label: string; subStages: string[] }> }) => this.request('PUT', '/options', data),
  };

  // Student endpoints (admin only)
  students = {
    import: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return this.api.post('/students/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000, // 5 minutes for large file uploads
        withCredentials: true,
      }).then(response => response.data);
    },
    getAll: (params?: any) =>
      this.request('GET', '/students', undefined, { params }),
    getImportStatus: (jobId: string) =>
      this.request('GET', `/students/import-status/${jobId}`),
    deleteAll: () =>
      this.request('DELETE', '/students/all'),
  };

  // Integration endpoints
  integrations = {
    // Integration endpoints - Office365 removed
  };

}

export const apiService = new ApiService();
export default apiService;

// Export safeToast as a wrapper around toast to prevent duplicate toasts
// This is used in components that need to show toasts but want to avoid duplicates
// from the API service interceptors
export const safeToast = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast.info(message),
  warning: (message: string) => toast.warning(message),
};
