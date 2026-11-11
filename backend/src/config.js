import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env.NODE_ENV || 'development';
const isTest = env === 'test';

export const config = {
  env,
  isProd: env === 'production',
  isTest,
  port: Number(process.env.PORT) || 8080,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moviematch',
  /** Public origin of the app (used for OAuth redirect URIs and email links). */
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT) || 8080}`).replace(/\/$/, ''),

  // --- Sign-in: Google Identity Platform (Firebase Authentication) ----------
  // Passwords, Google sign-in, reset emails and brute-force protection are handled by
  // Identity Platform. Locally we use the Firebase Auth emulator with a "demo-" project,
  // which needs no Google account or credentials.
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || (env === 'production' ? '' : 'demo-moviematch'),
    // Public web config (safe to expose to browsers; it identifies the project, it is not a secret).
    apiKey: process.env.FIREBASE_API_KEY || (env === 'production' ? '' : 'demo-api-key'),
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    emulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || '', // e.g. 127.0.0.1:9099
    // Sign-in methods MovieMatch accepts (Google only); other Identity Platform sign-ins are refused.
    allowedProviders: ['google.com'],
  },
  session: {
    cookie: 'mm_session',
    rememberMs: 14 * 24 * 3600 * 1000, // "Remember me" (Firebase's maximum session-cookie lifetime)
    browserSessionMs: 24 * 3600 * 1000, // otherwise: a browser-session cookie, valid at most 24 h
    maxAuthAgeSec: 5 * 60, // only exchange ID tokens from a sign-in within the last 5 minutes
  },

  // --- Integrations (optional) -----------------------------------------------
  tmdbApiKey: process.env.TMDB_API_KEY || '',

  modelDir: process.env.MODEL_DIR || path.join(root, 'model'),
  staticDir: process.env.STATIC_DIR || path.join(root, '..', 'frontend', 'dist'),
};

export function assertProductionConfig() {
  if (!config.isProd) return;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI must be set in production');
  if (!config.firebase.projectId || !config.firebase.apiKey) throw new Error('FIREBASE_PROJECT_ID and FIREBASE_API_KEY must be set in production');
  if (config.firebase.emulatorHost) throw new Error('FIREBASE_AUTH_EMULATOR_HOST must not be set in production (it disables token signature checks)');
}
