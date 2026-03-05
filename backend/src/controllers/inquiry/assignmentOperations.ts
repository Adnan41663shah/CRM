import { Request, Response } from 'express';
import Inquiry from '../../models/Inquiry';
import Activity from '../../models/Activity';
import User from '../../models/User';
import { ApiResponse } from '../../types';
import logger from '../../utils/logger';
import { notifyUsers } from '../../utils/notify';
import { 
  emitBadgeUpdate, 
  emitInquiryOperation,
  emitDashboardRefresh,
  emitNotification,
  emitInquiryForwardedToSales
} from '../../services/socketService';

/**
 * Assign inquiry to a user
 */
export const assignInquiry = async (req: Request, res: Response) => {
  try {
    const { assignedTo } = req.body;
    const inquiryId = req.params.id;

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    const user = await User.findById(assignedTo);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    inquiry.assignedTo = assignedTo;
    inquiry.assignmentStatus = 'assigned';
    inquiry.department = 'presales';
    if (inquiry.isUnattended) {
      inquiry.isUnattended = false;
      inquiry.unattendedAt = undefined;
    }
    await inquiry.save();

    try {
      await Activity.create({
        inquiry: inquiry._id,
        action: 'assigned',
        actor: req.user?._id!,
        targetUser: assignedTo
      });
      await notifyUsers([String(assignedTo)], `Inquiry ${inquiry._id.toString()} assigned to you`);
    } catch (e) {
      logger.warn('Activity log failed (assign):', e);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Inquiry assigned successfully',
      data: { inquiry }
    };

    res.json(response);

    try {
      emitBadgeUpdate({
        type: 'refresh',
        department: inquiry.department,
        location: inquiry.preferredLocation,
      });
      
      emitInquiryOperation('assigned', inquiry, [assignedTo.toString()]);
      
      emitNotification(assignedTo.toString(), {
        type: 'info',
        title: 'New Inquiry Assigned',
        message: `You have been assigned inquiry #${inquiryId}`,
        action: { label: 'View', link: `/inquiries/${inquiryId}` }
      });
      
      emitDashboardRefresh('admin');
      emitDashboardRefresh(inquiry.department);
      
      logger.info('✅ Real-time updates sent for inquiry assignment');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (assign inquiry):', socketError.message);
    }
  } catch (error) {
    logger.error('Assign inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while assigning inquiry'
    });
  }
};

/**
 * Claim inquiry (for sales users)
 */
export const claimInquiry = async (req: Request, res: Response) => {
  try {
    const inquiryId = req.params.id;
    const userId = req.user?._id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found' });
    }

    if (userRole === 'presales') {
      return res.status(403).json({ success: false, message: 'Presales users no longer need to attend inquiries. You can directly view, edit, add follow-ups, and forward inquiries.' });
    }
    if (userRole === 'sales' && inquiry.department !== 'sales') {
      return res.status(400).json({ success: false, message: 'Inquiry not in Sales' });
    }

    if (inquiry.assignedTo) {
      return res.status(409).json({ success: false, message: 'Inquiry already assigned' });
    }

    if (userRole === 'sales' && inquiry.department === 'sales') {
      const existingInquiries = await Inquiry.find({
        _id: { $ne: inquiryId },
        phone: inquiry.phone,
        department: 'sales',
        assignedTo: userId,
        isUnattended: { $ne: true }
      });

      if (existingInquiries.length > 0) {
        await Inquiry.updateMany(
          { _id: { $in: existingInquiries.map(inq => inq._id) } },
          {
            $set: {
              isUnattended: true,
              unattendedAt: new Date()
            },
            $unset: {
              viewedByAssignedUserAt: ""
            }
          }
        );
        logger.info(`Marked ${existingInquiries.length} existing inquiries as repeat for phone ${inquiry.phone} (same user claim)`);
      }
    }

    inquiry.assignedTo = userId as any;
    inquiry.assignmentStatus = 'assigned';
    if (inquiry.isUnattended) {
      inquiry.isUnattended = false;
      inquiry.unattendedAt = undefined;
    }
    inquiry.viewedByAssignedUserAt = undefined;
    await inquiry.save({ validateBeforeSave: false });

    try {
      await Activity.create({
        inquiry: inquiry._id,
        action: 'claimed',
        actor: req.user?._id!
      });
      if (inquiry.createdBy) {
        await notifyUsers([String(inquiry.createdBy)], `Inquiry ${inquiry._id.toString()} claimed`);
      }
    } catch (e) {
      logger.warn('Activity log failed (claim):', e);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Inquiry claimed successfully',
      data: { inquiry }
    };
    
    try {
      emitBadgeUpdate({
        type: 'refresh',
        department: inquiry.department,
        location: inquiry.preferredLocation,
      });
      
      emitInquiryOperation('assigned', inquiry, [userId.toString()]);
      
      emitDashboardRefresh('admin');
      emitDashboardRefresh(inquiry.department);
      
      logger.info('✅ Real-time updates sent for inquiry claim');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (claim inquiry):', socketError.message);
    }
    
    return res.json(response);
  } catch (error: any) {
    logger.error('Claim inquiry error:', error);
    const errorMessage = error?.message || 'Unknown error';
    logger.error('Claim inquiry error details:', { errorMessage, stack: error?.stack });
    return res.status(500).json({ 
      success: false, 
      message: errorMessage.includes('validation') 
        ? 'Validation error while claiming inquiry' 
        : 'Server error while claiming inquiry' 
    });
  }
};

/**
 * Forward inquiry to sales department
 */
export const forwardInquiryToSales = async (req: Request, res: Response) => {
  try {
    const inquiryId = req.params.id;
    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found' });
    }

    const canForward = req.user?.role === 'presales' || req.user?.role === 'admin';
    if (!canForward) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const existingInquiries = await Inquiry.find({
      _id: { $ne: inquiryId },
      phone: inquiry.phone,
      department: 'sales',
      assignedTo: { $exists: true, $ne: null }
    });

    if (existingInquiries.length > 0) {
      await Inquiry.updateMany(
        {
          _id: { $in: existingInquiries.map(inq => inq._id) },
          isUnattended: { $ne: true }
        },
        {
          $set: {
            isUnattended: true,
            unattendedAt: new Date()
          },
          $unset: {
            viewedByAssignedUserAt: ""
          }
        }
      );
      logger.info(`Marked ${existingInquiries.length} existing inquiries as repeat for phone ${inquiry.phone}`);
    }

    const forwardedByUserId = inquiry.assignedTo || req.user?._id;
    
    inquiry.department = 'sales';
    inquiry.assignmentStatus = 'forwarded_to_sales';
    inquiry.forwardedBy = forwardedByUserId as any;
    const inquiryDoc = inquiry as any;
    if (!inquiryDoc.forwardedAt) {
      inquiryDoc.forwardedAt = new Date();
      inquiry.markModified('forwardedAt');
    }
    inquiry.assignedTo = undefined;
    inquiry.isUnattended = false;
    inquiry.unattendedAt = undefined;
    inquiry.viewedByAssignedUserAt = undefined;
    
    await inquiry.save();
    
    if (inquiryDoc.forwardedAt) {
      const savedInquiry = await Inquiry.findById(inquiry._id).select('forwardedAt').lean();
      if (!savedInquiry || !(savedInquiry as any).forwardedAt) {
        await Inquiry.updateOne(
          { _id: inquiry._id },
          { $set: { forwardedAt: inquiryDoc.forwardedAt } }
        );
      }
    }

    try {
      await Activity.create({
        inquiry: inquiry._id,
        action: 'forwarded_to_sales',
        actor: req.user?._id!
      });
      if (inquiry.assignedTo) {
        await notifyUsers([String(inquiry.assignedTo)], `Inquiry ${inquiry._id.toString()} forwarded to Sales`);
      }
    } catch (e) {
      logger.warn('Activity log failed (forward_to_sales):', e);
    }

    try {
      emitInquiryForwardedToSales({
        inquiryId: inquiry._id.toString(),
        department: 'sales',
        location: inquiry.preferredLocation,
        timestamp: new Date().toISOString(),
      });

      emitBadgeUpdate({
        type: 'refresh',
        department: 'sales',
        location: inquiry.preferredLocation,
      });
      
      emitInquiryOperation('updated', inquiry, []);
      
      emitDashboardRefresh('admin');
      emitDashboardRefresh('presales');
      emitDashboardRefresh('sales');
      
      logger.info('✅ Real-time updates sent for inquiry forward to sales');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (forward_to_sales):', socketError.message);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Inquiry forwarded to Sales',
      data: { inquiry }
    };
    return res.json(response);
  } catch (error) {
    logger.error('Forward to sales error:', error);
    return res.status(500).json({ success: false, message: 'Server error while forwarding inquiry' });
  }
};


/**
 * Reassign inquiry to sales user
 */
export const reassignInquiryToSales = async (req: Request, res: Response) => {
  try {
    const inquiryId = req.params.id;
    const { targetUserId } = req.body as { targetUserId: string };

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found' });
    }
    if (inquiry.department !== 'sales') {
      return res.status(400).json({ success: false, message: 'Inquiry is not in Sales' });
    }

    const isOwner = inquiry.assignedTo?.toString() === req.user?._id?.toString();
    const canReassign = isOwner || req.user?.role === 'sales' || req.user?.role === 'admin';
    if (!canReassign) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const user = await User.findById(targetUserId);
    if (!user || user.role !== 'sales' || !user.isActive) {
      return res.status(400).json({ success: false, message: 'Target user must be an active sales user' });
    }

    inquiry.assignedTo = targetUserId as any;
    inquiry.assignmentStatus = 'reassigned';

    const currentUserId = req.user?._id;
    if (currentUserId && inquiry.followUps && inquiry.followUps.length > 0) {
      inquiry.followUps.forEach((fu: any) => {
        const createdById = fu.createdBy?._id 
          ? fu.createdBy._id.toString() 
          : (fu.createdBy?.toString ? fu.createdBy.toString() : fu.createdBy);
           
        if (createdById === currentUserId.toString() && fu.completionStatus !== 'complete') {
           fu.completionStatus = 'complete';
        }
      });
    }

    await inquiry.save({ validateBeforeSave: false });

    try {
      await Activity.create({
        inquiry: inquiry._id,
        action: 'reassigned',
        actor: req.user?._id!,
        targetUser: targetUserId
      });
      await notifyUsers([String(targetUserId)], `Inquiry ${inquiry._id.toString()} reassigned to you`);
    } catch (e) {
      logger.warn('Activity log failed (reassign):', e);
    }

    try {
      emitBadgeUpdate({
        type: 'refresh',
        department: 'sales',
        location: inquiry.preferredLocation,
      });

      emitInquiryOperation('updated', inquiry, [targetUserId.toString()]);

      emitNotification(targetUserId.toString(), {
        type: 'info',
        title: 'Inquiry Reassigned',
        message: `An inquiry (#${inquiryId}) has been reassigned to you`,
        action: { label: 'View', link: `/inquiries/${inquiryId}` }
      });

      emitDashboardRefresh('admin');
      emitDashboardRefresh('sales');
      
      logger.info('✅ Real-time updates sent for inquiry reassignment');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (reassign inquiry):', socketError.message);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Inquiry reassigned to sales user',
      data: { inquiry }
    };
    return res.json(response);
  } catch (error) {
    logger.error('Reassign inquiry error:', error);
    return res.status(500).json({ success: false, message: 'Server error while reassigning inquiry' });
  }
};
