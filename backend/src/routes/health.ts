import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';

const router = Router();

/**
 * Health Check Endpoint
 * Returns the health status of all critical services
 * 
 * Usage: GET /health
 * 
 * Response:
 * - 200: All critical services healthy
 * - 503: One or more critical services unhealthy
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const mongoStatus = mongoose.connection.readyState;

    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        mongodb: {
          status: mongoStatus === 1 ? 'healthy' : 'unhealthy',
          connected: mongoStatus === 1,
          readyState: mongoStatus,
        },
        api: {
          status: 'healthy',
          message: 'API is operational',
        }
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    };

    const isCriticallyHealthy = health.services.mongodb.connected;

    if (!isCriticallyHealthy) {
      health.status = 'unhealthy';
      logger.error('Health check failed: MongoDB not connected');
      return res.status(503).json(health);
    }

    res.status(200).json(health);
  } catch (error: any) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message || 'Health check failed',
    });
  }
});

/**
 * Readiness Check Endpoint
 * Returns whether the service is ready to accept traffic
 * 
 * Usage: GET /ready
 */
router.get('/ready', async (req: Request, res: Response) => {
  const mongoReady = mongoose.connection.readyState === 1;
  
  if (mongoReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      reason: 'MongoDB not connected',
    });
  }
});

/**
 * Liveness Check Endpoint
 * Returns whether the service is alive (for Kubernetes/Docker health checks)
 * 
 * Usage: GET /live
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

export default router;
