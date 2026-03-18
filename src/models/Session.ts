import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISession extends Document {
  ipAddress: string;
  userAgent: string;
  deviceInfo: string;
  phoneNumber?: string;
  simProvider?: string;
  isActive: boolean;
  socketId?: string;
  snapshots: string[];
  recordings: string[];
  lastSeen: Date;
  createdAt: Date;
}

const SessionSchema: Schema = new Schema({
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  deviceInfo: { type: String, required: true },
  phoneNumber: { type: String },
  simProvider: { type: String },
  isActive: { type: Boolean, default: true },
  socketId: { type: String },
  snapshots: { type: [String], default: [] },
  recordings: { type: [String], default: [] },
  lastSeen: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

// Prevent overwrite on HMR
const Session: Model<ISession> = mongoose.models.Session || mongoose.model<ISession>('Session', SessionSchema);

export default Session;
