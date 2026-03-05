import mongoose, { Schema } from 'mongoose';
import { IInquiry, CourseType, LocationType, MediumType, InquiryStatus, FollowUpType, FollowUpStatus, FollowUpOutcome } from '../types';

const followUpSchema = new Schema({
  type: {
    type: String,
    enum: ['call', 'email', 'whatsapp'],
    required: [true, 'Follow-up type is required']
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled', 'rescheduled', 'no_answer', 'busy'],
    default: 'scheduled'
  },
  title: {
    type: String,
    required: false,
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  completedDate: {
    type: Date
  },
  duration: {
    type: Number,
    min: [1, 'Duration must be at least 1 minute'],
    max: [1440, 'Duration cannot exceed 1440 minutes (24 hours)']
  },
  outcome: {
    type: String,
    enum: ['positive', 'neutral', 'negative', 'interested', 'not_interested', 'needs_time', 'requested_info', 'scheduled_meeting']
  },
  nextFollowUpDate: {
    type: Date
  },
  inquiryStatus: {
    type: String,
    enum: ['hot', 'warm', 'cold'],
    default: 'warm'
  },
  message: {
    type: String,
    trim: true,
    maxlength: [1000, 'Message cannot be more than 1000 characters']
  },
  leadStage: {
    type: String,
    enum: ['Cold', 'Warm', 'Hot', 'Not Interested', 'Walkin', 'Online-Conversion'],
    required: false
  },
  subStage: {
    type: String,
    trim: true,
    required: false
  },
  completionStatus: {
    type: String,
    enum: ['complete', 'incomplete'],
    default: 'incomplete'
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const inquirySchema = new Schema<IInquiry>({
  name: {
    type: String,
    required: false,
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: false,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(value: string) {
        // Allow empty email
        if (!value || value.trim() === '') {
          return true;
        }
        // Validate email format if provided
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(value);
      },
      message: 'Please enter a valid email'
    }
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: function(value: string) {
        // Phone number should start with + and contain country code + 10 digits
        // Format: +[country code][10 digits] (e.g., +911234567890)
        if (!value || !value.startsWith('+')) {
          return false;
        }
        const phoneWithoutPlus = value.substring(1);
        // Should have at least 10 digits after country code
        return /^[0-9]{10,}$/.test(phoneWithoutPlus);
      },
      message: 'Please enter a valid phone number with country code (e.g., +911234567890)'
    }
  },
  city: {
    type: String,
    required: false,
    trim: true,
    maxlength: [30, 'City name cannot be more than 30 characters']
  },
  education: {
    type: String,
    required: false,
    trim: true,
    maxlength: [100, 'Education cannot be more than 100 characters']
  },
  course: {
    type: String,
    required: false,
    trim: true
  },
  preferredLocation: {
    type: String,
    required: [true, 'Preferred location is required'],
    trim: true
  },
  medium: {
    type: String,
    required: [true, 'Medium is required'],
    trim: true
  },
  message: {
    type: String,
    required: false,
    trim: true,
    maxlength: [1000, 'Message cannot be more than 1000 characters']
  },
  status: {
    type: String,
    default: 'warm',
    trim: true
  },
  assignmentStatus: {
    type: String,
    enum: ['not_assigned', 'assigned', 'reassigned', 'forwarded_to_sales'],
    default: 'not_assigned'
  },
  department: {
    type: String,
    enum: ['presales', 'sales'],
    default: 'presales'
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  forwardedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // When an inquiry is forwarded to sales, we capture that timestamp separately
  // so that later updates (like follow-ups) don't change the original forward time.
  forwardedAt: {
    type: Date,
    default: undefined
  },
  isUnattended: {
    type: Boolean,
    default: false
  },
  unattendedAt: {
    type: Date
  },
  viewedByAssignedUserAt: {
    type: Date
  },
  messages: [{
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, 'Message cannot be more than 1000 characters']
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  followUps: [followUpSchema],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Note: forwardedAt preservation is handled in the controller using atomic MongoDB updates
// This ensures forwardedAt can NEVER be changed once it's been set (only when forwarding to sales)

// Index for better query performance
inquirySchema.index({ email: 1 });
inquirySchema.index({ status: 1 });
inquirySchema.index({ course: 1 });
inquirySchema.index({ assignedTo: 1 });
inquirySchema.index({ createdAt: -1 });
inquirySchema.index({ isUnattended: 1 });
inquirySchema.index({ phone: 1 });
inquirySchema.index({ department: 1 });

// Compound indexes for common dashboard/list query patterns
inquirySchema.index({ department: 1, preferredLocation: 1, createdAt: -1 });
inquirySchema.index({ assignedTo: 1, department: 1 });
inquirySchema.index({ isUnattended: 1, department: 1 });
inquirySchema.index({ department: 1, status: 1 });
inquirySchema.index({ preferredLocation: 1, createdAt: -1 });

export default mongoose.model<IInquiry>('Inquiry', inquirySchema);
