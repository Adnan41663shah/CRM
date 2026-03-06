import { Router, Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

const router = Router();

/**
 * Integration routes placeholder.
 * Office365 integration has been removed.
 */

router.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`Integration route hit: ${req.method} ${req.path}`, {
    originalUrl: req.originalUrl,
  });
  next();
});

router.get('/test', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Integration routes are working' });
});

export default router;
