import mongoose, { Schema, Document } from 'mongoose';

interface IActivity extends Document {
  inquiry: mongoose.Types.ObjectId;
  action: 'created' | 'claimed' | 'assigned' | 'reassigned' | 'forwarded_to_sales' | 'moved_to_unattended' | 'edited' | 'whatsapp_contact' | 'message_added';
  actor: mongoose.Types.ObjectId;
  targetUser?: mongoose.Types.ObjectId;
  details?: string;
  createdAt: Date;
}

const activitySchema = new Schema<IActivity>({
  inquiry: { type: Schema.Types.ObjectId, ref: 'Inquiry', required: true },
  action: { 
    type: String, 
    enum: ['created', 'claimed', 'assigned', 'reassigned', 'forwarded_to_sales', 'moved_to_unattended', 'edited', 'whatsapp_contact', 'message_added'], 
    required: true 
  },
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  targetUser: { type: Schema.Types.ObjectId, ref: 'User' },
  details: { type: String, trim: true }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

// Index for better query performance
activitySchema.index({ inquiry: 1 });
activitySchema.index({ actor: 1 });
activitySchema.index({ createdAt: -1 });

export default mongoose.model<IActivity>('Activity', activitySchema);
