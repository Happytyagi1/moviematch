import mongoose from 'mongoose';

/** Cache of TMDB details (poster, overview, runtime) so we hit TMDB at most once per movie. */
const movieMetaSchema = new mongoose.Schema(
  {
    _id: Number, // MovieLens id
    posterPath: String,
    backdropPath: String,
    overview: String,
    runtime: Number,
    detailsFetched: Boolean, // poster/overview/runtime looked up (even if TMDB had none)
    // Best YouTube trailer from TMDB (null = checked, none found; re-checked monthly).
    trailerKey: String,
    trailerName: String,
    trailerCheckedAt: Date,
    fetchedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export const MovieMeta = mongoose.models.MovieMeta || mongoose.model('MovieMeta', movieMetaSchema);
