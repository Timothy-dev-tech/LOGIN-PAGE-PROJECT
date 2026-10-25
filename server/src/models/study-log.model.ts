import { Schema, model, type InferSchemaType } from 'mongoose';

/** One entry in a person's study log: what they studied, for how long, and when. */
const studyLogSchema = new Schema(
  {
    // The owner. Always taken from the access token, never from the request body.
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    topic: { type: String, required: true, trim: true },
    minutes: { type: Number, required: true, min: 1, max: 1440 },
    // Calendar day as "YYYY-MM-DD" (see validateStudiedOn for why it is not a Date).
    studiedOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

// The list page asks "my entries, newest day first", so one index serves both the filter
// and the sort. Without it MongoDB would scan every entry of every user.
studyLogSchema.index({ user: 1, studiedOn: -1, createdAt: -1 });

export type StudyLogDoc = InferSchemaType<typeof studyLogSchema>;
export const StudyLog = model('StudyLog', studyLogSchema);

export interface PublicStudyLog {
  id: string;
  topic: string;
  minutes: number;
  studiedOn: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicStudyLog(log: {
  id: string;
  topic: string;
  minutes: number;
  studiedOn: string;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicStudyLog {
  return {
    id: log.id,
    topic: log.topic,
    minutes: log.minutes,
    studiedOn: log.studiedOn,
    notes: log.notes ?? '',
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
  };
}