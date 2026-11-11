import mongoose from 'mongoose';

/** One document per (user, movie): the user's reaction, watchlist and watched state. */
const interactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    movieId: { type: Number, required: true },
    reaction: { type: String, enum: ['like', 'dislike', null], default: null },
    inWatchlist: { type: Boolean, default: false },
    watched: { type: Boolean, default: false },
  },
  { timestamps: true },
);

interactionSchema.index({ user: 1, movieId: 1 }, { unique: true });
interactionSchema.index({ user: 1, inWatchlist: 1, updatedAt: -1 });

export const Interaction = mongoose.models.Interaction || mongoose.model('Interaction', interactionSchema);
