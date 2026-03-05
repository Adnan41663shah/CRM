export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  office365Id?: string;
  office365Upn?: string;
  centerPermissions?: string[];
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'presales' | 'sales' | 'admin';

export interface Inquiry {
  _id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  education: string;
  course: CourseType;
  preferredLocation: LocationType;
  medium: MediumType;
  message: string;
  status: InquiryStatus;
  assignmentStatus: AssignmentStatus;
  department: DepartmentType;
  assignedTo?: User;
  forwardedBy?: User;
  forwardedAt?: string;
  isUnattended?: boolean;
  unattendedAt?: string;
  viewedByAssignedUserAt?: string;
  followUps: FollowUp[];
  createdBy: User;
  createdAt: string;
  updatedAt: string;
}

export type CourseType = 'CDEC' | 'X-DSAAI' | 'DevOps' | 'Full-Stack' | 'Any';
export type LocationType = 'Nagpur' | 'Pune' | 'Nashik' | 'Indore';
export type MediumType = 'IVR' | 'Email' | 'WhatsApp';
export type InquiryStatus = 'hot' | 'warm' | 'cold' | 'walkin' | 'not_interested' | 'online_conversion';
export type AssignmentStatus = 'not_assigned' | 'assigned' | 'reassigned' | 'forwarded_to_sales';
export type DepartmentType = 'presales' | 'sales';

export type FollowUpType = 'call' | 'email' | 'whatsapp';

export type FollowUpStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled' | 'no_answer' | 'busy';

export type FollowUpOutcome = 'positive' | 'neutral' | 'negative' | 'interested' | 'not_interested' | 'needs_time' | 'requested_info' | 'scheduled_meeting';

export interface FollowUp {
  _id: string;
  type: FollowUpType;
  status: FollowUpStatus;
  title?: string; // Optional for sales follow-ups
  completedDate?: string;
  duration?: number;
  outcome?: FollowUpOutcome;
  nextFollowUpDate?: string;
  inquiryStatus?: InquiryStatus;
  message?: string; // Optional message field
  // Sales-specific fields
  leadStage?: SalesLeadStage;
  subStage?: string;
  completionStatus?: 'complete' | 'incomplete';
  createdBy: User;
  createdAt: string;
  updatedAt: string;
}

// Dynamic type - lead stages are now configurable by admin
// Using string type to allow any admin-configured lead stage
export type SalesLeadStage = string;


export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface InquiryFilters {
  search?: string;
  status?: InquiryStatus;
  course?: CourseType;
  location?: LocationType;
  medium?: MediumType;
  assignedTo?: string | string[];
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
  dateRange?: string;
  dateField?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface DashboardStats {
  totalInquiries: number;
  hotInquiries: number;
  warmInquiries: number;
  coldInquiries: number;
  myInquiries: number;
  assignedInquiries: number;
  presalesInquiries: number;
  salesInquiries: number;
  admittedStudents: number;
  recentInquiries: Inquiry[];
}

export interface AdminDashboardMetrics {
  totalInquiries: number;
  todayInquiries: number;
  thisWeekInquiries: number;
  thisMonthInquiries: number;
  weeklyTrend: number;
  monthlyTrend: number;
  presalesInquiries: number;
  salesInquiries: number;
  salesAttended: number;
  salesUnattended: number;
  admittedStudents: number;
  unattendedInquiries: number;
  conversionRate: number;
  pendingFollowUps: number;
  activeUsers: number;
  totalUsers: number;
}

export interface ChartDataItem {
  name: string;
  value: number;
}

export interface TrendDataItem {
  date: string;
  presales: number;
  sales: number;
  total: number;
}

export interface TopPerformerSales {
  userId: string;
  name: string;
  email: string;
  totalAttended: number;
  converted: number;
  admitted: number;
  conversionRate: number;
}

export interface TopPerformerPresales {
  userId: string;
  name: string;
  email: string;
  totalCreated: number;
  totalForwarded: number;
}

export interface RecentActivity {
  id: string;
  action: string;
  actorName: string;
  inquiryName: string;
  inquiryPhone: string;
  targetUserName: string | null;
  details: string | null;
  createdAt: string;
}

export interface AdminDashboardOverview {
  metrics: AdminDashboardMetrics;

  trends: {
    last7Days: TrendDataItem[];
  };
  topPerformers: {
    sales: TopPerformerSales[];
    presales: TopPerformerPresales[];
  };
  recentActivities: RecentActivity[];
  advancedAnalytics: {
    performance: {
      date: string;
      inquiries: number;
      admissions: number;
      conversions: number;
    }[];
    source: {
      name: string;
      value: number;
      conversions: number;
      conversionRate: number;
      color: string;
    }[];
    location: {
      city: string;
      inquiries: number;
      conversions: number;
      conversionRate: number;
    }[];
    course: {
      name: string;
      inquiries: number;
      conversions: number;
    }[];
  };
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: UserRole;
}

export interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export interface SidebarItem {
  label: string;
  href: string;
  icon: React.ComponentType<any>;
  roles?: UserRole[];
  badge?: number;
}

export interface ChartData {
  name: string;
  value: number;
  color?: string;
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'select' | 'textarea' | 'date';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  validation?: {
    required?: string;
    minLength?: { value: number; message: string };
    pattern?: { value: RegExp; message: string };
  };
}

export interface Student {
  _id: string;
  studentName: string;
  mobileNumber: string;
  email: string;
  course: string;
  center: string;
  status: string;
  attendedBy: string;
  createdBy: string;
  attendedAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
