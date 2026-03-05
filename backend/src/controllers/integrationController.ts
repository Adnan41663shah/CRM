import { Request, Response } from 'express';
import microsoftGraphService from '../utils/microsoftGraph';
import logger from '../utils/logger';
import User from '../models/User';
import bcrypt from 'bcryptjs';
import { ApiResponse } from '../types';

/**
 * Get Office365 users
 * GET /api/integrations/office365/users
 */
export const getOffice365Users = async (req: Request, res: Response): Promise<void> => {
  logger.info('getOffice365Users controller called');
  try {
    const users = await microsoftGraphService.fetchUsers();

    res.json({
      success: true,
      message: 'Office365 users retrieved successfully',
      source: 'office365',
      data: {
        users,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching Office365 users', {
      error: error.message,
    });

    // Determine error type for appropriate message
    let message = 'Unable to fetch Office365 users';
    let statusCode = 500;

    if (error.message.includes('credentials not configured')) {
      message = 'Microsoft Graph credentials not configured';
      statusCode = 503;
    } else if (error.message.includes('Authentication failed')) {
      message = 'Authentication failed';
      statusCode = 401;
    } else if (error.message.includes('Admin consent required')) {
      message = 'Admin consent required';
      statusCode = 403;
    } else if (error.message.includes('Unable to fetch')) {
      message = error.message;
      statusCode = 500;
    }

    res.status(statusCode).json({
      success: false,
      message,
      source: 'office365',
      data: {
        users: [],
      },
    });
  }
};

/**
 * Sync Office365 user to local database
 * POST /api/integrations/office365/users/sync
 */
export const syncOffice365User = async (req: Request, res: Response): Promise<void> => {
  try {
    const { office365Id, name, email, upn, designation, status } = req.body;

    if (!office365Id || !email) {
      res.status(400).json({
        success: false,
        message: 'Office365 ID and email are required',
      });
      return;
    }

    // Check if user already exists (by email or office365Id)
    let user = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { office365Id }
      ]
    });

    if (user) {
      // Update existing user with Office365 info
      user.name = name || user.name;
      user.office365Id = office365Id;
      user.office365Upn = upn;
      user.isActive = status === 'active';
      if (!user.password) {
        // Generate a random password if user doesn't have one
        const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(randomPassword, salt);
      }
      await user.save();
    } else {
      // Create new user from Office365
      const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = new User({
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'presales', // Default role, can be changed later
        isActive: status === 'active',
        office365Id,
        office365Upn: upn,
      });

      await user.save();
    }

    const response: ApiResponse = {
      success: true,
      message: 'Office365 user synced successfully',
      data: { user },
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Error syncing Office365 user', {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync Office365 user',
    });
  }
};

/**
 * Sync multiple Office365 users to local database
 * POST /api/integrations/office365/users/sync-batch
 */
export const syncOffice365UsersBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userIds } = req.body; // Array of Office365 user IDs to sync

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'User IDs array is required',
      });
      return;
    }

    // Fetch users from Office365
    const allOffice365Users = await microsoftGraphService.fetchUsers();
    const usersToSync = allOffice365Users.filter(u => userIds.includes(u.id));

    if (usersToSync.length === 0) {
      res.status(404).json({
        success: false,
        message: 'No matching Office365 users found',
      });
      return;
    }

    const syncedUsers = [];
    const errors = [];

    for (const o365User of usersToSync) {
      try {
        // Check if user already exists
        let user = await User.findOne({
          $or: [
            { email: o365User.email.toLowerCase() },
            { office365Id: o365User.id }
          ]
        });

        if (user) {
          // Update existing user
          user.name = o365User.name;
          user.office365Id = o365User.id;
          user.office365Upn = o365User.upn;
          user.isActive = o365User.status === 'active';
          if (!user.password) {
            const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
            const salt = await bcrypt.genSalt(12);
            user.password = await bcrypt.hash(randomPassword, salt);
          }
          await user.save();
        } else {
          // Create new user
          const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
          const salt = await bcrypt.genSalt(12);
          const hashedPassword = await bcrypt.hash(randomPassword, salt);

          user = new User({
            name: o365User.name,
            email: o365User.email.toLowerCase(),
            password: hashedPassword,
            role: 'presales',
            isActive: o365User.status === 'active',
            office365Id: o365User.id,
            office365Upn: o365User.upn,
          });

          await user.save();
        }

        syncedUsers.push(user);
      } catch (error: any) {
        errors.push({
          email: o365User.email,
          error: error.message,
        });
      }
    }

    const response: ApiResponse = {
      success: true,
      message: `Synced ${syncedUsers.length} user(s) successfully`,
      data: {
        synced: syncedUsers.length,
        failed: errors.length,
        users: syncedUsers,
        errors: errors.length > 0 ? errors : undefined,
      },
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Error syncing Office365 users batch', {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync Office365 users',
    });
  }
};

/**
 * Get combined users (local + Office365 with sync status)
 * GET /api/integrations/office365/users/combined
 */
export const getCombinedUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, role } = req.query as any;

    // Fetch Office365 users
    const office365Users = await microsoftGraphService.fetchUsers();

    // Fetch local users (including synced Office365 users)
    const query: any = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (role) query.role = role;

    const localUsers = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });

    // Map Office365 users with sync status
    const office365UsersWithStatus = office365Users.map(o365User => {
      const syncedUser = localUsers.find(
        u => u.office365Id === o365User.id || u.email.toLowerCase() === o365User.email.toLowerCase()
      );

      return {
        ...o365User,
        isSynced: !!syncedUser,
        localUserId: syncedUser?._id?.toString(),
        localRole: syncedUser?.role,
        localIsActive: syncedUser?.isActive,
      };
    });

    const response: ApiResponse = {
      success: true,
      message: 'Combined users retrieved successfully',
      data: {
        office365Users: office365UsersWithStatus,
        localUsers
      },
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Error fetching combined users', {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch combined users',
    });
  }
};

