/**
 * Inquiry Controller - Refactored into modular structure
 * 
 * This file now serves as a central export point for all inquiry-related operations.
 * The actual implementations have been moved to separate modules for better maintainability.
 * 
 * Module Structure:
 * - helpers/inquiryHelpers.ts - Common utility functions
 * - controllers/inquiry/basicOperations.ts - CRUD operations
 * - controllers/inquiry/assignmentOperations.ts - Assignment/claim/forward/reassign
 * - controllers/inquiry/followUpOperations.ts - Follow-up management
 * - controllers/inquiry/dashboardOperations.ts - Dashboard statistics
 * - controllers/inquiry/reportOperations.ts - Presales and Sales reports
 * - controllers/inquiry/utilityOperations.ts - Utility functions
 */

// Re-export all basic CRUD operations
export {
  createInquiry,
  getInquiries,
  getInquiryById,
  updateInquiry,
  deleteInquiry,
  appendMessage
} from './inquiry/basicOperations';

// Re-export all assignment operations
export {
  assignInquiry,
  claimInquiry,
  forwardInquiryToSales,
  reassignInquiryToSales
} from './inquiry/assignmentOperations';

// Re-export all follow-up operations
export {
  addFollowUp,
  updateFollowUp,
  deleteFollowUp,
  markFollowUpComplete,
  getMyFollowUps
} from './inquiry/followUpOperations';

// Re-export all dashboard operations
export {
  getDashboardStats,
  getAdminDashboardOverview,
  getCenterDashboardStats,
  getPresalesDashboardStats,
  getSalesDashboardStats
} from './inquiry/dashboardOperations';

// Re-export all report operations
export {
  getPresalesReport,
  getPresalesUserDetails,
  getSalesReport,
  getSalesUserDetails
} from './inquiry/reportOperations';

// Re-export all utility operations
export {
  checkPhoneExists,
  getUnattendedInquiryCounts,
  getInquiryActivities,
  logWhatsAppContact
} from './inquiry/utilityOperations';
