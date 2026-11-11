import mongoose from 'mongoose';

export const MOODS = ['feel-good', 'thrilling', 'mind-bending', 'emotional', 'dark', 'romantic', 'funny', 'epic'];
export const ERAS = ['classic', 'retro', 'modern', 'recent'];
export const DISCOVERY = ['mainstream', 'balanced', 'hidden-gems'];
export const AUDIENCE = ['solo', 'partner', 'friends', 'family'];

const preferencesSchema = new mongoose.Schema(
  {
    genres: { type: [String], default: [] },
    avoidGenres: { type: [String], default: [] },
    favoriteMovies: { type: [Number], default: [] },
    moods: { type: [String], enum: MOODS, default: [] },
    eras: { type: [String], enum: ERAS, default: [] },
    discovery: { type: String, enum: DISCOVERY, default: 'balanced' },
    audience: { type: String, enum: AUDIENCE, default: 'solo' },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Identity lives in Google Identity Platform; this links the MovieMatch profile to it.
    // No password data is stored here.
    firebaseUid: { type: String, required: true, unique: true },
    providers: { type: [String], default: [] }, // e.g. ['google.com', 'apple.com']
    avatarUrl: String,
    // "Sign out of all devices": sessions from sign-ins before this moment are rejected.
    sessionsValidAfter: Date,
    onboarded: { type: Boolean, default: false },
    preferences: { type: preferencesSchema, default: () => ({}) },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    avatarUrl: this.avatarUrl || null,
    onboarded: this.onboarded,
    preferences: this.preferences,
    signInMethods: { password: this.providers.includes('password'), google: this.providers.includes('google.com'), apple: this.providers.includes('apple.com') },
    createdAt: this.createdAt,
  };
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
