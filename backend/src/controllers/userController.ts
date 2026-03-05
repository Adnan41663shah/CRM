import { Request, Response } from 'express';
import User from '../models/User';
import logger from '../utils/logger';
import { ApiResponse } from '../types';
import { emitUserOperation } from '../services/socketService';

export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      search,
      role,
      isActive,
      sort = 'createdAt',
      order = 'desc'
    } = req.query as any;

    const query: any = {};

    // Apply filters
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    // Security: Restrict presales to only view active presales users list
    if (req.user?.role === 'presales') {
      query.role = 'presales';
      query.isActive = true;
    }
    
    // Security: Restrict sales to only view active sales users list
    if (req.user?.role === 'sales') {
      query.role = 'sales';
      query.isActive = true;
    }

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortObj: any = {};
    sortObj[sort] = sortOrder;

    const users = await User.find(query)
      .select((req.user?.role === 'presales' || req.user?.role === 'sales') ? 'name email role isActive' : '-password')
      .sort(sortObj);

    const response: ApiResponse = {
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users
      }
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const response: ApiResponse = {
      success: true,
      message: 'User retrieved successfully',
      data: { user }
    };

    res.json(response);
  } catch (error) {
    logger.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user'
    });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { name, email, role, isActive, centerPermissions } = req.body;
    const userId = req.params.id;

    // Get the user being updated to check current role
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if trying to change role of the first admin
    if (role && currentUser.role === 'admin' && role !== 'admin') {
      // Find the first admin (admin with earliest createdAt)
      const firstAdmin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
      
      if (firstAdmin && firstAdmin._id.toString() === userId) {
        return res.status(403).json({
          success: false,
          message: 'The first admin cannot change their own role. The first admin account must remain as admin.'
        });
      }
    }

    // Check if email is being changed and if it already exists
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists for another user'
        });
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (centerPermissions !== undefined) updateData.centerPermissions = centerPermissions;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Emit real-time update for user update
    try {
      emitUserOperation('updated', user);
      logger.info('✅ Real-time updates sent for user update');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (update user):', socketError.message);
    }

    const response: ApiResponse = {
      success: true,
      message: 'User updated successfully',
      data: { user }
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const deleteUser = async (req: Request, res: Response)=> {
  try {
    const userId = req.params.id;

    // Prevent admin from deleting themselves
    if (userId === req.user?._id?.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Prevent deleting admin account
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin account. Only one admin account is allowed in the system.'
      });
    }

    await User.findByIdAndDelete(userId);

    // Emit real-time update for user deletion
    try {
      emitUserOperation('deleted', { _id: userId, email: user.email, name: user.name });
      logger.info('✅ Real-time updates sent for user deletion');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (delete user):', socketError.message);
    }

    const response: ApiResponse = {
      success: true,
      message: 'User deleted successfully'
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const toggleUserStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    // Prevent admin from deactivating themselves
    if (userId === req.user?._id?.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deactivating admin account
    if (user.role === 'admin' && user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Cannot deactivate admin account. Admin account must remain active.'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    const response: ApiResponse = {
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { user }
    };

    res.json(response);
  } catch (error) {
    logger.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while toggling user status'
    });
  }
};
