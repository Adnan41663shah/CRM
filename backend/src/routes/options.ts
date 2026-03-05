import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getOptions, updateOptions } from '../controllers/optionsController';

const router = Router();

// Anyone authenticated can read options to render forms/filters
router.get('/', authenticate, getOptions);
router.put('/', authenticate, authorize('admin'), updateOptions);

export default router;

