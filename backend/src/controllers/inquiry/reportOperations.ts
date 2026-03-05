import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Inquiry from '../../models/Inquiry';
import User from '../../models/User';
import { ApiResponse } from '../../types';
import logger from '../../utils/logger';
import { isAdmittedStudent, isConvertedStudent, buildDateFilter, calculateDateRanges } from '../../helpers/inquiryHelpers';

/**
 * Get presales report
 */
export const getPresalesReport = async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const { dateRange, dateFrom, dateTo } = req.query as { dateRange?: string; dateFrom?: string; dateTo?: string };

    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This endpoint is only for admin users.'
      });
    }

    const ranges = calculateDateRanges();
    const dateFilter = buildDateFilter(dateRange, dateFrom, dateTo);

    const presalesUsers = await User.find({ role: 'presales', isActive: true })
      .select('_id name email')
      .lean();

    const presalesReport = await Promise.all(
      presalesUsers.map(async (user: any) => {
        const userId = user._id;

        const createdInquiries = await Inquiry.find({ 
          createdBy: userId,
          ...dateFilter
        })
          .select('_id name email phone course preferredLocation status createdAt followUps')
          .lean();

        const forwardedInquiries = await Inquiry.find({ 
          forwardedBy: userId,
          ...dateFilter
        })
          .select('_id name email phone course preferredLocation status createdAt')
          .lean();

        const totalCreated = createdInquiries.filter((inq: any) => !isAdmittedStudent(inq)).length;
        const totalForwarded = forwardedInquiries.filter((inq: any) => !isAdmittedStudent(inq)).length;

        let totalFollowupsCompleted = 0;
        let totalPendingFollowups = 0;

        let followupDateFilter: any = {};
        if (dateFrom && dateTo) {
          const fromDate = new Date(dateFrom);
          fromDate.setHours(0, 0, 0, 0);
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          followupDateFilter = { 'followUps.createdAt': { $gte: fromDate, $lte: toDate } };
        } else if (dateRange === 'today') {
          followupDateFilter = { 'followUps.createdAt': { $gte: ranges.todayStart, $lte: ranges.todayEnd } };
        } else if (dateRange === 'lastWeek') {
          followupDateFilter = { 'followUps.createdAt': { $gte: ranges.weekStart } };
        } else if (dateRange === 'lastMonth') {
          followupDateFilter = { 'followUps.createdAt': { $gte: ranges.monthStart } };
        } else if (dateRange === 'lastYear') {
          followupDateFilter = { 'followUps.createdAt': { $gte: ranges.yearStart } };
        }

        const inquiriesWithFollowups = await Inquiry.find({
          'followUps.createdBy': userId,
          ...followupDateFilter
        })
          .populate('followUps.createdBy', 'name email')
          .populate('forwardedBy', 'name email')
          .select('followUps _id name email phone course preferredLocation status createdAt department forwardedBy')
          .lean();

        inquiriesWithFollowups.forEach((inquiry: any) => {
          if (!inquiry.followUps || inquiry.followUps.length === 0) return;

          const forwardedById = inquiry.forwardedBy?._id 
            ? inquiry.forwardedBy._id.toString() 
            : inquiry.forwardedBy?.toString();
          
          const isForwardedToSales = inquiry.department === 'sales' && 
            forwardedById !== null && 
            forwardedById !== undefined;

          inquiry.followUps.forEach((followUp: any) => {
            const followUpCreatedById = followUp.createdBy?._id 
              ? followUp.createdBy._id.toString() 
              : (followUp.createdBy?.toString ? followUp.createdBy.toString() : followUp.createdBy);

            if (followUpCreatedById && followUpCreatedById === userId.toString()) {
              const followUpDate = new Date(followUp.createdAt);
              let includeFollowup = true;
              
              if (dateFrom && dateTo) {
                const fromDate = new Date(dateFrom);
                fromDate.setHours(0, 0, 0, 0);
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                includeFollowup = followUpDate >= fromDate && followUpDate <= toDate;
              } else if (dateRange === 'today') {
                includeFollowup = followUpDate >= ranges.todayStart && followUpDate <= ranges.todayEnd;
              } else if (dateRange === 'lastWeek') {
                includeFollowup = followUpDate >= ranges.weekStart;
              } else if (dateRange === 'lastMonth') {
                includeFollowup = followUpDate >= ranges.monthStart;
              } else if (dateRange === 'lastYear') {
                includeFollowup = followUpDate >= ranges.yearStart;
              }

              if (includeFollowup) {
                if (followUp.completionStatus === 'complete') {
                  totalFollowupsCompleted++;
                } else {
                  if (!isForwardedToSales) {
                    totalPendingFollowups++;
                  }
                }
              }
            }
          });
        });

        return {
          userId: userId.toString(),
          name: user.name,
          email: user.email,
          totalInquiriesCreated: totalCreated,
          totalInquiriesForwarded: totalForwarded,
          totalFollowupsCompleted,
          totalPendingFollowups
        };
      })
    );

    res.json({
      success: true,
      message: 'Presales report retrieved successfully',
      data: {
        users: presalesReport
      }
    });
  } catch (error: any) {
    logger.error('Get presales report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching presales report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get presales user details
 */
export const getPresalesUserDetails = async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const { userId } = req.params;

    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This endpoint is only for admin users.'
      });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId).select('_id name email role').lean();
    if (!user || user.role !== 'presales') {
      return res.status(404).json({
        success: false,
        message: 'Presales user not found'
      });
    }

    const createdInquiries = await Inquiry.find({ createdBy: userId })
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .select('_id name email phone course preferredLocation status createdAt followUps')
      .sort({ createdAt: -1 })
      .lean();

    const nonAdmittedCreatedInquiries = createdInquiries.filter((inq: any) => !isAdmittedStudent(inq));

    const inquiriesWithFollowups = await Inquiry.find({
      'followUps.createdBy': userId
    })
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('forwardedBy', 'name email')
      .populate('followUps.createdBy', 'name email')
      .select('_id name email phone course preferredLocation status createdAt followUps department forwardedBy')
      .sort({ createdAt: -1 })
      .lean();

    const pendingFollowups: any[] = [];
    inquiriesWithFollowups.forEach((inquiry: any) => {
      if (!inquiry.followUps || inquiry.followUps.length === 0) return;

      const forwardedById = inquiry.forwardedBy?._id 
        ? inquiry.forwardedBy._id.toString() 
        : inquiry.forwardedBy?.toString();
      
      const isForwardedToSales = inquiry.department === 'sales' && 
        forwardedById !== null && 
        forwardedById !== undefined;

      inquiry.followUps.forEach((followUp: any) => {
        const followUpCreatedById = followUp.createdBy?._id 
          ? followUp.createdBy._id.toString() 
          : followUp.createdBy?.toString();

        if (followUpCreatedById && followUpCreatedById === userId.toString()) {
          if (followUp.completionStatus !== 'complete' && !isForwardedToSales) {
            pendingFollowups.push({
              ...followUp,
              inquiry: {
                _id: inquiry._id,
                name: inquiry.name,
                email: inquiry.email,
                phone: inquiry.phone,
                course: inquiry.course,
                preferredLocation: inquiry.preferredLocation,
                status: inquiry.status,
                createdAt: inquiry.createdAt
              }
            });
          }
        }
      });
    });

    pendingFollowups.sort((a, b) => {
      const dateA = a.nextFollowUpDate ? new Date(a.nextFollowUpDate).getTime() : new Date(a.createdAt).getTime();
      const dateB = b.nextFollowUpDate ? new Date(b.nextFollowUpDate).getTime() : new Date(b.createdAt).getTime();
      return dateA - dateB;
    });

    res.json({
      success: true,
      message: 'Presales user details retrieved successfully',
      data: {
        user: {
          _id: user._id.toString(),
          name: user.name,
          email: user.email
        },
        createdInquiries: nonAdmittedCreatedInquiries,
        pendingFollowups
      }
    });
  } catch (error: any) {
    logger.error('Get presales user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching presales user details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get sales report
 */
export const getSalesReport = async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const { dateRange, dateFrom, dateTo } = req.query as { dateRange?: string; dateFrom?: string; dateTo?: string };

    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This endpoint is only for admin users.'
      });
    }

    const ranges = calculateDateRanges();
    const dateFilter = buildDateFilter(dateRange, dateFrom, dateTo);

    const salesUsers = await User.find({ role: 'sales', isActive: true })
      .select('_id name email')
      .lean();

    const salesReport = await Promise.all(
      salesUsers.map(async (user: any) => {
        const userId = user._id;

        const attendedInquiries = await Inquiry.find({ 
          assignedTo: userId,
          department: 'sales',
          ...dateFilter
        })
          .select('_id name email phone course preferredLocation status createdAt followUps')
          .lean();

        const totalAttended = attendedInquiries.length;

        const admittedInquiries = attendedInquiries.filter((inq: any) => isAdmittedStudent(inq));
        const totalConverted = admittedInquiries.length;

        // Calculate conversions (Hot + Conversion substage)
        const convertedInquiries = attendedInquiries.filter((inq: any) => isConvertedStudent(inq));
        const totalConversions = convertedInquiries.length;

        // Conversion rate is based on conversions vs attended inquiries
        const conversionRate = totalAttended > 0 
          ? Math.round((totalConversions / totalAttended) * 100 * 10) / 10 
          : 0;

        // CORRECTED LOGIC: Pending Followups
        // Rule: 1 inquiry = max 1 pending followup
        // Only count if inquiry is currently assigned to this user AND has incomplete followup
        const inquiriesWithFollowups = await Inquiry.find({
          'followUps.createdBy': userId,
          department: 'sales',
          assignedTo: userId  // CRITICAL: Must be currently assigned to this user
        })
          .populate('followUps.createdBy', 'name email')
          .select('followUps _id assignedTo')
          .lean();

        const inquiriesWithPendingFollowups = new Set<string>();

        inquiriesWithFollowups.forEach((inquiry: any) => {
          if (!inquiry.followUps || inquiry.followUps.length === 0) return;

          // Filter user's followups and sort by creation date (latest first)
          const userFollowups = inquiry.followUps
            .filter((followUp: any) => {
              const followUpCreatedById = followUp.createdBy?._id 
                ? followUp.createdBy._id.toString() 
                : (followUp.createdBy?.toString ? followUp.createdBy.toString() : followUp.createdBy);
              return followUpCreatedById && followUpCreatedById === userId.toString();
            })
            .sort((a: any, b: any) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

          if (userFollowups.length === 0) return;

          // Check if the LATEST followup is incomplete
          const latestFollowup = userFollowups[0];
          if (latestFollowup.completionStatus !== 'complete') {
            inquiriesWithPendingFollowups.add(inquiry._id.toString());
          }
        });

        const totalPendingFollowups = inquiriesWithPendingFollowups.size;

        // CORRECTED LOGIC: Completed Followups
        // Count ALL completed followups by this user (no date filter)
        // This matches the "My Completed Followups" page count
        const allInquiriesWithUserFollowups = await Inquiry.find({
          'followUps.createdBy': userId,
          department: 'sales'
        })
          .select('followUps')
          .lean();

        let totalFollowupsCompleted = 0;
        allInquiriesWithUserFollowups.forEach((inquiry: any) => {
          if (!inquiry.followUps || inquiry.followUps.length === 0) return;

          inquiry.followUps.forEach((followUp: any) => {
            const followUpCreatedById = followUp.createdBy?._id 
              ? followUp.createdBy._id.toString() 
              : (followUp.createdBy?.toString ? followUp.createdBy.toString() : followUp.createdBy);

            if (followUpCreatedById && followUpCreatedById === userId.toString()) {
              if (followUp.completionStatus === 'complete') {
                totalFollowupsCompleted++;
              }
            }
          });
        });

        return {
          userId: userId.toString(),
          name: user.name,
          email: user.email,
          totalInquiriesAttended: totalAttended,
          totalConvertedToAdmissions: totalConverted,
          totalConversions,
          conversionRate,
          totalFollowupsCompleted,
          totalPendingFollowups
        };
      })
    );

    res.json({
      success: true,
      message: 'Sales report retrieved successfully',
      data: {
        users: salesReport
      }
    });
  } catch (error: any) {
    logger.error('Get sales report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching sales report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get sales user details
 */
export const getSalesUserDetails = async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const { userId } = req.params;

    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This endpoint is only for admin users.'
      });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId).select('_id name email role').lean();
    if (!user || user.role !== 'sales') {
      return res.status(404).json({
        success: false,
        message: 'Sales user not found'
      });
    }

    const attendedInquiries = await Inquiry.find({ 
      assignedTo: userId,
      department: 'sales'
    })
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .select('_id name email phone course preferredLocation status createdAt updatedAt viewedByAssignedUserAt followUps')
      .sort({ createdAt: -1 })
      .lean();

    // CORRECTED LOGIC: Pending Followups for Detail Modal
    // Rule: 1 inquiry = max 1 pending followup
    // Only show if inquiry is currently assigned to this user
    const inquiriesWithFollowups = await Inquiry.find({
      'followUps.createdBy': userId,
      department: 'sales',
      assignedTo: userId  // CRITICAL: Must be currently assigned to this user
    })
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('followUps.createdBy', 'name email')
      .select('_id name email phone course preferredLocation status createdAt followUps department assignedTo')
      .sort({ createdAt: -1 })
      .lean();

    const pendingFollowups: any[] = [];

    inquiriesWithFollowups.forEach((inquiry: any) => {
      if (!inquiry.followUps || inquiry.followUps.length === 0) return;

      // Filter user's followups and sort by creation date (latest first)
      const userFollowups = inquiry.followUps
        .filter((followUp: any) => {
          const followUpCreatedById = followUp.createdBy?._id 
            ? followUp.createdBy._id.toString() 
            : followUp.createdBy?.toString();
          return followUpCreatedById && followUpCreatedById === userId.toString();
        })
        .sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      if (userFollowups.length === 0) return;

      // Only include the LATEST followup if it's incomplete
      const latestFollowup = userFollowups[0];
      if (latestFollowup.completionStatus !== 'complete') {
        pendingFollowups.push({
          ...latestFollowup,
          inquiry: {
            _id: inquiry._id,
            name: inquiry.name,
            email: inquiry.email,
            phone: inquiry.phone,
            course: inquiry.course,
            preferredLocation: inquiry.preferredLocation,
            status: inquiry.status,
            createdAt: inquiry.createdAt
          }
        });
      }
    });

    pendingFollowups.sort((a, b) => {
      const dateA = a.nextFollowUpDate ? new Date(a.nextFollowUpDate).getTime() : new Date(a.createdAt).getTime();
      const dateB = b.nextFollowUpDate ? new Date(b.nextFollowUpDate).getTime() : new Date(b.createdAt).getTime();
      return dateA - dateB;
    });

    res.json({
      success: true,
      message: 'Sales user details retrieved successfully',
      data: {
        user: {
          _id: user._id.toString(),
          name: user.name,
          email: user.email
        },
        attendedInquiries: attendedInquiries,
        pendingFollowups
      }
    });
  } catch (error: any) {
    logger.error('Get sales user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching sales user details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
