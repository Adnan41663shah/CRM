import { Request, Response, NextFunction } from 'express';
import { JWTPayload } from '../types';
import { verifyToken } from '../utils/jwt';
import { CookieManager } from '../utils/cookieManager';
import User from '../models/User';
import logger from '../utils/logger';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Try to get token from cookie first (more secure), then fallback to Authorization header
    let token = CookieManager.getTokenFromCookie(req);
    
    if (!token) {
      // Fallback to Authorization header for API clients
      const authHeader = req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '');
      }
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      // Clear invalid cookie if it exists
      CookieManager.clearAuthCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Invalid token or user not found.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    // Clear invalid cookie if it exists
    CookieManager.clearAuthCookie(res);
    return res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. User not authenticated.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};
