import mongoose, { Document, Schema } from 'mongoose';

export interface IStudent extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    studentName: {
      type: String,
      default: '-',
    },
    mobileNumber: {
      type: String,
      default: '-',
    },
    email: {
      type: String,
      default: '-',
    },
    course: {
      type: String,
      default: '-',
    },
    center: {
      type: String,
      default: '-',
    },
    status: {
      type: String,
      default: '-',
    },
    attendedBy: {
      type: String,
      default: '-',
    },
    createdBy: {
      type: String,
      default: '-',
    },
    attendedAt: {
      type: String,
      default: '-',
    },
    notes: {
      type: String,
      default: '-',
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance; unique index for import duplicate handling
StudentSchema.index({ createdAt: -1 });
StudentSchema.index({ studentName: 1 });
StudentSchema.index({ mobileNumber: 1 }, { unique: true });
StudentSchema.index({ email: 1 });

const Student = mongoose.model<IStudent>('Student', StudentSchema);

export default Student;

