import mongoose from 'mongoose';

/** Cache of TMDB details (poster, overview, runtime) so we hit TMDB at most once per movie. */
const movieMetaSchema = new mongoose.Schema(
  {
    _id: Number, // MovieLens id
    posterPath: String,
    backdropPath: String,
    overview: String,
    runtime: Number,
    fetchedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export const MovieMeta = mongoose.models.MovieMeta || mongoose.model('MovieMeta', movieMetaSchema);
