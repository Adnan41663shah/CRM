import { Router } from 'express';
import { body, param, type Meta } from 'express-validator';
import {
  createInquiry,
  getInquiries,
  getInquiryById,
  updateInquiry,
  deleteInquiry,
  appendMessage,
  assignInquiry,
  addFollowUp,
  updateFollowUp,
  deleteFollowUp,
  markFollowUpComplete,
  getMyFollowUps,
  getDashboardStats,
  claimInquiry,
  forwardInquiryToSales,
  reassignInquiryToSales,
  getUnattendedInquiryCounts,
  checkPhoneExists,
  getAdminDashboardOverview,
  getCenterDashboardStats,
  getPresalesDashboardStats,
  getSalesDashboardStats,
  getInquiryActivities,
  logWhatsAppContact,
  getPresalesReport,
  getPresalesUserDetails,
  getSalesReport,
  getSalesUserDetails
} from '../controllers/inquiryController';
import { authenticate, authorize } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/validation';
import { getLeadStages } from '../controllers/optionsController';
import OptionSettings from '../models/OptionSettings';

const router = Router();

// Create inquiry validation
const createInquiryValidation = [
  body('name')
    .custom((value: string | undefined, meta: Meta) => {
      const userRole = (meta.req as { user?: { role?: string } }).user?.role;
      // For sales users, name is required
      if (userRole === 'sales') {
        if (!value || value.trim() === '') {
          throw new Error('Name is required');
        }
      }
      // For all users, validate format if provided
      if (value && (value.length < 2 || value.length > 50)) {
        throw new Error('Name must be between 2 and 50 characters');
      }
      return true;
    })
    .trim(),
  body('email')
    .optional({ checkFalsy: true })
    .custom((value: string | undefined) => {
      if (!value || value.trim() === '') {
        return true; // Empty email is allowed
      }
      // Validate email format if provided
      const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
      if (!emailRegex.test(value)) {
        throw new Error('Please provide a valid email');
      }
      return true;
    })
    .normalizeEmail(),
  body('phone')
    .trim()
    .custom((value: string | undefined) => {
      // Phone number should start with + and contain country code + 10 digits
      // Format: +[country code][10 digits] (e.g., +911234567890)
      if (!value || typeof value !== 'string') {
        throw new Error('Phone number is required');
      }
      // Check if phone starts with + and has at least 11 characters (e.g., +911234567890)
      if (!value.startsWith('+')) {
        throw new Error('Phone number must include country code (e.g., +91)');
      }
      // Remove + and check if remaining is numeric and has at least 10 digits
      const phoneWithoutPlus = value.substring(1);
      if (!/^[0-9]{10,}$/.test(phoneWithoutPlus)) {
        throw new Error('Please provide a valid phone number with country code (e.g., +911234567890)');
      }
      return true;
    })
    .withMessage('Please provide a valid phone number with country code'),
  body('city')
    .custom((value: string | undefined, meta: Meta) => {
      const userRole = (meta.req as { user?: { role?: string } }).user?.role;
      // For sales users, city is required
      if (userRole === 'sales') {
        if (!value || value.trim() === '') {
          throw new Error('City is required');
        }
      }
      // For all users, validate format if provided
      if (value && (value.length < 2 || value.length > 30)) {
        throw new Error('City must be between 2 and 30 characters');
      }
      return true;
    })
    .trim(),
  body('education')
    .custom((value: string | undefined, meta: Meta) => {
      const userRole = (meta.req as { user?: { role?: string } }).user?.role;
      // For sales users, education is required
      if (userRole === 'sales') {
        if (!value || value.trim() === '') {
          throw new Error('Education is required');
        }
      }
      // For all users, validate format if provided
      if (value && (value.length < 2 || value.length > 100)) {
        throw new Error('Education must be between 2 and 100 characters');
      }
      return true;
    })
    .trim(),
  body('course')
    .trim()
    .custom(async (val: string | undefined, meta: Meta) => {
      const userRole = (meta.req as { user?: { role?: string } }).user?.role;
      // For sales users, course is required
      if (userRole === 'sales') {
        if (!val || typeof val !== 'string') {
          throw new Error('Course selection is required');
        }
      }
      // Validate format if provided
      if (val) {
        try {
          const o = await OptionSettings.findOne({ key: 'global' });
          if (!o) {
            throw new Error('System configuration not found. Please contact administrator.');
          }
          if (!o.courses || !Array.isArray(o.courses) || !o.courses.includes(val)) {
            throw new Error(`Invalid course selection. Allowed courses: ${o.courses?.join(', ') || 'none'}`);
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('Invalid course') || msg.includes('System configuration')) {
            throw error;
          }
          throw new Error('Error validating course selection');
        }
      }
      return true;
    }),
  body('preferredLocation')
    .trim()
    .custom(async (val: string | undefined, meta: Meta) => {
      const userRole = (meta.req as { user?: { role?: string } }).user?.role;
      // For sales users, preferred location is required
      if (userRole === 'sales') {
        if (!val || typeof val !== 'string') {
          throw new Error('Preferred location is required');
        }
      }
      // Validate format if provided
      if (val) {
        try {
          const o = await OptionSettings.findOne({ key: 'global' });
          if (!o) {
            throw new Error('System configuration not found. Please contact administrator.');
          }
          if (!o.locations || !Array.isArray(o.locations) || !o.locations.includes(val)) {
            throw new Error(`Invalid preferred location. Allowed locations: ${o.locations?.join(', ') || 'none'}`);
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('Invalid preferred location') || msg.includes('System configuration')) {
            throw error;
          }
          throw new Error('Error validating preferred location');
        }
      }
      return true;
    }),
  body('medium')
    .trim()
    .custom(async (val: string | undefined) => {
      if (!val || typeof val !== 'string') {
        throw new Error('Medium is required');
      }
      try {
        const o = await OptionSettings.findOne({ key: 'global' });
        if (!o) {
          throw new Error('System configuration not found. Please contact administrator.');
        }
        if (!o.mediums || !Array.isArray(o.mediums) || !o.mediums.includes(val)) {
          throw new Error(`Invalid medium. Allowed mediums: ${o.mediums?.join(', ') || 'none'}`);
        }
        return true;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Invalid medium') || msg.includes('System configuration')) {
          throw error;
        }
        throw new Error('Error validating medium');
      }
    }),
  body('message')
    .custom((value: string | undefined, meta: Meta) => {
      const userRole = (meta.req as { user?: { role?: string } }).user?.role;
      // For presales and admin users, message is required
      if (userRole === 'presales' || userRole === 'admin') {
        if (!value || typeof value !== 'string' || value.trim() === '') {
          throw new Error('Message is required');
        }
        // Validate minimum length for presales and admin
        if (value.trim().length < 3) {
          throw new Error('Message must be at least 3 characters');
        }
      }
      // Validate length if provided
      if (value && value.trim().length > 1000) {
        throw new Error('Message cannot exceed 1000 characters');
      }
      // For other users, if message is provided, validate minimum length
      if (value && value.trim().length > 0 && value.trim().length < 3) {
        throw new Error('Message must be at least 3 characters');
      }
      return true;
    })
    .trim(),
  body('status')
    .optional()
    .trim()
    .custom(async (val: string | undefined) => {
      if (!val) return true;
      try {
        const o = await OptionSettings.findOne({ key: 'global' });
        if (!o) {
          throw new Error('System configuration not found. Please contact administrator.');
        }
        if (!o.statuses || !Array.isArray(o.statuses) || !o.statuses.includes(val)) {
          throw new Error(`Invalid status. Allowed statuses: ${o.statuses?.join(', ') || 'none'}`);
        }
        return true;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Invalid status') || msg.includes('System configuration')) {
          throw error;
        }
        throw new Error('Error validating status');
      }
    })
];

// Update inquiry validation
const updateInquiryValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional({ checkFalsy: true })
    .custom((value: string | undefined) => {
      if (!value || value.trim() === '') {
        return true; // Empty email is allowed
      }
      // Validate email format if provided
      const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
      if (!emailRegex.test(value)) {
        throw new Error('Please provide a valid email');
      }
      return true;
    })
    .normalizeEmail(),
  body('phone')
    .optional()
    .trim()
    .custom((value: string | undefined) => {
      if (!value) return true; // Optional field
      // Phone number should start with + and contain country code + 10 digits
      // Format: +[country code][10 digits] (e.g., +911234567890)
      if (!value.startsWith('+')) {
        throw new Error('Phone number must include country code (e.g., +91)');
      }
      // Remove + and check if remaining is numeric and has at least 10 digits
      const phoneWithoutPlus = value.substring(1);
      if (!/^[0-9]{10,}$/.test(phoneWithoutPlus)) {
        throw new Error('Please provide a valid phone number with country code (e.g., +911234567890)');
      }
      return true;
    })
    .withMessage('Please provide a valid phone number with country code'),
  body('city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('City must be between 2 and 30 characters'),
  body('education')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Education must be between 2 and 100 characters'),
  body('course')
    .optional()
    .trim()
    .custom(async (val: string | undefined) => {
      if (!val) return true;
      try {
        const o = await OptionSettings.findOne({ key: 'global' });
        if (!o) {
          throw new Error('System configuration not found. Please contact administrator.');
        }
        if (!o.courses || !Array.isArray(o.courses) || !o.courses.includes(val)) {
          throw new Error(`Invalid course selection. Allowed courses: ${o.courses?.join(', ') || 'none'}`);
        }
        return true;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Invalid course') || msg.includes('System configuration')) {
          throw error;
        }
        throw new Error('Error validating course selection');
      }
    }),
  body('preferredLocation')
    .optional()
    .trim()
    .custom(async (val: string | undefined) => {
      if (!val) return true;
      try {
        const o = await OptionSettings.findOne({ key: 'global' });
        if (!o) {
          throw new Error('System configuration not found. Please contact administrator.');
        }
        if (!o.locations || !Array.isArray(o.locations) || !o.locations.includes(val)) {
          throw new Error(`Invalid preferred location. Allowed locations: ${o.locations?.join(', ') || 'none'}`);
        }
        return true;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Invalid preferred location') || msg.includes('System configuration')) {
          throw error;
        }
        throw new Error('Error validating preferred location');
      }
    }),
  body('medium')
    .optional()
    .trim()
    .custom(async (val: string | undefined) => {
      if (!val) return true;
      try {
        const o = await OptionSettings.findOne({ key: 'global' });
        if (!o) {
          throw new Error('System configuration not found. Please contact administrator.');
        }
        if (!o.mediums || !Array.isArray(o.mediums) || !o.mediums.includes(val)) {
          throw new Error(`Invalid medium. Allowed mediums: ${o.mediums?.join(', ') || 'none'}`);
        }
        return true;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Invalid medium') || msg.includes('System configuration')) {
          throw error;
        }
        throw new Error('Error validating medium');
      }
    }),
  body('message')
    .optional()
    .trim()
    .isLength({ min: 3, max: 1000 })
    .withMessage('Message must be between 3 and 1000 characters'),
  body('status')
    .optional()
    .trim()
    .custom(async (val: string | undefined) => {
      if (!val) return true;
      try {
        const o = await OptionSettings.findOne({ key: 'global' });
        if (!o) {
          throw new Error('System configuration not found. Please contact administrator.');
        }
        if (!o.statuses || !Array.isArray(o.statuses) || !o.statuses.includes(val)) {
          throw new Error(`Invalid status. Allowed statuses: ${o.statuses?.join(', ') || 'none'}`);
        }
        return true;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Invalid status') || msg.includes('System configuration')) {
          throw error;
        }
        throw new Error('Error validating status');
      }
    })
];

// Reassign validation
const reassignValidation = [
  body('targetUserId')
    .isMongoId()
    .withMessage('Invalid target user ID')
];

// Assign inquiry validation
const assignInquiryValidation = [
  body('assignedTo')
    .isMongoId()
    .withMessage('Invalid user ID')
];

// Add follow-up validation
const addFollowUpValidation = [
  body('type')
    .optional()
    .isIn(['call', 'email', 'whatsapp'])
    .withMessage('Invalid follow-up type'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('nextFollowUpDate')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid next follow-up date'),
  body('inquiryStatus')
    .optional()
    .isIn(['hot', 'warm', 'cold'])
    .withMessage('Invalid inquiry status'),
  // Sales-specific fields - Dynamic validation
  body('leadStage')
    .optional()
    .custom(async (value: string | undefined) => {
      if (!value) return true; // Optional field
      const leadStages = await getLeadStages();
      const validLabels = leadStages.map(stage => stage.label);
      if (!validLabels.includes(value)) {
        throw new Error(`Invalid lead stage. Must be one of: ${validLabels.join(', ')}`);
      }
      return true;
    }),
  body('subStage')
    .optional({ checkFalsy: true })
    .trim()
    .custom(async (value: string | undefined, meta: Meta) => {
      if (!value || value.trim() === '') {
        return true; // Empty subStage is allowed
      }
      if (value.length < 1 || value.length > 200) {
        throw new Error('Sub-stage must be between 1 and 200 characters');
      }
      // Validate sub-stage belongs to selected lead stage
      const leadStage = (meta.req as { body?: { leadStage?: string } }).body?.leadStage;
      if (leadStage) {
        const leadStages = await getLeadStages();
        const selectedStage = leadStages.find(stage => stage.label === leadStage);
        if (selectedStage && selectedStage.subStages.length > 0) {
          if (!selectedStage.subStages.includes(value)) {
            throw new Error(`Sub-stage "${value}" is not valid for lead stage "${leadStage}"`);
          }
        }
      }
      return true;
    }),
  body('message')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Message cannot exceed 1000 characters'),
  body('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid assigned user ID'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

// Update follow-up validation (same as add but all optional)
const updateFollowUpValidation = [
  body('type')
    .optional()
    .isIn(['call', 'email', 'whatsapp'])
    .withMessage('Invalid follow-up type'),
  body('status')
    .optional()
    .isIn(['scheduled', 'completed', 'cancelled', 'rescheduled', 'no_answer', 'busy'])
    .withMessage('Invalid follow-up status'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('completedDate')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid completed date'),
  body('duration')
    .optional()
    .isInt({ min: 1, max: 1440 })
    .withMessage('Duration must be between 1 and 1440 minutes'),
  body('outcome')
    .optional()
    .isIn(['positive', 'neutral', 'negative', 'interested', 'not_interested', 'needs_time', 'requested_info', 'scheduled_meeting'])
    .withMessage('Invalid outcome'),
  body('nextFollowUpDate')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid next follow-up date'),
  body('inquiryStatus')
    .optional()
    .isIn(['hot', 'warm', 'cold'])
    .withMessage('Invalid inquiry status'),
  // Sales-specific fields - Dynamic validation
  body('leadStage')
    .optional()
    .custom(async (value: string | undefined) => {
      if (!value) return true; // Optional field
      const leadStages = await getLeadStages();
      const validLabels = leadStages.map(stage => stage.label);
      if (!validLabels.includes(value)) {
        throw new Error(`Invalid lead stage. Must be one of: ${validLabels.join(', ')}`);
      }
      return true;
    }),
  body('subStage')
    .optional({ checkFalsy: true })
    .trim()
    .custom(async (value: string | undefined, meta: Meta) => {
      if (!value || value.trim() === '') {
        return true; // Empty subStage is allowed
      }
      if (value.length < 1 || value.length > 200) {
        throw new Error('Sub-stage must be between 1 and 200 characters');
      }
      // Validate sub-stage belongs to selected lead stage
      const leadStage = (meta.req as { body?: { leadStage?: string } }).body?.leadStage;
      if (leadStage) {
        const leadStages = await getLeadStages();
        const selectedStage = leadStages.find(stage => stage.label === leadStage);
        if (selectedStage && selectedStage.subStages.length > 0) {
          if (!selectedStage.subStages.includes(value)) {
            throw new Error(`Sub-stage "${value}" is not valid for lead stage "${leadStage}"`);
          }
        }
      }
      return true;
    }),
  body('message')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Message cannot exceed 1000 characters'),
  body('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid assigned user ID'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('completionStatus')
    .optional()
    .isIn(['complete', 'incomplete'])
    .withMessage('Completion status must be either "complete" or "incomplete"')
];

// Follow-up ID validation
const followUpIdValidation = [
  param('followUpId')
    .isMongoId()
    .withMessage('Invalid follow-up ID')
];

// ID validation
const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid inquiry ID')
];

// User ID validation
const userIdValidation = [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user ID')
];


// Routes
router.post('/', authenticate, createInquiryValidation, handleValidationErrors, createInquiry);
router.get('/check-phone', authenticate, checkPhoneExists);
router.get('/', authenticate, getInquiries);
router.get('/dashboard', authenticate, getDashboardStats);
router.get('/dashboard/presales', authenticate, authorize('presales'), getPresalesDashboardStats);
router.get('/dashboard/sales', authenticate, authorize('sales'), getSalesDashboardStats);
router.get('/dashboard/admin-overview', authenticate, authorize('admin'), getAdminDashboardOverview);
router.get('/dashboard/center', authenticate, authorize('admin', 'sales'), getCenterDashboardStats);
router.get('/reports/presales', authenticate, authorize('admin'), getPresalesReport);
router.get('/reports/presales/:userId', authenticate, authorize('admin'), userIdValidation, handleValidationErrors, getPresalesUserDetails);
router.get('/reports/sales', authenticate, authorize('admin'), getSalesReport);
router.get('/reports/sales/:userId', authenticate, authorize('admin'), userIdValidation, handleValidationErrors, getSalesUserDetails);
router.get('/unattended-counts', authenticate, getUnattendedInquiryCounts);
router.get('/my-follow-ups', authenticate, getMyFollowUps);
router.get('/:id', authenticate, idValidation, handleValidationErrors, getInquiryById);
router.get('/:id/activities', authenticate, idValidation, handleValidationErrors, getInquiryActivities);
router.put('/:id', authenticate, idValidation, updateInquiryValidation, handleValidationErrors, updateInquiry);
router.delete('/:id', authenticate, idValidation, handleValidationErrors, deleteInquiry);
router.post('/:id/assign', authenticate, authorize('presales', 'admin'), idValidation, assignInquiryValidation, handleValidationErrors, assignInquiry);
router.post('/:id/claim', authenticate, authorize('sales', 'admin'), idValidation, handleValidationErrors, claimInquiry);
router.post('/:id/forward-to-sales', authenticate, authorize('presales', 'admin'), idValidation, handleValidationErrors, forwardInquiryToSales);

router.post('/:id/reassign-sales', authenticate, authorize('sales', 'admin'), idValidation, reassignValidation, handleValidationErrors, reassignInquiryToSales);
router.post('/:id/whatsapp-contact', authenticate, idValidation, handleValidationErrors, logWhatsAppContact);
router.post(
  '/:id/messages',
  authenticate,
  idValidation,
  [body('message').trim().isLength({ min: 3, max: 1000 }).withMessage('Message must be between 3 and 1000 characters')],
  handleValidationErrors,
  appendMessage
);
router.post('/:id/follow-up', authenticate, idValidation, addFollowUpValidation, handleValidationErrors, addFollowUp);
router.put('/:id/follow-up/:followUpId', authenticate, idValidation, followUpIdValidation, updateFollowUpValidation, handleValidationErrors, updateFollowUp);
router.post('/:id/follow-up/:followUpId/mark-complete', authenticate, idValidation, followUpIdValidation, handleValidationErrors, markFollowUpComplete);
router.delete('/:id/follow-up/:followUpId', authenticate, idValidation, followUpIdValidation, handleValidationErrors, deleteFollowUp);

export default router;
