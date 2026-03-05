import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Inquiry from '../../models/Inquiry';
import User from '../../models/User';
import Activity from '../../models/Activity';
import OptionSettings from '../../models/OptionSettings';
import { ApiResponse } from '../../types';
import logger from '../../utils/logger';
import { notifyUsers } from '../../utils/notify';
import { emitBadgeUpdate, emitDashboardRefresh } from '../../services/socketService';
import { isAdmittedStudent } from '../../helpers/inquiryHelpers';

/**
 * Check if phone number exists
 */
export const checkPhoneExists = async (req: Request, res: Response) => {
  try {
    const { phone } = req.query;
    const userRole = req.user?.role;
    
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const trimmedPhone = phone.trim();
    if (!trimmedPhone.startsWith('+')) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must include country code (e.g., +91)'
      });
    }
    
    const phoneWithoutPlus = trimmedPhone.substring(1);
    if (!/^[0-9]{10,}$/.test(phoneWithoutPlus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Expected format: +[country code][10 digits]'
      });
    }

    const query: any = { phone: trimmedPhone };
    
    if (userRole === 'sales') {
      query.department = 'sales';
    } else if (userRole === 'presales') {
      query.department = { $in: ['presales', 'sales'] };
    }

    const allMatchingInquiries = await Inquiry.find(query)
      .select('_id assignedTo assignmentStatus department isUnattended createdAt followUps')
      .sort({ createdAt: -1 })
      .lean();
    
    const admittedInquiry = allMatchingInquiries.find(inq => isAdmittedStudent(inq));
    
    let existingInquiry = admittedInquiry || allMatchingInquiries.find(inq => inq.assignedTo);
    if (!existingInquiry) {
      existingInquiry = allMatchingInquiries[0] || null;
    }
    
    const response: ApiResponse = {
      success: true,
      message: existingInquiry ? 'Phone number already exists' : 'Phone number is available',
      data: { 
        exists: !!existingInquiry,
        inquiryId: existingInquiry?._id?.toString(),
        isAssigned: !!existingInquiry?.assignedTo,
        isUnattended: !!existingInquiry?.isUnattended,
        isAdmitted: !!admittedInquiry,
        assignmentStatus: existingInquiry?.assignmentStatus,
        department: existingInquiry?.department
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Check phone exists error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking phone number'
    });
  }
};

/**
 * Get unattended inquiry counts
 */
export const getUnattendedInquiryCounts = async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const userId = req.user?._id;

    let baseQuery: any = {};

    const newInquiryCondition = {
      $and: [
        {
          $or: [
            { assignedTo: { $exists: false } },
            { assignedTo: null }
          ]
        },
        { isUnattended: { $ne: true } }
      ]
    };

    if (userRole === 'presales') {
      baseQuery.$and = [
        { department: 'presales' },
        newInquiryCondition
      ];
    } else if (userRole === 'sales') {
      const centerPermissions = req.user?.centerPermissions || [];
      baseQuery.$and = [
        { department: 'sales' },
        { preferredLocation: { $in: centerPermissions } },
        newInquiryCondition
      ];
    } else if (userRole === 'admin') {
      baseQuery.$and = [
        { department: 'sales' },
        newInquiryCondition
      ];
    } else {
      return res.json({
        success: true,
        message: 'Unattended inquiry counts retrieved successfully',
        data: {
          total: 0,
          byLocation: {}
        }
      });
    }

    const totalCount = await Inquiry.countDocuments(baseQuery);

    const locationCounts: { [key: string]: number } = {};
    
    const optionSettings = await OptionSettings.findOne({ key: 'global' });
    const locations = optionSettings?.locations || ['Nagpur', 'Pune', 'Nashik', 'Indore'];

    for (const location of locations) {
      let locationQuery: any = {};
      
      if (baseQuery.$and) {
        locationQuery.$and = [
          ...baseQuery.$and,
          { preferredLocation: location }
        ];
      } else {
        locationQuery.$and = [
          baseQuery,
          { preferredLocation: location }
        ];
      }
      
      const count = await Inquiry.countDocuments(locationQuery);
      locationCounts[location] = count;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Unattended inquiry counts retrieved successfully',
      data: {
        total: totalCount,
        byLocation: locationCounts
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Get unattended inquiry counts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching unattended inquiry counts'
    });
  }
};

/**
 * Get inquiry activities
 */
export const getInquiryActivities = async (req: Request, res: Response) => {
  try {
    const inquiryId = req.params.id;
    
    const inquiry = await Inquiry.findById(inquiryId)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('forwardedBy', 'name email')
      .populate('followUps.createdBy', 'name email');

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    const userRole = req.user?.role;
    const createdById = inquiry.createdBy 
      ? (typeof inquiry.createdBy === 'string' ? inquiry.createdBy : inquiry.createdBy._id)
      : null;
    const assignedToId = inquiry.assignedTo
      ? (typeof inquiry.assignedTo === 'string' ? inquiry.assignedTo : inquiry.assignedTo?._id)
      : null;
    
    const canAccess = 
      userRole === 'admin' ||
      userRole === 'presales' ||
      (userRole === 'sales' && (
        (assignedToId && assignedToId.toString() === req.user?._id?.toString()) || 
        (createdById && createdById.toString() === req.user?._id?.toString()) ||
        inquiry.department === 'sales'
      ));

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const activities = await Activity.find({ inquiry: inquiryId })
      .populate('actor', 'name email')
      .populate('targetUser', 'name email')
      .sort({ createdAt: -1 });

    const allActivities: any[] = [];

    // Add creation activity with null checks
    const creationActivity = activities.find(a => a.action === 'created');
    if (creationActivity && creationActivity.actor) {
      const actorName = (creationActivity.actor as any)?.name || 'Unknown User';
      allActivities.push({
        type: 'created',
        actor: creationActivity.actor,
        timestamp: creationActivity.createdAt,
        details: `Inquiry created by ${actorName}`
      });
    } else if (inquiry.createdBy) {
      const creatorName = (inquiry.createdBy as any)?.name || 'Unknown User';
      allActivities.push({
        type: 'created',
        actor: inquiry.createdBy,
        timestamp: inquiry.createdAt,
        details: `Inquiry created by ${creatorName}`
      });
    } else {
      // Fallback if no creator information is available
      allActivities.push({
        type: 'created',
        actor: null,
        timestamp: inquiry.createdAt,
        details: 'Inquiry created'
      });
    }

    // Process other activities with null checks
    activities
      .filter(a => a.action !== 'created')
      .forEach(activity => {
        try {
          let details = '';
          const actorName = activity.actor ? ((activity.actor as any)?.name || 'Unknown User') : 'Unknown User';
          const targetUserName = activity.targetUser ? ((activity.targetUser as any)?.name || 'Unknown User') : null;

          switch (activity.action) {
            case 'claimed':
              details = `Inquiry claimed by ${actorName}`;
              break;
            case 'assigned':
              details = targetUserName 
                ? `Inquiry assigned to ${targetUserName} by ${actorName}`
                : `Inquiry assigned by ${actorName}`;
              break;
            case 'reassigned':
              details = targetUserName 
                ? `Inquiry reassigned from ${actorName} to ${targetUserName}`
                : `Inquiry reassigned by ${actorName}`;
              break;
            case 'forwarded_to_sales':
              details = `Inquiry forwarded to Sales by ${actorName}`;
              break;
            case 'moved_to_unattended':
              details = `Inquiry moved to unattended by ${actorName}`;
              break;
            case 'edited':
              details = activity.details 
                ? `Inquiry edited by ${actorName}`
                : `Inquiry edited by ${actorName}`;
              break;
            case 'message_added':
              details = `Message added by ${actorName}`;
              break;
            default:
              details = activity.details || `Action performed by ${actorName}`;
          }

          allActivities.push({
            type: activity.action,
            actor: activity.actor,
            targetUser: activity.targetUser,
            timestamp: activity.createdAt,
            details,
            editDetails: activity.action === 'edited' ? activity.details : undefined,
            messageContent: activity.action === 'message_added' ? activity.details : undefined
          });
        } catch (activityError) {
          // Log the error but continue processing other activities
          logger.warn(`Error processing activity ${activity._id}:`, activityError);
        }
      });

    // Process follow-ups with null checks
    if (inquiry.followUps && inquiry.followUps.length > 0) {
      inquiry.followUps.forEach((followUp: any) => {
        try {
          const createdBy = followUp.createdBy || null;
          const createdByName = createdBy ? ((createdBy as any)?.name || 'Unknown User') : 'Unknown User';
          const followUpDate = followUp.createdAt || new Date();
          
          let details = '';
          if (inquiry.department === 'sales' && followUp.leadStage) {
            details = `Follow-up added by ${createdByName}`;
          } else {
            details = `Follow-up added by ${createdByName}`;
          }

          allActivities.push({
            type: 'follow_up',
            actor: followUp.createdBy,
            timestamp: followUpDate,
            details,
            followUpData: {
              type: followUp.type,
              message: followUp.message,
              leadStage: followUp.leadStage,
              subStage: followUp.subStage,
              status: followUp.status,
              nextFollowUpDate: followUp.nextFollowUpDate,
              nextFollowUpTime: followUp.nextFollowUpTime,
              isCompleted: followUp.isCompleted
            }
          });
        } catch (followUpError) {
          // Log the error but continue processing other follow-ups
          logger.warn(`Error processing follow-up:`, followUpError);
        }
      });
    }

    allActivities.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateB - dateA;
    });

    const response: ApiResponse = {
      success: true,
      message: 'Activities retrieved successfully',
      data: { activities: allActivities }
    };

    return res.json(response);
  } catch (error: any) {
    logger.error('Get inquiry activities error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching activities'
    });
  }
};

/**
 * Log a WhatsApp contact activity for an inquiry
 */
export const logWhatsAppContact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
    }

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found' });
    }

    const user = await User.findById(userId).select('name');
    const userName = user?.name || 'Unknown';

    await Activity.create({
      inquiry: inquiry._id,
      action: 'whatsapp_contact',
      actor: userId,
      details: `${userName} initiated WhatsApp chat with the inquiry contact`,
    });

    return res.json({ success: true, message: 'WhatsApp contact activity logged' });
  } catch (error: any) {
    logger.error('Log WhatsApp contact error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while logging WhatsApp activity'
    });
  }
};
