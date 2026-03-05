import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Inquiry from '../../models/Inquiry';
import Activity from '../../models/Activity';
import OptionSettings from '../../models/OptionSettings';
import { ApiResponse } from '../../types';
import logger from '../../utils/logger';
import { notifyUsers } from '../../utils/notify';
import { InputSanitizer } from '../../utils/inputSanitizer';
import { 
  emitBadgeUpdate, 
  emitInquiryOperation,
  emitDashboardRefresh,
  emitInquiryForwardedToSales
} from '../../services/socketService';
import { isAdmittedStudent, buildDateFilter } from '../../helpers/inquiryHelpers';

/**
 * Create a new inquiry
 */
export const createInquiry = async (req: Request, res: Response) => {
  try {
    const inquiryData: any = {
      ...req.body,
      createdBy: req.user?._id
    };

    // Set department based on user role
    const userRole = req.user?.role;
    const userId = req.user?._id;

    // Convert empty strings to undefined for optional fields
    if (inquiryData.email === '') {
      inquiryData.email = undefined;
    }
    if (inquiryData.message === '' && (userRole === 'sales' || !userRole)) {
      inquiryData.message = undefined;
    }
    
    // Handle forward to sales on creation (for presales/admin users)
    if (inquiryData.department === 'sales' && inquiryData.assignmentStatus === 'forwarded_to_sales') {
      inquiryData.forwardedBy = userId;
      inquiryData.forwardedAt = new Date();
      inquiryData.assignedTo = undefined;
      inquiryData.isUnattended = false;
      inquiryData.unattendedAt = undefined;
      inquiryData.viewedByAssignedUserAt = undefined;
    } else {
      if (userRole === 'sales') {
        inquiryData.department = 'sales';
        if (!inquiryData.forwardedAt) {
          inquiryData.forwardedAt = new Date();
        }
      } else {
        inquiryData.department = 'presales';
      }
      
      if (!inquiryData.assignedTo) {
        inquiryData.assignmentStatus = 'not_assigned';
      }
    }

    // Check if phone number already exists in admitted students
    if (inquiryData.phone) {
      const existingInquiriesWithFollowUps = await Inquiry.find({
        phone: inquiryData.phone
      }).select('followUps').lean();

      for (const inq of existingInquiriesWithFollowUps) {
        if (isAdmittedStudent(inq)) {
          logger.info(`Blocked inquiry creation - phone ${inquiryData.phone} already exists in admitted students`);
          return res.status(409).json({
            success: false,
            message: 'This phone number already exists in Admitted Students. Please use a different number or contact an administrator.',
            code: 'ADMITTED_STUDENT_EXISTS'
          });
        }
      }
    }

    // For sales users: Check for existing inquiries with the same phone number
    if (userRole === 'sales' && inquiryData.phone) {
      const existingInquiries = await Inquiry.find({
        phone: inquiryData.phone,
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
        logger.info(`Marked ${existingInquiries.length} existing inquiries as repeat for phone ${inquiryData.phone} (new inquiry created)`);
      }
    }

    const inquiry = new Inquiry(inquiryData);
    await inquiry.save();
    
    // Verify forwardedAt was saved for sales inquiries
    if (inquiryData.forwardedAt && inquiry.department === 'sales') {
      const savedInquiry = await Inquiry.findById(inquiry._id).select('forwardedAt').lean();
      if (!savedInquiry || !(savedInquiry as any).forwardedAt) {
        await Inquiry.updateOne(
          { _id: inquiry._id },
          { $set: { forwardedAt: inquiryData.forwardedAt } }
        );
        (inquiry as any).forwardedAt = inquiryData.forwardedAt;
      }
    }

    // Populate the inquiry with user details
    await inquiry.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'assignedTo', select: 'name email' },
      { path: 'forwardedBy', select: 'name email' }
    ]);

    // Create activity log and emit socket events for forwarded inquiries
    if (inquiryData.department === 'sales' && inquiryData.assignmentStatus === 'forwarded_to_sales') {
      try {
        await Activity.create({
          inquiry: inquiry._id,
          action: 'forwarded_to_sales',
          actor: userId!
        });
      } catch (e) {
        logger.warn('Activity log failed (forward_to_sales on create):', e);
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
        
        emitDashboardRefresh('admin');
        emitDashboardRefresh('presales');
        emitDashboardRefresh('sales');
        
        logger.info('✅ Real-time updates sent for inquiry forward to sales on create');
      } catch (socketError: any) {
        logger.warn('Socket emit failed (forward_to_sales on create):', socketError.message);
      }
    }

    const response: ApiResponse = {
      success: true,
      message: 'Inquiry created successfully',
      data: { inquiry }
    };

    res.status(201).json(response);

    // Activity log (non-blocking)
    try {
      await Activity.create({
        inquiry: inquiry._id,
        action: 'created',
        actor: req.user?._id!
      });
      await notifyUsers([], `Inquiry ${inquiry._id.toString()} created`);
    } catch (e) {
      logger.warn('Activity log failed (create):', e);
    }

    // Emit real-time updates for new inquiry
    try {
      emitBadgeUpdate({
        type: 'refresh',
        department: inquiryData.department,
        location: inquiryData.preferredLocation,
      });
      
      const targetUsers = inquiryData.assignedTo ? [inquiryData.assignedTo.toString()] : [];
      emitInquiryOperation('created', inquiry, targetUsers);
      
      emitDashboardRefresh('admin');
      emitDashboardRefresh(inquiryData.department);
      
      logger.info('✅ Real-time updates sent for inquiry creation');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (create inquiry):', socketError.message);
    }
  } catch (error) {
    logger.error('Create inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating inquiry'
    });
  }
};

/**
 * Get all inquiries with filtering
 */
export const getInquiries = async (req: Request, res: Response) => {
  try {
    const {
      search,
      status,
      course,
      location,
      medium,
      assignedTo,
      createdBy,
      dateRange,
      dateFrom,
      dateTo,
      dateField = 'createdAt',
      sort = 'createdAt',
      order = 'desc'
    } = req.query as any;
    
    const userRole = req.user?.role;
    const userId = req.user?._id;
    const centerPermissions = req.user?.centerPermissions || [];

    // Get dynamic options for filtering
    const optionSettings = await OptionSettings.findOne({ key: 'global' });
    const allowedStatuses = optionSettings?.statuses || ['hot', 'warm', 'cold'];
    const allowedLocations = optionSettings?.locations || ['Nagpur', 'Pune', 'Nashik', 'Indore'];
    const allowedCourses = optionSettings?.courses || ['CDEC', 'X-DSAAI', 'DevOps', 'Full-Stack', 'Any'];
    const allowedMediums = optionSettings?.mediums || ['IVR', 'Email', 'WhatsApp'];

    const query: any = {};
    
    // Build date filter
    const dateFilter = buildDateFilter(dateRange, dateFrom, dateTo, dateField);

    // Enforce center-based access control for Sales users
    if (userRole === 'sales') {
      const centerPermissions = req.user?.centerPermissions || [];
      
      // If filtering by specific location, ensure it's in permitted centers
      if (location) {
        // If the location is NOT permitted, force the query to return zero results 
        // by filtering for both the requested location AND something the user actually has permission for (impossible intersection)
        if (!centerPermissions.includes(location)) {
          query.$and = (query.$and || []).concat([
             { preferredLocation: location },
             { preferredLocation: { $in: centerPermissions } }
          ]);
        }
      } else {
        // 2. If NO location filter (potential All Inquiries page, Conversions, Admissions)
        const isSearch = search && search.trim() !== '';
        const isPersonalHistory = (assignedTo && (assignedTo === userId?.toString() || assignedTo === 'me')) ||
                                  (createdBy && (createdBy === userId?.toString() || createdBy === 'me'));

        // If not a global search and not personal history, restrict the results automatically
        // This allows Conversions/Admitted pages to work while keeping general data limited
        if (!isSearch && !isPersonalHistory) {
          query.$or = [
            { preferredLocation: { $in: centerPermissions } },
            { assignedTo: userId },
            { createdBy: userId }
          ];
        }
      }
    }

    // Handle specific createdBy filter
    if (createdBy === 'me') {
      query.createdBy = userId;
    } else {
      const requestedDepartment = (req.query as any).department;
      
      if (userRole === 'presales') {
        if (requestedDepartment === 'sales') {
          query.department = 'sales';
        } else {
          query.$and = [
            { department: 'presales' },
            {
              $or: [
                { forwardedBy: { $exists: false } },
                { forwardedBy: { $ne: userId } },
                { forwardedBy: null }
              ]
            }
          ];
        }
      } else if (userRole === 'sales') {
        query.department = 'sales';
      } else if (userRole === 'admin' && requestedDepartment) {
        query.department = requestedDepartment;
      }
    }

    // Apply filters with proper input sanitization
    if (search) {
      // Sanitize search input to prevent NoSQL injection
      const sanitizedSearch = InputSanitizer.sanitizeSearchQuery(search);
      
      if (sanitizedSearch.length === 0) {
        // If sanitized search is empty, skip search filter
        logger.warn('Search query was empty after sanitization', { originalSearch: search });
      } else {
        const phoneSearchQueries = [];
        phoneSearchQueries.push({ phone: { $regex: sanitizedSearch, $options: 'i' } });
        
        if (search.startsWith('+')) {
          const phoneWithoutPlus = sanitizedSearch.substring(2);
          if (phoneWithoutPlus) {
            phoneSearchQueries.push({ phone: { $regex: phoneWithoutPlus, $options: 'i' } });
          }
        } else {
          phoneSearchQueries.push({ phone: { $regex: '\\+' + sanitizedSearch, $options: 'i' } });
        }
        
        if (query.$or) {
          const searchQuery = {
            $or: [
              { name: { $regex: sanitizedSearch, $options: 'i' } },
              { email: { $regex: sanitizedSearch, $options: 'i' } },
              { city: { $regex: sanitizedSearch, $options: 'i' } },
              ...phoneSearchQueries
            ]
          };
          query.$and = [
            { $or: query.$or },
            searchQuery
          ];
          delete query.$or;
        } else {
          query.$or = [
            { name: { $regex: sanitizedSearch, $options: 'i' } },
            { email: { $regex: sanitizedSearch, $options: 'i' } },
            { city: { $regex: sanitizedSearch, $options: 'i' } },
            ...phoneSearchQueries
          ];
        }
      }
    }

    // Sanitize enum values - use dynamic statuses from options
    if (status) {
      const sanitizedStatus = InputSanitizer.sanitizeEnum(status, allowedStatuses);
      if (sanitizedStatus) {
        query.status = sanitizedStatus;
      }
    }

    if (createdBy && createdBy !== 'me') {
      const sanitizedCreatedBy = InputSanitizer.sanitizeObjectId(createdBy);
      if (sanitizedCreatedBy) {
        query.createdBy = sanitizedCreatedBy;
      }
    }

    // Handle assignedTo filter with proper sanitization
    if (assignedTo) {
      const sanitizedAssignedTo = assignedTo === 'me' ? userId : InputSanitizer.sanitizeObjectId(assignedTo);
      
      if (sanitizedAssignedTo) {
        if (userRole === 'presales') {
          const newQuery: any = {};
          
          const assignedQuery = { 
            assignedTo: sanitizedAssignedTo,
            department: 'presales'
          };
          const forwardedQuery = {
            forwardedBy: sanitizedAssignedTo,
            department: 'sales'
          };
          
          newQuery.$or = [assignedQuery, forwardedQuery];
          
          if (status) {
            const sanitizedStatus = InputSanitizer.sanitizeEnum(status, allowedStatuses);
            if (sanitizedStatus) {
              newQuery.status = sanitizedStatus;
            }
          }
          if (course) {
            const sanitizedCourse = InputSanitizer.sanitizeEnum(course, allowedCourses);
            if (sanitizedCourse) {
              newQuery.course = sanitizedCourse;
            }
          }
          if (location) {
            const sanitizedLocation = InputSanitizer.sanitizeEnum(location, allowedLocations);
            if (sanitizedLocation) {
              newQuery.preferredLocation = sanitizedLocation;
            }
          }
          if (medium) {
            const sanitizedMedium = InputSanitizer.sanitizeEnum(medium, allowedMediums);
            if (sanitizedMedium) {
              newQuery.medium = sanitizedMedium;
            }
          }
          if ((req.query as any).assignmentStatus) {
            const allowedAssignmentStatuses = ['not_assigned', 'assigned', 'reassigned', 'forwarded_to_sales'];
            const sanitizedAssignmentStatus = InputSanitizer.sanitizeEnum((req.query as any).assignmentStatus, allowedAssignmentStatuses);
            if (sanitizedAssignmentStatus) {
              newQuery.assignmentStatus = sanitizedAssignmentStatus;
            }
          }
        
        if (search) {
          const searchQuery = {
            $or: [
              { name: { $regex: search, $options: 'i' } },
              { email: { $regex: search, $options: 'i' } },
              { city: { $regex: search, $options: 'i' } }
            ]
          };
          newQuery.$and = [
            { $or: newQuery.$or },
            searchQuery
          ];
          delete newQuery.$or;
        }
        
        Object.assign(newQuery, dateFilter);
        
        Object.keys(query).forEach(key => delete query[key]);
        Object.assign(query, newQuery);
        } else if (userRole === 'sales') {
          const newQuery: any = {};
          
          newQuery.assignedTo = sanitizedAssignedTo;
          newQuery.department = 'sales';
          
          if (status) {
            const sanitizedStatus = InputSanitizer.sanitizeEnum(status, allowedStatuses);
            if (sanitizedStatus) {
              newQuery.status = sanitizedStatus;
            }
          }
          if (course) {
            const sanitizedCourse = InputSanitizer.sanitizeEnum(course, allowedCourses);
            if (sanitizedCourse) {
              newQuery.course = sanitizedCourse;
            }
          }
          if (location) {
            const sanitizedLocation = InputSanitizer.sanitizeEnum(location, allowedLocations);
            if (sanitizedLocation) {
              newQuery.preferredLocation = sanitizedLocation;
            }
          }
          if (medium) {
            const sanitizedMedium = InputSanitizer.sanitizeEnum(medium, allowedMediums);
            if (sanitizedMedium) {
              newQuery.medium = sanitizedMedium;
            }
          }
          if ((req.query as any).assignmentStatus) {
            const allowedAssignmentStatuses = ['not_assigned', 'assigned', 'reassigned', 'forwarded_to_sales'];
            const sanitizedAssignmentStatus = InputSanitizer.sanitizeEnum((req.query as any).assignmentStatus, allowedAssignmentStatuses);
            if (sanitizedAssignmentStatus) {
              newQuery.assignmentStatus = sanitizedAssignmentStatus;
            }
          }
        
        if (search) {
          const sanitizedSearch = InputSanitizer.sanitizeSearchQuery(search);
          if (sanitizedSearch.length > 0) {
            newQuery.$or = [
              { name: { $regex: sanitizedSearch, $options: 'i' } },
              { email: { $regex: sanitizedSearch, $options: 'i' } },
              { city: { $regex: sanitizedSearch, $options: 'i' } }
            ];
          }
        }
        
        Object.assign(newQuery, dateFilter);
        
        Object.keys(query).forEach(key => delete query[key]);
        Object.assign(query, newQuery);
        } else {
          query.assignedTo = sanitizedAssignedTo;
          if ((req.query as any).department) {
            const allowedDepartments = ['presales', 'sales'];
            const sanitizedDepartment = InputSanitizer.sanitizeEnum((req.query as any).department, allowedDepartments);
            if (sanitizedDepartment) {
              query.department = sanitizedDepartment;
            }
          }
          if ((req.query as any).assignmentStatus) {
            const allowedAssignmentStatuses = ['not_assigned', 'assigned', 'reassigned', 'forwarded_to_sales'];
            const sanitizedAssignmentStatus = InputSanitizer.sanitizeEnum((req.query as any).assignmentStatus, allowedAssignmentStatuses);
            if (sanitizedAssignmentStatus) {
              query.assignmentStatus = sanitizedAssignmentStatus;
            }
          }
          if (course) {
            const sanitizedCourse = InputSanitizer.sanitizeEnum(course, allowedCourses);
            if (sanitizedCourse) {
              query.course = sanitizedCourse;
            }
          }
          if (location) {
            const sanitizedLocation = InputSanitizer.sanitizeEnum(location, allowedLocations);
            if (sanitizedLocation) {
              query.preferredLocation = sanitizedLocation;
            }
          }
          if (medium) {
            const sanitizedMedium = InputSanitizer.sanitizeEnum(medium, allowedMediums);
            if (sanitizedMedium) {
              query.medium = sanitizedMedium;
            }
          }
        }
      }
    } else {
      const requestedDepartment = (req.query as any).department;
      if (requestedDepartment && 
          !(userRole === 'presales' && requestedDepartment === 'sales' && query.department === 'sales') &&
          !(userRole === 'presales' && query.$and)) {
        const allowedDepartments = ['presales', 'sales'];
        const sanitizedDepartment = InputSanitizer.sanitizeEnum(requestedDepartment, allowedDepartments);
        if (sanitizedDepartment) {
          query.department = sanitizedDepartment;
        }
      }
      if ((req.query as any).assignmentStatus) {
        const allowedAssignmentStatuses = ['not_assigned', 'assigned', 'reassigned', 'forwarded_to_sales'];
        const sanitizedAssignmentStatus = InputSanitizer.sanitizeEnum((req.query as any).assignmentStatus, allowedAssignmentStatuses);
        if (sanitizedAssignmentStatus) {
          query.assignmentStatus = sanitizedAssignmentStatus;
        }
      }
      if (course) {
        const sanitizedCourse = InputSanitizer.sanitizeEnum(course, allowedCourses);
        if (sanitizedCourse) {
          query.course = sanitizedCourse;
        }
      }
      if (location) {
        const sanitizedLocation = InputSanitizer.sanitizeEnum(location, allowedLocations);
        if (sanitizedLocation) {
          query.preferredLocation = sanitizedLocation;
        }
      }
      if (medium) {
        const sanitizedMedium = InputSanitizer.sanitizeEnum(medium, allowedMediums);
        if (sanitizedMedium) {
          query.medium = sanitizedMedium;
        }
      }
    }

    Object.assign(query, dateFilter);

    // Sanitize sort parameters
    const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'email', 'phone', 'city', 'status', 'course', 'preferredLocation'];
    const sanitizedSort = InputSanitizer.sanitizeSortField(sort, allowedSortFields);
    const sanitizedOrder = InputSanitizer.sanitizeSortOrder(order);
    
    const sortOrder = sanitizedOrder === 'desc' ? -1 : 1;
    const sortObj: any = {};
    sortObj[sanitizedSort] = sortOrder;

    const inquiries = await Inquiry.find(query)
      .select('+followUps +forwardedAt +viewedByAssignedUserAt') // Include fields needed for dashboard calculations
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('forwardedBy', 'name email')
      .sort(sortObj);

    const response: ApiResponse = {
      success: true,
      message: 'Inquiries retrieved successfully',
      data: { inquiries }
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Get inquiries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching inquiries',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get inquiry by ID
 */
export const getInquiryById = async (req: Request, res: Response) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('followUps.createdBy', 'name email');

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    // Check access permissions
    const userRole = req.user?.role;
    const createdById = typeof inquiry.createdBy === 'string' ? inquiry.createdBy : inquiry.createdBy._id;
    const assignedToId = typeof inquiry.assignedTo === 'string' ? inquiry.assignedTo : inquiry.assignedTo?._id;
    
    const canAccess = 
      userRole === 'admin' ||
      userRole === 'presales' ||
      (userRole === 'sales' && (
        assignedToId?.toString() === req.user?._id?.toString() || 
        createdById.toString() === req.user?._id?.toString() ||
        inquiry.department === 'sales'
      ));

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const response: ApiResponse = {
      success: true,
      message: 'Inquiry retrieved successfully',
      data: { inquiry }
    };

    return res.json(response);
  } catch (error) {
    logger.error('Get inquiry by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching inquiry'
    });
  }
};

/**
 * Update inquiry
 */
export const updateInquiry = async (req: Request, res: Response) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    // Check permissions
    const userRole = req.user?.role;
    const userId = req.user?._id;
    
    if (userRole === 'admin') {
      // Admin can update
    } else if (userRole === 'presales') {
      if (inquiry.department !== 'presales') {
        return res.status(403).json({
          success: false,
          message: 'Cannot edit inquiry after forwarding to sales'
        });
      }
    } else if (userRole === 'sales') {
      if (inquiry.department !== 'sales') {
        return res.status(403).json({
          success: false,
          message: 'Cannot edit presales inquiries'
        });
      }
      const assignedToId = typeof inquiry.assignedTo === 'string' ? inquiry.assignedTo : inquiry.assignedTo?._id;
      if (!assignedToId || assignedToId.toString() !== userId?.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only edit inquiries assigned to you'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get the original inquiry to compare changes
    const originalInquiry = await Inquiry.findById(req.params.id).lean();
    
    const updatedInquiry = await Inquiry.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email')
     .populate('assignedTo', 'name email');

    // Track what fields were changed
    const changedFields: string[] = [];
    const changeDetails: string[] = [];
    
    if (originalInquiry) {
      const fieldsToTrack = ['name', 'email', 'phone', 'city', 'education', 'course', 'preferredLocation', 'medium', 'message', 'status'];
      
      fieldsToTrack.forEach(field => {
        const oldValue = (originalInquiry as any)[field];
        const newValue = (updatedInquiry as any)?.[field];
        
        const normalizeValue = (val: any) => {
          if (val === null || val === undefined || val === '') return '';
          return String(val).trim();
        };
        
        const normalizedOld = normalizeValue(oldValue);
        const normalizedNew = normalizeValue(newValue);
        
        if (normalizedOld !== normalizedNew) {
          changedFields.push(field);
          const fieldLabels: { [key: string]: string } = {
            name: 'Name',
            email: 'Email',
            phone: 'Phone',
            city: 'City',
            education: 'Education',
            course: 'Course',
            preferredLocation: 'Preferred Location',
            medium: 'Medium',
            message: 'Message',
            status: 'Status'
          };
          
          const fieldLabel = fieldLabels[field] || field.charAt(0).toUpperCase() + field.slice(1);
          const oldDisplay = normalizedOld || '(empty)';
          const newDisplay = normalizedNew || '(empty)';
          changeDetails.push(`${fieldLabel}: "${oldDisplay}" → "${newDisplay}"`);
        }
      });
    }

    // Create activity log for edit (non-blocking)
    if (changedFields.length > 0) {
      try {
        await Activity.create({
          inquiry: req.params.id,
          action: 'edited',
          actor: userId!,
          details: changeDetails.join('; ')
        });
        logger.info(`✅ Activity log created for inquiry edit: ${changedFields.join(', ')}`);
      } catch (e) {
        logger.warn('Activity log failed (edit):', e);
      }
    }

    const response: ApiResponse = {
      success: true,
      message: 'Inquiry updated successfully',
      data: { inquiry: updatedInquiry }
    };

    res.json(response);

    // Emit real-time updates for inquiry update
    try {
      emitBadgeUpdate({
        type: 'refresh',
        department: updatedInquiry?.department,
        location: updatedInquiry?.preferredLocation,
      });
      
      const targetUsers = updatedInquiry?.assignedTo ? [updatedInquiry.assignedTo.toString()] : [];
      emitInquiryOperation('updated', updatedInquiry, targetUsers);
      
      emitDashboardRefresh('admin');
      if (updatedInquiry?.department) {
        emitDashboardRefresh(updatedInquiry.department);
      }
      
      logger.info('✅ Real-time updates sent for inquiry update');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (update inquiry):', socketError.message);
    }
  } catch (error: any) {
    logger.error('Update inquiry error:', error);
    
    if (error.name === 'ValidationError') {
      const validationMessages = Object.values(error.errors).map((err: any) => err.message).join(', ');
      return res.status(400).json({
        success: false,
        message: validationMessages || 'Validation error while updating inquiry'
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while updating inquiry'
    });
  }
};

/**
 * Delete inquiry
 */
export const deleteInquiry = async (req: Request, res: Response) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    // Admin, presales, or creator can delete
    const canDelete = 
      req.user?.role === 'admin' ||
      req.user?.role === 'presales' ||
      inquiry.createdBy.toString() === req.user?._id?.toString();

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await Inquiry.findByIdAndDelete(req.params.id);

    const response: ApiResponse = {
      success: true,
      message: 'Inquiry deleted successfully'
    };

    res.json(response);

    // Emit real-time updates for inquiry deletion
    try {
      emitBadgeUpdate({
        type: 'refresh',
        department: inquiry.department,
        location: inquiry.preferredLocation,
      });
      
      emitInquiryOperation('deleted', { inquiryId: req.params.id, _id: req.params.id });
      
      emitDashboardRefresh('admin');
      emitDashboardRefresh(inquiry.department);
      
      logger.info('✅ Real-time updates sent for inquiry deletion');
    } catch (socketError: any) {
      logger.warn('Socket emit failed (delete inquiry):', socketError.message);
    }
  } catch (error) {
    logger.error('Delete inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting inquiry'
    });
  }
};

/**
 * Append a new message to an existing inquiry (duplicate-phone flow)
 */
export const appendMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user?._id;

    const trimmed = (message || '').trim();
    if (!trimmed) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    if (trimmed.length < 3) {
      return res.status(400).json({ success: false, message: 'Message must be at least 3 characters' });
    }
    if (trimmed.length > 1000) {
      return res.status(400).json({ success: false, message: 'Message cannot exceed 1000 characters' });
    }

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found' });
    }

    // Append to messages array (atomic push keeps existing data safe)
    await Inquiry.findByIdAndUpdate(id, {
      $push: {
        messages: { text: trimmed, addedBy: userId, createdAt: new Date() }
      }
    });

    // Record activity so it shows up in the timeline
    await Activity.create({
      inquiry: id,
      action: 'message_added',
      actor: userId,
      details: trimmed
    });

    logger.info(`Message appended to inquiry ${id} by user ${userId}`);

    return res.json({
      success: true,
      message: 'Message appended successfully'
    });
  } catch (error: any) {
    logger.error('Append message error:', error);
    return res.status(500).json({ success: false, message: 'Server error while appending message' });
  }
};
