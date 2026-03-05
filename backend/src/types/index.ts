import { Request } from 'express';
import { Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  office365Id?: string; // Track if user came from Office365
  office365Upn?: string; // Store Office365 UPN for reference
  centerPermissions?: string[]; // Centers the user can access (for sales role)
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export type UserRole = 'presales' | 'sales' | 'admin';

export interface IInquiryMessage {
  _id?: string;
  text: string;
  addedBy: string | IUser;
  createdAt: Date;
}

export interface IInquiry extends Document {
  name: string;
  email: string;
  phone: string;
  city: string;
  education: string;
  course: CourseType;
  preferredLocation: LocationType;
  medium: MediumType;
  message: string;
  messages: IInquiryMessage[];
  status: InquiryStatus;
  assignmentStatus: AssignmentStatus;
  department: DepartmentType;
  assignedTo?: string | IUser;
  forwardedBy?: string | IUser;
  forwardedAt?: Date;
  isUnattended?: boolean;
  unattendedAt?: Date;
  viewedByAssignedUserAt?: Date;
  followUps: IFollowUp[];
  createdBy: string | IUser;
  createdAt: Date;
  updatedAt: Date;
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

export interface IFollowUp {
  _id?: string;
  type: FollowUpType;
  status: FollowUpStatus;
  title?: string;
  completedDate?: Date;
  duration?: number;
  outcome?: FollowUpOutcome;
  nextFollowUpDate?: Date;
  inquiryStatus?: InquiryStatus;
  message?: string;
  leadStage?: string;
  subStage?: string;
  completionStatus?: 'complete' | 'incomplete';
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}



export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  centerPermissions?: string[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface InquiryFilters {
  search?: string;
  status?: InquiryStatus;
  course?: CourseType;
  location?: LocationType;
  medium?: MediumType;
  assignedTo?: string;
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
  department?: DepartmentType;
  assignmentStatus?: AssignmentStatus;
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
  recentInquiries: IInquiry[];
}
