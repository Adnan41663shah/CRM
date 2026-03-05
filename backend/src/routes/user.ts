import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  toggleUserStatus
} from '../controllers/userController';
import { authenticate, authorize } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/validation';

const router = Router();

// Update user validation
const updateUserValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('role')
    .optional()
    .isIn(['presales', 'sales', 'admin'])
    .withMessage('Invalid role. Allowed roles: presales, sales, admin.'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// ID validation
const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid user ID')
];

// Routes
router.get('/', authenticate, authorize('admin', 'presales', 'sales'), getAllUsers);
router.get('/:id', authenticate, authorize('admin'), idValidation, handleValidationErrors, getUserById);
router.put('/:id', authenticate, authorize('admin'), idValidation, updateUserValidation, handleValidationErrors, updateUser);
router.delete('/:id', authenticate, authorize('admin'), idValidation, handleValidationErrors, deleteUser);
router.patch('/:id/toggle-status', authenticate, authorize('admin'), idValidation, handleValidationErrors, toggleUserStatus);

export default router;
