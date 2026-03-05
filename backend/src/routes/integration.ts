import { Router } from 'express';
import logger from '../utils/logger';

const router = Router();

/**
 * Integration routes placeholder.
 * Office365 integration has been removed.
 */

router.use((req, res, next) => {
  logger.info(`Integration route hit: ${req.method} ${req.path}`, {
    originalUrl: req.originalUrl,
  });
  next();
});

router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Integration routes are working' });
});

export default router;
