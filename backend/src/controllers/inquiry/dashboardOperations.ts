import { Request, Response } from 'express';
import Inquiry from '../../models/Inquiry';
import User from '../../models/User';
import Activity from '../../models/Activity';
import OptionSettings from '../../models/OptionSettings';
import { ApiResponse, DashboardStats } from '../../types';
import logger from '../../utils/logger';
import { isAdmittedStudent, isConvertedStudent, calculateDateRanges, buildDateFilter } from '../../helpers/inquiryHelpers';
import {
  addIsAdmittedField,
  addAdmittedConvertedFlags,
  matchNonAdmitted,
  getCountsByStatus,
  getNonAdmittedCount,
  getAdmittedCount,
  getAdminOverviewMetrics,
  getLast7DaysTrend,
  getSalesUserPerformance,
  getPendingFollowUpsCount,
  getAdminAnalytics
} from '../../helpers/dashboardAggregation';

/**
 * Get dashboard statistics (uses aggregation - no full list loading)
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const userRole = req.user?.role;

    const optionSettings = await OptionSettings.findOne({ key: 'global' });
    const allowedStatuses = optionSettings?.statuses || ['hot', 'warm', 'cold'];

    let query: any = {};
    let myInquiriesQuery: any = {};

    if (userRole === 'presales') {
      query.department = 'presales';
      myInquiriesQuery.createdBy = userId;
    } else if (userRole === 'sales') {
      query.$or = [
        { assignedTo: userId },
        { createdBy: userId },
        { department: 'sales' }
      ];
      myInquiriesQuery.createdBy = userId;
    } else if (userRole === 'admin') {
      myInquiriesQuery.createdBy = userId;
    }

    const attendedInquiriesQuery = {
      $or: [
        { assignedTo: userId },
        { forwardedBy: userId }
      ]
    };

    const [
      mainCounts,
      myInquiriesCount,
      attendedCount,
      presalesCount,
      salesCount,
      admittedStudentsCount,
      recentIdsResult
    ] = await Promise.all([
      getCountsByStatus(Inquiry, query, allowedStatuses),
      getNonAdmittedCount(Inquiry, myInquiriesQuery),
      getNonAdmittedCount(Inquiry, attendedInquiriesQuery),
      getNonAdmittedCount(Inquiry, { department: 'presales' }),
      getNonAdmittedCount(Inquiry, { department: 'sales' }),
      getAdmittedCount(Inquiry),
      Inquiry.aggregate([
        { $match: query },
        addIsAdmittedField,
        addAdmittedConvertedFlags,
        matchNonAdmitted,
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
        { $project: { _id: 1 } }
      ])
    ]);

    const totalInquiries = mainCounts.total;
    const hotInquiries = mainCounts.hot ?? 0;
    const warmInquiries = mainCounts.warm ?? 0;
    const coldInquiries = mainCounts.cold ?? 0;
    const myInquiries = myInquiriesCount;
    const assignedInquiries = attendedCount;
    const presalesInquiries = presalesCount;
    const salesInquiries = salesCount;

    const recentInquiriesIds = recentIdsResult.map((r: any) => r._id);
    const recentInquiriesPopulated = recentInquiriesIds.length > 0
      ? await Inquiry.find({ _id: { $in: recentInquiriesIds } })
          .populate('createdBy', 'name email')
          .populate('assignedTo', 'name email')
          .populate('forwardedBy', 'name email')
          .sort({ createdAt: -1 })
          .limit(5)
      : [];

    const stats: DashboardStats = {
      totalInquiries,
      hotInquiries,
      warmInquiries,
      coldInquiries,
      myInquiries,
      assignedInquiries,
      presalesInquiries,
      salesInquiries,
      admittedStudents: admittedStudentsCount,
      recentInquiries: recentInquiriesPopulated
    };

    const response: ApiResponse = {
      success: true,
      message: 'Dashboard stats retrieved successfully',
      data: stats
    };

    res.json(response);
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard stats'
    });
  }
};

/**
 * Get admin dashboard overview (uses aggregation - no full list loading)
 */
export const getAdminDashboardOverview = async (req: Request, res: Response) => {
  try {
    const { dateRange, dateFrom, dateTo } = req.query as { dateRange?: string; dateFrom?: string; dateTo?: string };

    const ranges = calculateDateRanges();
    const dateFilter = buildDateFilter(dateRange, dateFrom, dateTo);

    const salesUsers = await User.find({ role: 'sales', isActive: true }).select('_id name email').lean();
    const presalesUsers = await User.find({ role: 'presales', isActive: true }).select('_id name email').lean();
    const salesUserIds = salesUsers.map((u: any) => u._id);

    const [
      metrics,
      last7DaysTrend,
      salesPerfAgg,
      pendingFollowUps,
      calculatedAnalytics,
      recentActivities,
      activeUsersCount,
      totalUsersCount,
      presalesUserPerformance
    ] = await Promise.all([
      getAdminOverviewMetrics(
        Inquiry,
        dateFilter,
        ranges.todayStart,
        ranges.todayEnd,
        ranges.weekStart,
        ranges.monthStart,
        ranges.previousWeekStart,
        ranges.previousMonthStart
      ),
      getLast7DaysTrend(Inquiry, dateFilter, ranges),
      getSalesUserPerformance(Inquiry, dateFilter, salesUserIds),
      getPendingFollowUpsCount(Inquiry, dateFilter, ranges.todayEnd),
      getAdminAnalytics(Inquiry, dateFilter, dateRange, dateFrom, dateTo, ranges),
      Activity.find({})
        .populate('actor', 'name email')
        .populate('inquiry', 'name phone')
        .populate('targetUser', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({}),
      Promise.all(
        presalesUsers.map(async (user: any) => ({
          userId: user._id,
          name: user.name,
          email: user.email,
          totalCreated: await Inquiry.countDocuments({ createdBy: user._id }),
          totalForwarded: await Inquiry.countDocuments({ forwardedBy: user._id })
        }))
      )
    ]);

    const perfByUser = new Map<string, { total: number; converted: number; admitted: number }>(
      salesPerfAgg.map((r: any) => [r._id?.toString(), { total: r.total || 0, converted: r.converted || 0, admitted: r.admitted || 0 }])
    );
    const salesUserPerformance = salesUsers.map((user: any) => {
      const p = perfByUser.get(user._id.toString()) ?? { total: 0, converted: 0, admitted: 0 };
      return {
        userId: user._id,
        name: user.name,
        email: user.email,
        totalAttended: p.total,
        converted: p.converted,
        admitted: p.admitted,
        conversionRate: p.total > 0 ? Math.round((p.converted / p.total) * 100) : 0
      };
    });
    const topSalesUsers = salesUserPerformance
      .sort((a, b) => b.conversionRate - a.conversionRate || b.admitted - a.admitted)
      .slice(0, 5);
    const topPresalesUsers = presalesUserPerformance
      .sort((a: any, b: any) => b.totalForwarded - a.totalForwarded)
      .slice(0, 5);

    const response = {
      success: true,
      message: 'Admin dashboard overview retrieved successfully',
      data: {
        metrics: {
          totalInquiries: metrics.totalInquiries,
          todayInquiries: metrics.todayInquiries,
          thisWeekInquiries: metrics.thisWeekInquiries,
          thisMonthInquiries: metrics.thisMonthInquiries,
          weeklyTrend: metrics.weeklyTrend,
          monthlyTrend: metrics.monthlyTrend,
          presalesInquiries: metrics.presalesInquiries,
          salesInquiries: metrics.salesInquiries,
          salesAttended: metrics.salesAttended,
          salesUnattended: metrics.salesUnattended,
          admittedStudents: metrics.admittedCount,
          unattendedInquiries: metrics.unattendedInquiries,
          conversionRate: metrics.conversionRate,
          pendingFollowUps,
          activeUsers: activeUsersCount,
          totalUsers: totalUsersCount
        },

        trends: {
          last7Days: last7DaysTrend
        },
        topPerformers: {
          sales: topSalesUsers,
          presales: topPresalesUsers
        },
        recentActivities: recentActivities.map((activity: any) => ({
          id: activity._id,
          action: activity.action,
          actorName: activity.actor?.name || 'Unknown',
          inquiryName: activity.inquiry?.name || 'Unknown',
          inquiryPhone: activity.inquiry?.phone || '',
          targetUserName: activity.targetUser?.name || null,
          details: activity.details,
          createdAt: activity.createdAt
        })),
        advancedAnalytics: calculatedAnalytics
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Get admin dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching admin dashboard overview'
    });
  }
};

/**
 * Get presales dashboard statistics
 */
export const getPresalesDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const userRole = req.user?.role;
    const { dateRange = 'allTime', dateFrom, dateTo } = req.query as { dateRange?: string; dateFrom?: string; dateTo?: string };

    if (userRole !== 'presales') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This endpoint is only for presales users.'
      });
    }

    const dateFilter = buildDateFilter(dateRange, dateFrom, dateTo);

    // Get available statuses from options
    const optionSettings = await OptionSettings.findOne({ key: 'global' });
    const availableStatuses = optionSettings?.statuses || ['hot', 'warm', 'cold'];

    const myRaisedInquiries = await Inquiry.find({
      createdBy: userId,
      ...dateFilter
    })
      .select('status followUps')
      .lean();

    // Build dynamic status breakdown
    const raisedInquiries: any = {
      total: myRaisedInquiries.length
    };

    // Add counts for each available status
    availableStatuses.forEach(status => {
      raisedInquiries[status] = myRaisedInquiries.filter((inq: any) => inq.status === status).length;
    });

    const myAttendedInquiries = await Inquiry.find({
      $or: [
        { assignedTo: userId },
        { forwardedBy: userId }
      ],
      ...dateFilter
    })
      .select('status followUps')
      .lean();

    // Build dynamic status breakdown for attended inquiries
    const attendedInquiries: any = {
      total: myAttendedInquiries.length
    };

    // Add counts for each available status
    availableStatuses.forEach(status => {
      attendedInquiries[status] = myAttendedInquiries.filter((inq: any) => inq.status === status).length;
    });

    // Build date filter specific for forwardedAt
    let forwardedAtFilter: any = {};
    if (dateFrom && dateTo) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      forwardedAtFilter = { forwardedAt: { $gte: fromDate, $lte: toDate } };
    } else if (dateRange === 'today') {
        const ranges = calculateDateRanges();
        forwardedAtFilter = { forwardedAt: { $gte: ranges.todayStart, $lte: ranges.todayEnd } };
    } else if (dateRange === 'lastWeek') {
        const ranges = calculateDateRanges();
        forwardedAtFilter = { forwardedAt: { $gte: ranges.weekStart } };
    } else if (dateRange === 'lastMonth') {
        const ranges = calculateDateRanges();
        forwardedAtFilter = { forwardedAt: { $gte: ranges.monthStart } };
    } else if (dateRange === 'lastYear') {
        const ranges = calculateDateRanges();
        forwardedAtFilter = { forwardedAt: { $gte: ranges.yearStart } };
    }

    const forwardedToSalesInquiries = await Inquiry.find({
      forwardedBy: userId,
      department: 'sales',
      ...forwardedAtFilter
    })
      .select('followUps forwardedAt')
      .lean();

    const forwardedToSalesCount = forwardedToSalesInquiries.length;

    // Calculate raw date boundaries for filtering follow-ups locally
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    const ranges = calculateDateRanges();

    if (dateFrom && dateTo) {
      startDate = new Date(dateFrom);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
    } else if (dateRange === 'today') {
      startDate = ranges.todayStart;
      endDate = ranges.todayEnd;
    } else if (dateRange === 'lastWeek') {
      startDate = ranges.weekStart;
      // No end date (implied until now)
    } else if (dateRange === 'lastMonth') {
      startDate = ranges.monthStart;
    } else if (dateRange === 'lastYear') {
      startDate = ranges.yearStart;
    }

    // Fetch inquiries that have follow-ups created by this user
    // Fetch inquiries that have follow-ups created by this user
    const inquiriesWithMyFollowUps = await Inquiry.find({
      'followUps.createdBy': userId
    })
      .select('followUps department assignedTo forwardedBy')
      .lean();

    let pendingFollowUpsCount = 0;
    let completedFollowUpsCount = 0;
    let overdueFollowUpsCount = 0;
    
    // Define strict "now" for accurate comparisons
    const now = new Date();

    inquiriesWithMyFollowUps.forEach((inq: any) => {
      if (!inq.followUps) return;

      const userFollowUps = inq.followUps.filter((ful: any) => {
        const createdById = ful.createdBy?._id 
          ? ful.createdBy._id.toString() 
          : (ful.createdBy?.toString ? ful.createdBy.toString() : ful.createdBy);
        return createdById === userId?.toString();
      });

      if (userFollowUps.length === 0) return;

      // Logic to determine if pending follow-ups should be counted (mimics getMyFollowUps)
      const forwardedById = inq.forwardedBy?._id 
        ? inq.forwardedBy._id.toString() 
        : inq.forwardedBy?.toString();
      
      const isForwardedToSales = userRole === 'presales' && 
        inq.department === 'sales' && 
        forwardedById !== null && 
        forwardedById !== undefined;
        
      const assignedToId = inq.assignedTo?._id 
        ? inq.assignedTo._id.toString() 
        : inq.assignedTo?.toString();
        
      const isAssignedToSomeoneElse = assignedToId && assignedToId !== userId?.toString();
      
      const shouldHidePending = isForwardedToSales || isAssignedToSomeoneElse;

      const incompleteFollowUps = userFollowUps.filter((fu: any) => fu.completionStatus !== 'complete');
      const completedFollowUps = userFollowUps.filter((fu: any) => fu.completionStatus === 'complete');

      // 1. Sort by created at desc to get latest (mimics "My Follow-Ups" list logic)
      incompleteFollowUps.sort((a: any, b: any) => {
         return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      const latestPending = incompleteFollowUps[0];

      if (!shouldHidePending && latestPending) {
        // Pending: Count the inquiry if it has at least one active pending action
        pendingFollowUpsCount++;

        // Overdue: Check strictly the LATEST pending action
        if (latestPending.nextFollowUpDate) {
           const dueDate = new Date(latestPending.nextFollowUpDate);
           if (dueDate < now) {
               overdueFollowUpsCount++;
           }
        }
      }

      // 3. Calculate Completed
      completedFollowUps.forEach((ful: any) => {
         if (startDate) {
            const completionTime = ful.updatedAt ? new Date(ful.updatedAt).getTime() : new Date(ful.createdAt).getTime();
            const start = startDate.getTime();
            const end = endDate ? endDate.getTime() : new Date().getTime(); 
            
            if (completionTime >= start && completionTime <= end) {
              completedFollowUpsCount++;
            }
         } else {
            completedFollowUpsCount++;
         }
      });
    });

    const response = {
      success: true,
      message: 'Presales dashboard stats retrieved successfully',
      data: {
        mine: {
          raisedInquiries,
          attendedInquiries,
          forwardedToSales: forwardedToSalesCount,
          pendingFollowUps: pendingFollowUpsCount,
          completedFollowUps: completedFollowUpsCount,
          overdueFollowUps: overdueFollowUpsCount
        },
        availableStatuses,
        dateRange: dateRange || 'allTime'
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Get presales dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching presales dashboard stats'
    });
  }
};

/**
 * Get sales dashboard statistics
 */
export const getSalesDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const userRole = req.user?.role;
    const { dateRange = 'allTime', dateFrom, dateTo } = req.query as { dateRange?: string; dateFrom?: string; dateTo?: string };

    if (userRole !== 'sales') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This endpoint is only for sales users.'
      });
    }

    const ranges = calculateDateRanges();
    
    // Fetch user's inquiries for analytics
    // We want ALL time data for some charts (like source distribution of current active pool)
    // But for "Performance Over Time", we need the trend.
    // Let's fetch all relevant inquiries first and filter in memory for complex logic if dataset isn't huge.
    // Optimization: Filter by date if range provided? For "Over Time", we usually want a specific window (e.g. 30 days).
    
    const myInquiries = await Inquiry.find({
        $or: [
            { assignedTo: userId },
            { createdBy: userId }
        ]
    }).select('status department course preferredLocation medium inquirySource assignedTo followUps createdAt isUnattended assignmentStatus').lean();

    // 1. Performance Over Time (Line Chart)
    // Default to last 30 days if 'allTime' or no complex range
    // We will build daily buckets.
    interface TimeBucket {
      date: string;
      sortDate: number;
      inquiries: number;
      admissions: number;
      conversions: number;
    }
    const performanceMap = new Map<string, TimeBucket>();
    
    // Determine start/end for the graph
    let graphStart = new Date();
    graphStart.setDate(graphStart.getDate() - 30); // Default 30 days
    let graphEnd = new Date();
    
    if (dateRange === 'lastWeek') {
        graphStart = ranges.weekStart;
    } else if (dateRange === 'lastMonth') {
        graphStart = ranges.monthStart;
    } else if (dateFrom && dateTo) {
        graphStart = new Date(dateFrom);
        graphEnd = new Date(dateTo);
    }

    // Fill Buckets
    for (let d = new Date(graphStart); d <= graphEnd; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        performanceMap.set(key, { 
            date: label, 
            sortDate: d.getTime(), 
            inquiries: 0, 
            admissions: 0, 
            conversions: 0 
        });
    }

    myInquiries.forEach((inq: any) => {
        const date = new Date(inq.createdAt);
        if (date >= graphStart && date <= graphEnd) {
             const key = date.toISOString().split('T')[0];
             if (performanceMap.has(key)) {
                 const bucket = performanceMap.get(key)!;
                 bucket.inquiries++;
                 if (isAdmittedStudent(inq)) bucket.admissions++;
                 if (isConvertedStudent(inq)) bucket.conversions++;
             }
        }
    });

    const performanceData = Array.from(performanceMap.values())
        .sort((a, b) => a.sortDate - b.sortDate);


    // 2. Lead Source Performance (Donut)
    // Use all my inquiries or filtered by date? Usually charts reflect the filtered view.
    // Let's apply the simplified date filter for the other charts.
    const filteredInquiries = myInquiries.filter((inq: any) => {
         const d = new Date(inq.createdAt);
         // If generic date filter logic needed:
         if (dateRange === 'today') return d >= ranges.todayStart && d <= ranges.todayEnd;
         if (dateRange === 'lastWeek') return d >= ranges.weekStart;
         if (dateRange === 'lastMonth') return d >= ranges.monthStart;
         if (dateFrom && dateTo) return d >= new Date(dateFrom) && d <= new Date(dateTo);
         return true; // allTime
    });

    const sourceMap = new Map<string, number>();
    filteredInquiries.forEach((inq: any) => {
        const source = inq.inquirySource || inq.medium || 'Direct'; 
        sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
    });
    
    // Define standard colors for sources
    const sourceColors: Record<string, string> = {
      'WhatsApp': '#F47A1F', // Primary Orange
      'Call': '#FFB074',     // Secondary Orange
      'Website': '#D86313',  // Dark Accent Orange
      'Walk-in': '#FFE8D6',  // Light Peach
      'Campaign': '#F47A1F', // Primary Orange
      'Direct': '#FFB074',    // Secondary Orange
      'Email': '#D86313',    // Dark Accent Orange
      'IVR': '#FFE8D6',      // Light Peach
      'Reference': '#F47A1F', // Primary Orange
      'Other': '#FFB074'     // Secondary Orange
    };

    const sourceData = Array.from(sourceMap.entries()).map(([name, value]) => ({
        name,
        value,
        color: sourceColors[name] || sourceColors['Direct'] // Fallback
    })).sort((a, b) => b.value - a.value);


    // 3. Follow-ups & Task Health (Date-Filter Independent)
    // Fetch ALL inquiries for this user to calculate real-time task health
    const allUserInquiries = await Inquiry.find({ 
        assignedTo: userId
    }).select('followUps').lean();

    let overdueFollowUps = 0;
    let upcomingFollowUps = 0;
    
    const nowLocal = new Date();
    const todayStart = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate());

    allUserInquiries.forEach((inq: any) => {
        if (!inq.followUps) return;
        
        // Loop through ALL follow-ups for this inquiry (since it's assigned to me)
        inq.followUps.forEach((f: any) => {
            if (f.completionStatus === 'complete' || f.status === 'completed' || f.status === 'cancelled') return;
            if (!f.nextFollowUpDate) return;
            
            const due = new Date(f.nextFollowUpDate);
            
            if (due < todayStart) {
                overdueFollowUps++;
            } else if (due >= todayStart) {
                upcomingFollowUps++;
            }
        });
    });
    
    const taskHealth = [
        { label: "Overdue Follow-ups", count: overdueFollowUps, color: 'bg-amber-500' },
        { label: "Upcoming Follow-ups", count: upcomingFollowUps, color: 'bg-blue-400' }
    ];


    const response = {
      success: true,
      message: 'Sales dashboard stats retrieved successfully',
      data: {
        dateRange: dateRange || 'allTime',
        advancedAnalytics: {
            performance: performanceData,
            source: sourceData,
            taskHealth: taskHealth
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Get sales dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching sales dashboard stats'
    });
  }
};

/**
 * Get center-specific dashboard statistics
 * This is similar to getAdminDashboardOverview but filtered by center location
 */
export const getCenterDashboardStats = async (req: Request, res: Response) => {
  try {
    const { center } = req.query as { center?: string };
    const { dateRange, dateFrom, dateTo } = req.query as { dateRange?: string; dateFrom?: string; dateTo?: string };

    if (!center) {
      return res.status(400).json({
        success: false,
        message: 'Center location is required'
      });
    }

    // Enforce center-based access control for Sales users
    if (req.user?.role === 'sales') {
      const centerPermissions = req.user?.centerPermissions || [];
      if (!centerPermissions.includes(center)) {
        // Instead of 403, we return empty stats by ensuring the center filter matches nothing unauthorized
        const emptyStats = {
          totalInquiries: 0,
          admittedStudents: 0,
          presalesInquiries: 0,
          salesInquiries: 0,
          salesAttended: 0,
          salesUnattended: 0,
          leadStatusDistribution: [],
          courseDistribution: [],
          mediumDistribution: [],
          topPerformers: { sales: [], presales: [] },
          advancedAnalytics: { performance: [], source: [], location: [], course: [] },
          recentActivities: []
        };
        return res.json({
          success: true,
          message: 'Dashboard stats retrieved (Restricted)',
          data: emptyStats
        });
      }
    }

    const ranges = calculateDateRanges();
    const dateFilter = buildDateFilter(dateRange, dateFrom, dateTo);

    // Add center location filter
    const centerFilter = { preferredLocation: center, ...dateFilter };

    const salesUsers = await User.find({ role: 'sales', isActive: true }).select('_id name email').lean();
    const presalesUsers = await User.find({ role: 'presales', isActive: true }).select('_id name email').lean();
    const salesUserIds = salesUsers.map((u: any) => u._id);

    const [
      metrics,
      last7DaysTrend,
      salesPerfAgg,
      pendingFollowUps,
      calculatedAnalytics,
      inquiryIdsForActivities,
      presalesUserPerformance
    ] = await Promise.all([
      getAdminOverviewMetrics(Inquiry, centerFilter, ranges.todayStart, ranges.todayEnd, ranges.weekStart, ranges.monthStart, ranges.previousWeekStart, ranges.previousMonthStart),
      getLast7DaysTrend(Inquiry, centerFilter, ranges),
      getSalesUserPerformance(Inquiry, centerFilter, salesUserIds),
      getPendingFollowUpsCount(Inquiry, centerFilter, ranges.todayEnd),
      getAdminAnalytics(Inquiry, centerFilter, dateRange, dateFrom, dateTo, ranges),
      Inquiry.find(centerFilter).select('_id').limit(5000).lean().then((docs: any[]) => docs.map((d: any) => d._id)),
      Promise.all(presalesUsers.map(async (user: any) => ({
        userId: user._id,
        name: user.name,
        email: user.email,
        totalCreated: await Inquiry.countDocuments({ createdBy: user._id, preferredLocation: center }),
        totalForwarded: await Inquiry.countDocuments({ forwardedBy: user._id, preferredLocation: center })
      })))
    ]);

    const perfByUser = new Map<string, { total: number; converted: number; admitted: number }>(
      salesPerfAgg.map((r: any) => [r._id?.toString(), { total: r.total || 0, converted: r.converted || 0, admitted: r.admitted || 0 }])
    );
    const salesUserPerformance = salesUsers.map((user: any) => {
      const p = perfByUser.get(user._id.toString()) ?? { total: 0, converted: 0, admitted: 0 };
      return {
        userId: user._id,
        name: user.name,
        email: user.email,
        totalAttended: p.total,
        converted: p.converted,
        admitted: p.admitted,
        conversionRate: p.total > 0 ? Math.round((p.converted / p.total) * 100) : 0
      };
    });
    const topSalesUsers = salesUserPerformance.sort((a, b) => b.conversionRate - a.conversionRate || b.admitted - a.admitted).slice(0, 5);
    const topPresalesUsers = presalesUserPerformance.sort((a: any, b: any) => b.totalForwarded - a.totalForwarded).slice(0, 5);

    const recentActivities = inquiryIdsForActivities.length > 0
      ? await Activity.find({ inquiry: { $in: inquiryIdsForActivities } })
          .populate('actor', 'name email')
          .populate('inquiry', 'name phone')
          .populate('targetUser', 'name')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      : [];

    const response = {
      success: true,
      message: `Center dashboard for ${center} retrieved successfully`,
      data: {
        metrics: {
          totalInquiries: metrics.totalInquiries,
          todayInquiries: metrics.todayInquiries,
          thisWeekInquiries: metrics.thisWeekInquiries,
          thisMonthInquiries: metrics.thisMonthInquiries,
          weeklyTrend: metrics.weeklyTrend,
          monthlyTrend: metrics.monthlyTrend,
          presalesInquiries: metrics.presalesInquiries,
          salesInquiries: metrics.salesInquiries,
          salesAttended: metrics.salesAttended,
          salesUnattended: metrics.salesUnattended,
          admittedStudents: metrics.admittedCount,
          unattendedInquiries: metrics.unattendedInquiries,
          conversionRate: metrics.conversionRate,
          pendingFollowUps
        },
        trends: {
          last7Days: last7DaysTrend
        },
        topPerformers: {
          sales: topSalesUsers,
          presales: topPresalesUsers
        },
        recentActivities: recentActivities.map((activity: any) => ({
          id: activity._id,
          action: activity.action,
          actorName: activity.actor?.name || 'Unknown',
          inquiryName: activity.inquiry?.name || 'Unknown',
          inquiryPhone: activity.inquiry?.phone || '',
          targetUserName: activity.targetUser?.name || null,
          details: activity.details,
          createdAt: activity.createdAt
        })),
        advancedAnalytics: calculatedAnalytics
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Get center dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching center dashboard stats'
    });
  }
};