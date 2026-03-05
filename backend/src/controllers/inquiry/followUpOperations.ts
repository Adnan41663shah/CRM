import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Inquiry from '../../models/Inquiry';
import Activity from '../../models/Activity';
import { ApiResponse } from '../../types';
import logger from '../../utils/logger';
import { notifyUsers } from '../../utils/notify';
import { 
  emitInquiryOperation
} from '../../services/socketService';
import { isAdmittedStudent } from '../../helpers/inquiryHelpers';

/**
 * Add follow-up to inquiry
 */
export const addFollowUp = async (req: Request, res: Response) => {
  try {
    const inquiryId = req.params.id;
    const followUpData = req.body;
    const userId = req.user?._id;

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    const userRole = req.user?.role;
    const canAddFollowUp = 
      userRole === 'admin' ||
      userRole === 'presales' ||
      (userRole === 'sales' && inquiry.department === 'sales');

    if (!canAddFollowUp) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Mark previous incomplete follow-up by this user as complete
    if (!inquiry.followUps) {
      inquiry.followUps = [];
    }
    
    // Mark ALL previous incomplete follow-ups as complete (closing the loop on pending tasks)
    const pendingFollowUps = (inquiry.followUps as any[]).filter((fu: any) => {
      return fu.completionStatus !== 'complete';
    });

    if (pendingFollowUps.length > 0) {
      pendingFollowUps.forEach((fu: any) => {
        fu.completionStatus = 'complete';
      });
      logger.info(`✅ Marked ${pendingFollowUps.length} pending follow-up(s) as complete on inquiry ${inquiryId}`);
    }

    const newFollowUp: any = {
      ...followUpData,
      createdBy: userId,
      createdAt: new Date()
    };
    
    (inquiry.followUps as any[]).push(newFollowUp);

    if (followUpData.inquiryStatus) {
      inquiry.status = followUpData.inquiryStatus;
    }

    if (followUpData.assignedTo && followUpData.assignedTo !== inquiry.assignedTo?.toString()) {
      inquiry.assignedTo = followUpData.assignedTo;
      inquiry.assignmentStatus = 'assigned';
    }

    await inquiry.save({ validateBeforeSave: false });

    const updatedInquiry = await Inquiry.findById(inquiryId)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('followUps.createdBy', 'name email');

    if (!updatedInquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found after update'
      });
    }

    const response: ApiResponse = {
      success: true,
      message: 'Follow-up added successfully',
      data: { inquiry: updatedInquiry }
    };

    res.json(response);

    // Emit real-time updates (but NOT badge update or dashboard refresh since follow-ups don't affect unattended counts or dashboard stats)
    try {
      const targetUsers = inquiry.assignedTo ? [inquiry.assignedTo.toString()] : [];
      emitInquiryOperation('updated', updatedInquiry, targetUsers);
      
      logger.info('✅ Real-time updates sent for follow-up addition');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (add follow-up):', socketError.message);
    }
  } catch (error) {
    logger.error('Add follow-up error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding follow-up'
    });
  }
};

/**
 * Update follow-up
 */
export const updateFollowUp = async (req: Request, res: Response) => {
  try {
    const inquiryId = req.params.id;
    const followUpId = req.params.followUpId;

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    const followUp = (inquiry.followUps as any).id(followUpId);
    if (!followUp) {
      return res.status(404).json({
        success: false,
        message: 'Follow-up not found'
      });
    }

    const userRole = req.user?.role;
    const canUpdate = 
      userRole === 'admin' ||
      userRole === 'presales' ||
      followUp.createdBy.toString() === req.user?._id?.toString();

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const originalForwardedAt = (inquiry as any).forwardedAt;


    Object.assign(followUp, req.body);
    (followUp as any).updatedAt = new Date();

    if (req.body.inquiryStatus) {
      inquiry.status = req.body.inquiryStatus;
    }


    await inquiry.save({ validateBeforeSave: false });

    const updatedInquiry = await Inquiry.findById(inquiryId);
    if (!updatedInquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found after update'
      });
    }

    Object.assign(inquiry, updatedInquiry.toObject());

    if (originalForwardedAt) {
      (inquiry as any).forwardedAt = originalForwardedAt;
      const dbInquiry = updatedInquiry as any;
      if (!dbInquiry.forwardedAt || new Date(dbInquiry.forwardedAt).getTime() !== new Date(originalForwardedAt).getTime()) {
        await Inquiry.updateOne(
          { _id: inquiry._id },
          { $set: { forwardedAt: originalForwardedAt } }
        );
        (inquiry as any).forwardedAt = originalForwardedAt;
      }
    }

    await inquiry.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'assignedTo', select: 'name email' },
      { path: 'followUps.createdBy', select: 'name email' }
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'Follow-up updated successfully',
      data: { inquiry }
    };

    res.json(response);

    // Emit real-time updates (but NOT badge update or dashboard refresh since follow-ups don't affect unattended counts or dashboard stats)
    try {
      const targetUsers = inquiry.assignedTo ? [inquiry.assignedTo.toString()] : [];
      emitInquiryOperation('updated', inquiry, targetUsers);
      
      logger.info('✅ Real-time updates sent for follow-up update');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (update follow-up):', socketError.message);
    }
  } catch (error) {
    logger.error('Update follow-up error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating follow-up'
    });
  }
};

/**
 * Delete follow-up
 */
export const deleteFollowUp = async (req: Request, res: Response) => {
  try {
    const inquiryId = req.params.id;
    const followUpId = req.params.followUpId;

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    const followUp = (inquiry.followUps as any).id(followUpId);
    if (!followUp) {
      return res.status(404).json({
        success: false,
        message: 'Follow-up not found'
      });
    }

    const userRole = req.user?.role;
    const canDelete = 
      userRole === 'admin' ||
      userRole === 'presales' ||
      followUp.createdBy.toString() === req.user?._id?.toString();

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    followUp.deleteOne();
    await inquiry.save();

    await inquiry.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'assignedTo', select: 'name email' },
      { path: 'followUps.createdBy', select: 'name email' }
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'Follow-up deleted successfully',
      data: { inquiry }
    };

    res.json(response);

    // Emit real-time updates (but NOT badge update or dashboard refresh since follow-ups don't affect unattended counts or dashboard stats)
    try {
      const targetUsers = inquiry.assignedTo ? [inquiry.assignedTo.toString()] : [];
      emitInquiryOperation('updated', inquiry, targetUsers);
      
      logger.info('✅ Real-time updates sent for follow-up deletion');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (delete follow-up):', socketError.message);
    }
  } catch (error) {
    logger.error('Delete follow-up error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting follow-up'
    });
  }
};

/**
 * Mark follow-up as complete
 */
export const markFollowUpComplete = async (req: Request, res: Response) => {
  try {
    const inquiryId = req.params.id;
    const followUpId = req.params.followUpId;

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    const followUp = (inquiry.followUps as any).id(followUpId);
    if (!followUp) {
      return res.status(404).json({
        success: false,
        message: 'Follow-up not found'
      });
    }

    const userRole = req.user?.role;
    const canMarkComplete = 
      userRole === 'admin' ||
      userRole === 'presales' ||
      userRole === 'sales' ||
      followUp.createdBy.toString() === req.user?._id?.toString();

    if (!canMarkComplete) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }


    followUp.completionStatus = 'complete';
    (followUp as any).updatedAt = new Date();
    
    await inquiry.save({ validateBeforeSave: false });


    await inquiry.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'assignedTo', select: 'name email' },
      { path: 'followUps.createdBy', select: 'name email' }
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'Follow-up marked as complete',
      data: { inquiry }
    };

    res.json(response);

    // Emit real-time updates (but NOT badge update or dashboard refresh since follow-ups don't affect unattended counts or dashboard stats)
    try {
      const targetUsers = inquiry.assignedTo ? [inquiry.assignedTo.toString()] : [];
      emitInquiryOperation('updated', inquiry, targetUsers);
      
      logger.info('✅ Real-time updates sent for follow-up completion');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (mark follow-up complete):', socketError.message);
    }
  } catch (error) {
    logger.error('Mark follow-up complete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark follow-up as complete'
    });
  }
};

/**
 * Get my follow-ups
 */
export const getMyFollowUps = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const userRole = req.user?.role;

    if (userRole !== 'presales' && userRole !== 'sales' && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only presales, sales and admin users can view their follow-ups.'
      });
    }

    const inquiries = await Inquiry.find({
      'followUps.createdBy': userId
    })
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('forwardedBy', 'name email')
      .populate('followUps.createdBy', 'name email')
      .select('name email phone city course preferredLocation status department assignedTo forwardedBy followUps');
    
    const inquiriesPlain = inquiries.map(inq => inq.toObject());

    const followUpList: any[] = [];
    
    inquiriesPlain.forEach((inquiry: any) => {
      const followUps = inquiry.followUps || [];
      const inquiryId = inquiry._id.toString();
      
      const forwardedById = inquiry.forwardedBy?._id 
        ? inquiry.forwardedBy._id.toString() 
        : inquiry.forwardedBy?.toString();
      
      const isForwardedToSales = userRole === 'presales' && 
        inquiry.department === 'sales' && 
        forwardedById !== null && 
        forwardedById !== undefined;
        
      const assignedToId = inquiry.assignedTo?._id 
        ? inquiry.assignedTo._id.toString() 
        : inquiry.assignedTo?.toString();
        
      const isAssignedToSomeoneElse = assignedToId && assignedToId !== userId?.toString();
      
      const shouldHidePending = isForwardedToSales || isAssignedToSomeoneElse;
      
      const userFollowUps: any[] = [];
      
      followUps.forEach((followUp: any) => {
        const followUpCreatedById = followUp.createdBy?._id 
          ? followUp.createdBy._id.toString() 
          : followUp.createdBy?.toString();
        
        if (followUpCreatedById && followUpCreatedById === userId?.toString()) {
          userFollowUps.push({
            ...followUp,
            inquiry: {
              _id: inquiry._id,
              name: inquiry.name,
              email: inquiry.email,
              phone: inquiry.phone,
              city: inquiry.city,
              course: inquiry.course,
              preferredLocation: inquiry.preferredLocation,
              status: inquiry.status,
              department: inquiry.department,
              assignedTo: inquiry.assignedTo,
              forwardedBy: inquiry.forwardedBy,
              createdBy: inquiry.createdBy
            }
          });
        }
      });
      
      const completedFollowUps = userFollowUps.filter(fu => fu.completionStatus === 'complete');
      const incompleteFollowUps = userFollowUps.filter(fu => fu.completionStatus !== 'complete');
      
      if (shouldHidePending) {
        completedFollowUps.forEach(completedFu => {
          followUpList.push(completedFu);
        });
      } else {
        if (incompleteFollowUps.length > 0) {
          incompleteFollowUps.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          });
          followUpList.push(incompleteFollowUps[0]);
        }
        
        completedFollowUps.forEach(completedFu => {
          followUpList.push(completedFu);
        });
      }
    });

    followUpList.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    // Final dedup by _id — absolute guard against any edge-case duplicates
    const seenIds = new Set<string>();
    const myFollowUps = followUpList.filter((fu: any) => {
      const id = fu._id?.toString();
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    const response: ApiResponse = {
      success: true,
      message: 'Follow-ups retrieved successfully',
      data: { followUps: myFollowUps }
    };

    res.json(response);
  } catch (error) {
    logger.error('Get my follow-ups error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving follow-ups'
    });
  }
};
