/**
 * Google Identity Platform (Firebase Authentication) in the browser.
 *
 * Loaded lazily, only on screens that sign people in, so the rest of the app doesn't
 * pay for the SDK. Firebase keeps its own state in memory only: right after signing in
 * we exchange the ID token for our HttpOnly session cookie and sign the SDK out again,
 * so no long-lived credential ever sits in localStorage / IndexedDB.
 */
import { Auth } from './api.js';

let ready = null;

/** Resolves to { auth, fb (the firebase/auth module), cfg (server-provided config) }. */
export function firebaseAuth() {
  ready ||= (async () => {
    const [{ initializeApp, getApps }, fb, cfg] = await Promise.all([import('firebase/app'), import('firebase/auth'), Auth.config()]);
    const app = getApps()[0] || initializeApp(cfg.firebase);
    const auth = fb.initializeAuth(app, { persistence: fb.inMemoryPersistence, popupRedirectResolver: fb.browserPopupRedirectResolver });
    if (cfg.emulatorUrl) fb.connectAuthEmulator(auth, cfg.emulatorUrl, { disableWarnings: true });
    return { auth, fb, cfg };
  })().catch((e) => {
    ready = null; // allow a retry
    throw e;
  });
  return ready;
}

const MESSAGES = {
  'auth/invalid-credential': 'Incorrect email or password',
  'auth/invalid-login-credentials': 'Incorrect email or password',
  'auth/wrong-password': 'Incorrect email or password',
  'auth/user-not-found': 'Incorrect email or password',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead?',
  'auth/weak-password': 'Password is too weak. Use at least 8 characters with a letter and a number.',
  'auth/password-does-not-meet-requirements': 'Password doesn’t meet the requirements. Use at least 8 characters with a letter and a number.',
  'auth/invalid-email': 'Please enter a valid email',
  'auth/missing-password': 'Please enter your password',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes or reset your password.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  'auth/account-exists-with-different-credential': 'This email already has a MovieMatch account. Sign in with your password first.',
  'auth/network-request-failed': 'Can’t reach the sign-in service — check your connection.',
  'auth/operation-not-allowed': 'This sign-in method isn’t enabled for this project yet.',
  'auth/expired-action-code': 'This reset link has expired. Please request a new one.',
  'auth/invalid-action-code': 'This reset link is invalid or was already used. Please request a new one.',
  'auth/requires-recent-login': 'For your security, please sign in again first.',
  'auth/unauthorized-domain': 'This website isn’t authorised for sign-in yet (add it under Authorized domains in Identity Platform).',
};

/** Turn a Firebase / API error into something a person can act on. */
export function friendlyError(e) {
  return MESSAGES[e?.code] || e?.message?.replace(/^Firebase: /, '').replace(/\s*\(auth\/[\w-]+\)\.?$/, '') || 'Something went wrong';
}
