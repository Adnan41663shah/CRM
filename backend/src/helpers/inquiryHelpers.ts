/**
 * Helper functions for inquiry operations
 */

/**
 * Check if an inquiry is admitted
 * An inquiry is admitted if its latest follow-up has leadStage='Hot' and subStage='Confirmed Admission'
 */
export const isAdmittedStudent = (inquiry: any): boolean => {
  if (!inquiry.followUps || inquiry.followUps.length === 0) {
    return false;
  }
  
  // Sort follow-ups by createdAt descending to get the latest one
  const sortedFollowUps = [...inquiry.followUps].sort((a: any, b: any) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const latestFollowUp = sortedFollowUps[0];
  
  return latestFollowUp.leadStage === 'Hot' && latestFollowUp.subStage === 'Confirmed Admission';
};

/**
 * Check if an inquiry is converted
 * An inquiry is converted if its latest follow-up has leadStage='Hot' and subStage='Conversion'
 */
export const isConvertedStudent = (inquiry: any): boolean => {
  if (!inquiry.followUps || inquiry.followUps.length === 0) {
    return false;
  }
  
  // Sort follow-ups by createdAt descending to get the latest one
  const sortedFollowUps = [...inquiry.followUps].sort((a: any, b: any) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const latestFollowUp = sortedFollowUps[0];
  
  return latestFollowUp.leadStage === 'Hot' && latestFollowUp.subStage === 'Conversion';
};

/**
 * Calculate date ranges for filtering
 */
export const calculateDateRanges = () => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  
  const monthStart = new Date(todayStart);
  monthStart.setMonth(monthStart.getMonth() - 1);

  const yearStart = new Date(todayStart);
  yearStart.setFullYear(yearStart.getFullYear() - 1);
  
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  
  const previousMonthStart = new Date(monthStart);
  previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);

  return {
    now,
    todayStart,
    todayEnd,
    weekStart,
    monthStart,
    yearStart,
    previousWeekStart,
    previousMonthStart
  };
};

/**
 * Build date filter based on dateRange or custom dates
 */
export const buildDateFilter = (
  dateRange?: string,
  dateFrom?: string,
  dateTo?: string,
  dateField: string = 'createdAt'
): any => {
  const ranges = calculateDateRanges();
  
  let dateFilter: any = {};
  
  if (dateFrom && dateTo) {
    // Custom date range
    const fromDate = new Date(dateFrom);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(dateTo);
    toDate.setHours(23, 59, 59, 999);
    dateFilter = { [dateField]: { $gte: fromDate, $lte: toDate } };
  } else if (dateRange === 'today') {
    dateFilter = { [dateField]: { $gte: ranges.todayStart, $lte: ranges.todayEnd } };
  } else if (dateRange === 'lastWeek') {
    dateFilter = { [dateField]: { $gte: ranges.weekStart } };
  } else if (dateRange === 'lastMonth') {
    dateFilter = { [dateField]: { $gte: ranges.monthStart } };
  } else if (dateRange === 'lastYear') {
    dateFilter = { [dateField]: { $gte: ranges.yearStart } };
  }
  
  return dateFilter;
};
