import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import connectDB from './config/database';
import logger from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { initializeSocket } from './services/socketService';

// Import routes
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import inquiryRoutes from './routes/inquiry';
import userRoutes from './routes/user';
import optionsRoutes from './routes/options';
import studentRoutes from './routes/student';
import integrationRoutes from './routes/integration';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize server
const initializeServer = async () => {
  const io = initializeSocket(httpServer);

  // Trust proxy for rate limiting behind reverse proxy (nginx)
  app.set('trust proxy', 1);

  // Connect to database
  connectDB();

  // Security middleware
  app.use(helmet());
  app.use(mongoSanitize());

  // Response compression (gzip) - smaller payloads, faster transfer
  app.use(compression() as unknown as express.RequestHandler);

  // Rate limiting (in-memory store)
  const isProduction = (process.env.NODE_ENV || 'development') === 'production';

  const generalLimiter = rateLimit({
    windowMs: isProduction
      ? parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000')
      : 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300'),
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  });

  const authLimiter = rateLimit({
    windowMs: 2 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20'),
    message: {
      success: false,
      message: 'Too many authentication attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(generalLimiter);

  // CORS configuration
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Cookie parsing middleware
  app.use(cookieParser());

  // Request logging - in production, log only a sample (1 in 10) to reduce I/O
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!isProduction || Math.random() < 0.1) {
      logger.info(`${req.method} ${req.url}`, { ip: req.ip, userAgent: req.get('User-Agent') });
    }
    next();
  });

  // Health check endpoints (comprehensive monitoring)
  app.use('/', healthRoutes);

  // API routes
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/inquiries', inquiryRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/options', optionsRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/integrations', integrationRoutes);

  // Debug: Log registered routes (development only)
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Registered API routes:', {
      integrations: '/api/integrations',
    });
  }

  // 404 handler
  app.use('*', (req: Request, res: Response) => {
    logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`, {
      path: req.path,
      baseUrl: req.baseUrl,
      url: req.url
    });
    res.status(404).json({
      success: false,
      message: 'Route not found',
      path: req.originalUrl
    });
  });

  // Error handling middleware
  app.use(errorHandler);

  const PORT = process.env.PORT || 5000;

  httpServer.listen(PORT, () => {
    logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    logger.info('Socket.IO is ready for real-time connections');
  });
};

// Initialize the server
initializeServer().catch((error) => {
  logger.error('Failed to initialize server:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

export default app;
