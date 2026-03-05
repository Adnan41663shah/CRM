import mongoose, { Schema, Document } from 'mongoose';

export interface ILeadStage {
  label: string;
  subStages: string[];
  color: string; // Tailwind color class prefix (e.g., 'red', 'blue', 'green')
}

export interface IOptionSettings extends Document {
  key: string;
  courses: string[];
  locations: string[];
  statuses: string[];
  mediums: string[];
  leadStages: ILeadStage[];
}

const leadStageSchema = new Schema<ILeadStage>({
  label: { type: String, required: true },
  subStages: { type: [String], default: [] },
  color: { type: String, default: 'gray' } // Default color
}, { _id: false });

const optionSettingsSchema = new Schema<IOptionSettings>({
  key: { type: String, unique: true, required: true },
  courses: { type: [String], default: ['CDEC', 'X-DSAAI', 'DevOps', 'Full-Stack', 'Any'] },
  locations: { type: [String], default: ['Nagpur', 'Pune', 'Nashik', 'Indore'] },
  statuses: { type: [String], default: ['hot', 'warm', 'cold'] },
  mediums: { type: [String], default: ['IVR', 'Email', 'WhatsApp'] },
  leadStages: {
    type: [leadStageSchema],
    default: [
      { label: 'Cold', subStages: ['Closure Timeline is Unknown', 'Duplicate Enquiry', 'Switch Off', 'School Student', 'Already Enrolled with Other Institute', 'Financial Issue', 'Invalid Number', 'Call Back', 'Join Later', 'Planning After 1 Month', 'Planning After 2 Months', 'Planning After 5 Months', 'Planning For Next Year'], color: 'blue' },
      { label: 'Warm', subStages: ['Follow-up', 'In Conversation'], color: 'yellow' },
      { label: 'Hot', subStages: ['Confirmed Admission'], color: 'red' },
      { label: 'Not Interested', subStages: ['Joined Somewhere Else', 'Dropped The Plan', 'Financial Issue', 'Time Constraint'], color: 'gray' },
      { label: 'Walkin', subStages: ['Walked-in to Center', 'Attended Demo', 'Not Interested After Demo', 'Converted After Walk-in', 'Follow-up Needed After Walk-in'], color: 'purple' },
      { label: 'Online-Conversion', subStages: ['Attended Online Demo', 'Interested Post Demo', 'Confirmed Admission', 'Did Not Respond After Demo', 'Need Follow-up After Demo'], color: 'green' }
    ]
  }
}, { timestamps: true });

const OptionSettings = mongoose.model<IOptionSettings>('OptionSettings', optionSettingsSchema);
export default OptionSettings;
