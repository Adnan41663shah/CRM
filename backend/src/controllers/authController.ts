import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import User from '../models/User';
import { generateToken } from '../utils/jwt';
import { CookieManager } from '../utils/cookieManager';
import logger from '../utils/logger';
import { ApiResponse } from '../types';
import bcrypt from 'bcryptjs';

export const register = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, phone, role } = req.body;

    // Admin role cannot be created through registration
    if (role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin accounts cannot be created through registration. Please contact an administrator.'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create user - only include phone if it's provided and not empty
    // Only presales and sales are allowed; admin is never permitted via registration
    const allowedRole = (role === 'sales' || role === 'presales') ? role : 'presales';

    const userData: Record<string, unknown> = {
      name,
      email: email.toLowerCase(),
      password,
      role: allowedRole
    };

    if (phone && phone.trim() !== '') {
      userData.phone = phone.trim();
    }

    const user = new User(userData);

    await user.save();

    // Generate token
    const token = generateToken({
      userId: String(user._id),
      email: user.email,
      role: user.role,
      centerPermissions: user.centerPermissions,
    });

    // Set secure cookie (same as login) for consistent auth
    CookieManager.setAuthCookie(res, token);

    const response: ApiResponse = {
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          centerPermissions: user.centerPermissions,
        },
        token
      }
    };

    res.status(201).json(response);
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user by email (password field is not selected by default, so we need to explicitly select it)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact your administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = generateToken({
      userId: String(user._id),
      email: user.email,
      role: user.role,
      centerPermissions: user.centerPermissions,
    });

    // Set secure cookie
    CookieManager.setAuthCookie(res, token);

    const response: ApiResponse = {
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          centerPermissions: user.centerPermissions,
        },
        token // Still send token for backward compatibility with API clients
      }
    };

    logger.info('Login successful', { userId: user._id, email: user.email, role: user.role });
    res.json(response);
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user?._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Return consistent user structure with 'id' instead of '_id'
    const response: ApiResponse = {
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          centerPermissions: user.centerPermissions,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile'
    });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { name, phone } = req.body;
    const userId = req.user?._id;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone !== undefined) {
      // Allow empty string to clear phone number
      updateData.phone = phone && phone.trim() !== '' ? phone.trim() : undefined;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const response: ApiResponse = {
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    };

    res.json(response);
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
};

/**
 * Development-only endpoint to set password for test users
 * POST /api/auth/dev/set-password
 * Body: { email: string, password: string }
 */
export const setDevPassword = async (req: Request, res: Response) => {
  // Only allow in development mode
  const isProduction = (process.env.NODE_ENV || 'development') === 'production';
  
  if (isProduction) {
    return res.status(403).json({
      success: false,
      message: 'This endpoint is only available in development mode'
    });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Set password (will be hashed by pre-save hook)
    user.password = password;
    await user.save();

    logger.info('Development password set', { userId: user._id, email: user.email });
    
    res.json({
      success: true,
      message: 'Password set successfully',
      data: {
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Set dev password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while setting password'
    });
  }
};

/**
 * Logout user and clear authentication cookie
 * POST /api/auth/logout
 */
export const logout = async (req: Request, res: Response) => {
  try {
    // Clear the authentication cookie
    CookieManager.clearAuthCookie(res);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
};
