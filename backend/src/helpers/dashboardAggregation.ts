/**
 * Aggregation pipeline stages for dashboard stats.
 * Uses MongoDB aggregation instead of loading full inquiry lists into memory.
 */

/**
 * $addFields stage to compute isAdmitted from latest follow-up.
 * Admitted = latest followUp has leadStage='Hot' AND subStage='Confirmed Admission'
 */
export const addIsAdmittedField = {
  $addFields: {
    latestFollowUp: {
      $reduce: {
        input: { $ifNull: ['$followUps', []] },
        initialValue: null,
        in: {
          $cond: [
            {
              $or: [
                { $eq: ['$$value', null] },
                { $gt: ['$$this.createdAt', '$$value.createdAt'] }
              ]
            },
            '$$this',
            '$$value'
          ]
        }
      }
    }
  }
};

/**
 * $addFields stage to compute isAdmitted and isConverted flags from latestFollowUp
 */
export const addAdmittedConvertedFlags = {
  $addFields: {
    isAdmitted: {
      $and: [
        { $ne: ['$latestFollowUp', null] },
        { $eq: ['$latestFollowUp.leadStage', 'Hot'] },
        { $eq: ['$latestFollowUp.subStage', 'Confirmed Admission'] }
      ]
    },
    isConverted: {
      $and: [
        { $ne: ['$latestFollowUp', null] },
        { $eq: ['$latestFollowUp.leadStage', 'Hot'] },
        { $eq: ['$latestFollowUp.subStage', 'Conversion'] }
      ]
    }
  }
};

/**
 * $match stage to exclude admitted students (non-admitted / active inquiries)
 */
export const matchNonAdmitted = { $match: { isAdmitted: { $ne: true } } };

/**
 * Run aggregation to get counts by status for a given match query
 */
export async function getCountsByStatus(
  Inquiry: any,
  matchQuery: object,
  statuses: string[]
): Promise<{ total: number; [status: string]: number }> {
  const result = await Inquiry.aggregate([
    { $match: matchQuery },
    addIsAdmittedField,
    addAdmittedConvertedFlags,
    matchNonAdmitted,
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        ...statuses.reduce((acc, s) => ({ ...acc, [s]: { $sum: { $cond: [{ $eq: ['$status', s] }, 1, 0] } } }), {})
      }
    },
    { $project: { _id: 0 } }
  ]);

  const row = result[0] || {};
  const counts: { total: number; [status: string]: number } = { total: row.total || 0 };
  statuses.forEach(s => { counts[s] = row[s] || 0; });
  return counts;
}

/**
 * Get simple count of non-admitted inquiries matching the query
 */
export async function getNonAdmittedCount(Inquiry: any, matchQuery: object): Promise<number> {
  const result = await Inquiry.aggregate([
    { $match: matchQuery },
    addIsAdmittedField,
    addAdmittedConvertedFlags,
    matchNonAdmitted,
    { $count: 'count' }
  ]);
  return result[0]?.count ?? 0;
}

/**
 * Get admitted students count (inquiries where latest followUp is Hot + Confirmed Admission)
 */
export async function getAdmittedCount(Inquiry: any, matchQuery: object = {}): Promise<number> {
  const result = await Inquiry.aggregate([
    { $match: { followUps: { $exists: true, $ne: [] }, ...matchQuery } },
    addIsAdmittedField,
    addAdmittedConvertedFlags,
    { $match: { isAdmitted: true } },
    { $count: 'count' }
  ]);
  return result[0]?.count ?? 0;
}

/**
 * Admin overview: get all metrics from a single aggregation (avoids loading full list)
 */
export async function getAdminOverviewMetrics(
  Inquiry: any,
  dateFilter: object,
  todayStart: Date,
  todayEnd: Date,
  weekStart: Date,
  monthStart: Date,
  previousWeekStart: Date,
  previousMonthStart: Date
) {
  const pipeline = [
    { $match: dateFilter },
    addIsAdmittedField,
    addAdmittedConvertedFlags,
    {
      $facet: {
        total: [{ $count: 'count' }],
        admitted: [{ $match: { isAdmitted: true } }, { $count: 'count' }],
        activePresales: [{ $match: { isAdmitted: { $ne: true }, department: 'presales' } }, { $count: 'count' }],
        activeSalesAll: [{ $match: { isAdmitted: { $ne: true }, department: 'sales' } }, { $group: { _id: null, total: { $sum: 1 }, attended: { $sum: { $cond: [{ $ne: ['$assignedTo', null] }, 1, 0] } } } }],
        unattended: [{ $match: { isAdmitted: { $ne: true }, isUnattended: true } }, { $count: 'count' }],
        today: [{ $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } }, { $count: 'count' }],
        thisWeek: [{ $match: { createdAt: { $gte: weekStart } } }, { $count: 'count' }],
        thisMonth: [{ $match: { createdAt: { $gte: monthStart } } }, { $count: 'count' }],
        prevWeek: [{ $match: { createdAt: { $gte: previousWeekStart, $lt: weekStart } } }, { $count: 'count' }],
        prevMonth: [{ $match: { createdAt: { $gte: previousMonthStart, $lt: monthStart } } }, { $count: 'count' }],
        salesConverted: [{ $match: { department: 'sales', isConverted: true } }, { $count: 'count' }],
        salesTotal: [{ $match: { department: 'sales' } }, { $count: 'count' }]
      }
    }
  ];

  const [result] = await Inquiry.aggregate(pipeline);
  const r = result || {};
  const totalInquiries = r.total?.[0]?.count ?? 0;
  const admittedCount = r.admitted?.[0]?.count ?? 0;
  const presalesInquiries = r.activePresales?.[0]?.count ?? 0;
  const salesAll = r.activeSalesAll?.[0] || {};
  const salesInquiries = salesAll.total ?? 0;
  const salesAttended = salesAll.attended ?? 0;
  const salesUnattended = salesInquiries - salesAttended;
  const unattendedInquiries = r.unattended?.[0]?.count ?? 0;
  const todayInquiries = r.today?.[0]?.count ?? 0;
  const thisWeekInquiries = r.thisWeek?.[0]?.count ?? 0;
  const thisMonthInquiries = r.thisMonth?.[0]?.count ?? 0;
  const previousWeekInquiries = r.prevWeek?.[0]?.count ?? 0;
  const previousMonthInquiries = r.prevMonth?.[0]?.count ?? 0;
  const convertedStudents = r.salesConverted?.[0]?.count ?? 0;
  const totalSalesEver = r.salesTotal?.[0]?.count ?? 0;

  const weeklyTrend = previousWeekInquiries > 0
    ? Math.round(((thisWeekInquiries - previousWeekInquiries) / previousWeekInquiries) * 100)
    : thisWeekInquiries > 0 ? 100 : 0;
  const monthlyTrend = previousMonthInquiries > 0
    ? Math.round(((thisMonthInquiries - previousMonthInquiries) / previousMonthInquiries) * 100)
    : thisMonthInquiries > 0 ? 100 : 0;
  const conversionRate = totalSalesEver > 0 ? Math.round((convertedStudents / totalSalesEver) * 100) : 0;

  return {
    totalInquiries,
    admittedCount,
    presalesInquiries,
    salesInquiries,
    salesAttended,
    salesUnattended,
    unattendedInquiries,
    todayInquiries,
    thisWeekInquiries,
    thisMonthInquiries,
    weeklyTrend,
    monthlyTrend,
    conversionRate
  };
}

/**
 * Admin overview: last 7 days trend by department (single aggregation)
 */
export async function getLast7DaysTrend(
  Inquiry: any,
  dateFilter: object,
  ranges: { todayStart: Date; todayEnd: Date }
) {
  const sevenDaysAgo = new Date(ranges.todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const result = await Inquiry.aggregate([
    { $match: { ...dateFilter, createdAt: { $gte: sevenDaysAgo, $lte: ranges.todayEnd } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          department: '$department'
        },
        count: { $sum: 1 }
      }
    }
  ]);

  const byDate = new Map<string, { presales: number; sales: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(ranges.todayStart);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().split('T')[0];
    byDate.set(key, { presales: 0, sales: 0 });
  }
  result.forEach((r: any) => {
    const key = r._id.date;
    if (!byDate.has(key)) byDate.set(key, { presales: 0, sales: 0 });
    const row = byDate.get(key)!;
    if (r._id.department === 'presales') row.presales += r.count;
    else if (r._id.department === 'sales') row.sales += r.count;
  });

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, row]) => {
      const d = new Date(key);
      return {
        date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        presales: row.presales,
        sales: row.sales,
        total: row.presales + row.sales
      };
    });
}

/**
 * Admin overview: sales user performance (total, converted, admitted per user)
 */
export async function getSalesUserPerformance(Inquiry: any, dateFilter: object, salesUserIds: any[]) {
  if (salesUserIds.length === 0) return [];
  const res = await Inquiry.aggregate([
    { $match: { ...dateFilter, department: 'sales', assignedTo: { $in: salesUserIds } } },
    addIsAdmittedField,
    addAdmittedConvertedFlags,
    { $group: { _id: '$assignedTo', total: { $sum: 1 }, converted: { $sum: { $cond: ['$isConverted', 1, 0] } }, admitted: { $sum: { $cond: ['$isAdmitted', 1, 0] } } } }
  ]);
  return res;
}

/**
 * Admin overview: pending follow-ups count (inquiries with scheduled follow-up due by todayEnd)
 */
export async function getPendingFollowUpsCount(Inquiry: any, dateFilter: object, todayEnd: Date): Promise<number> {
  const [r] = await Inquiry.aggregate([
    { $match: dateFilter },
    { $addFields: { hasPending: { $gt: [{ $size: { $filter: { input: { $ifNull: ['$followUps', []] }, as: 'f', cond: { $and: [{ $eq: ['$$f.status', 'scheduled'] }, { $lte: ['$$f.nextFollowUpDate', todayEnd] }] } } } }, 0] } } },
    { $match: { hasPending: true } },
    { $count: 'count' }
  ]);
  return r?.count ?? 0;
}

/**
 * Admin overview: advanced analytics (performance, source, location, course) for sales inquiries
 */
export async function getAdminAnalytics(
  Inquiry: any,
  dateFilter: object,
  dateRange: string | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  ranges: { todayStart: Date; todayEnd: Date; weekStart: Date; monthStart: Date; yearStart: Date }
) {
  const isToday = dateRange === 'today';
  let fillStart: Date;
  let fillEnd: Date;
  if (dateRange === 'today') {
    fillStart = new Date(ranges.todayStart);
    fillEnd = new Date(ranges.todayEnd);
  } else if (dateFrom && dateTo) {
    fillStart = new Date(dateFrom);
    fillStart.setHours(0, 0, 0, 0);
    fillEnd = new Date(dateTo);
    fillEnd.setHours(23, 59, 59, 999);
  } else if (dateRange === 'lastWeek') {
    fillStart = new Date(ranges.weekStart);
    fillEnd = new Date();
  } else if (dateRange === 'lastMonth') {
    fillStart = new Date(ranges.monthStart);
    fillEnd = new Date();
  } else if (dateRange === 'lastYear') {
    fillStart = new Date(ranges.yearStart);
    fillEnd = new Date();
  } else {
    fillStart = new Date(ranges.monthStart);
    fillEnd = new Date();
  }

  const dateFormat = isToday ? '%H:00' : '%Y-%m-%d';
  const [perfRes, sourceRes, locationRes, courseRes] = await Promise.all([
    Inquiry.aggregate([
      { $match: { ...dateFilter, department: 'sales' } },
      addIsAdmittedField,
      addAdmittedConvertedFlags,
      { $addFields: { bucket: isToday ? { $hour: '$createdAt' } : { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
      { $group: { _id: '$bucket', inquiries: { $sum: 1 }, admissions: { $sum: { $cond: ['$isAdmitted', 1, 0] } }, conversions: { $sum: { $cond: ['$isConverted', 1, 0] } } } }
    ]),
    Inquiry.aggregate([
      { $match: { ...dateFilter, department: 'sales' } },
      addIsAdmittedField,
      addAdmittedConvertedFlags,
      { $group: { _id: { $ifNull: ['$medium', 'Unknown'] }, inquiries: { $sum: 1 }, conversions: { $sum: { $cond: ['$isConverted', 1, 0] } } } }
    ]),
    Inquiry.aggregate([
      { $match: { ...dateFilter, department: 'sales' } },
      addIsAdmittedField,
      addAdmittedConvertedFlags,
      { $group: { _id: { $ifNull: ['$preferredLocation', 'Unknown'] }, inquiries: { $sum: 1 }, conversions: { $sum: { $cond: ['$isConverted', 1, 0] } } } }
    ]),
    Inquiry.aggregate([
      { $match: { ...dateFilter, department: 'sales' } },
      addIsAdmittedField,
      addAdmittedConvertedFlags,
      { $group: { _id: { $ifNull: ['$course', 'Unknown'] }, inquiries: { $sum: 1 }, conversions: { $sum: { $cond: ['$isConverted', 1, 0] } } } }
    ])
  ]);

  const sourceColors: Record<string, string> = { WhatsApp: '#F47A1F', IVR: '#FFB074', Email: '#D86313', Unknown: '#FFE8D6' };
  const perfSort = [...perfRes].sort((a, b) => (a._id < b._id ? -1 : 1));
  const performanceDataSorted = perfSort.map((r: any) => {
    const label = isToday
      ? `${(r._id % 12) || 12} ${r._id >= 12 ? 'PM' : 'AM'}`
      : new Date(r._id).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { date: label, inquiries: r.inquiries, admissions: r.admissions, conversions: r.conversions };
  });

  const sourceData = sourceRes.map((d: any) => ({
    name: d._id,
    value: d.inquiries,
    conversions: d.conversions,
    conversionRate: d.inquiries > 0 ? Math.round((d.conversions / d.inquiries) * 100) : 0,
    color: sourceColors[d._id] || '#F59E0B'
  })).sort((a: any, b: any) => b.value - a.value);

  const locationData = locationRes.map((d: any) => ({
    city: d._id,
    inquiries: d.inquiries,
    conversions: d.conversions,
    conversionRate: d.inquiries > 0 ? Math.round((d.conversions / d.inquiries) * 100) : 0
  })).sort((a: any, b: any) => b.inquiries - a.inquiries);

  const courseAnalyticsData = courseRes.map((d: any) => ({
    name: d._id,
    inquiries: d.inquiries,
    conversions: d.conversions,
    conversionRate: d.inquiries > 0 ? Math.round((d.conversions / d.inquiries) * 100) : 0
  })).sort((a: any, b: any) => b.inquiries - a.inquiries);

  return { performance: performanceDataSorted, source: sourceData, location: locationData, course: courseAnalyticsData };
}
