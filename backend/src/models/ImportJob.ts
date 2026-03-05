import mongoose, { Document, Schema } from 'mongoose';

export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IImportJob extends Document {
  status: ImportJobStatus;
  total: number;
  processed: number;
  duplicates: number;
  errorsCount: number;
  errorSample: string[];
  filePath: string;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ImportJobSchema = new Schema<IImportJob>(
  {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    total: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
    errorsCount: { type: Number, default: 0 },
    errorSample: { type: [String], default: [] },
    filePath: { type: String, required: true },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

ImportJobSchema.index({ createdAt: -1 });

const ImportJob = mongoose.model<IImportJob>('ImportJob', ImportJobSchema);
export default ImportJob;
