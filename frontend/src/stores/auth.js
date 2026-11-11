import { defineStore } from 'pinia';
import { Auth, Movies } from '../api.js';
import { firebaseAuth, friendlyError } from '../firebase.js';

/** Re-throw with a message people can act on (Firebase codes → plain English). */
const friendly = (e) => {
  const err = new Error(friendlyError(e));
  err.code = e?.code;
  throw err;
};

export const useAuth = defineStore('auth', {
  state: () => ({ user: null, ready: false }),
  getters: {
    isAuthed: (s) => !!s.user,
    firstName: (s) => s.user?.name?.split(' ')[0] || '',
  },
  actions: {
    async init() {
      if (this.ready) return;
      try {
        this.user = (await Auth.me()).user;
      } catch {
        this.user = null;
      } finally {
        this.ready = true;
      }
    },

    /**
     * Sign in (or sign up: a first sign-in creates the account) with Google, through
     * Google Identity Platform. The resulting ID token is swapped for our HttpOnly
     * session cookie, then the browser SDK forgets it.
     */
    async loginWithGoogle({ remember = false } = {}) {
      try {
        const { auth, fb } = await firebaseAuth();
        const provider = new fb.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' }); // let people pick which Google account
        const cred = await fb.signInWithPopup(auth, provider);
        try {
          const idToken = await cred.user.getIdToken();
          this.user = (await Auth.session(idToken, remember)).user;
        } finally {
          await fb.signOut(auth).catch(() => {}); // the HttpOnly cookie is now the only credential
        }
      } catch (e) {
        friendly(e);
      }
    },

    async savePreferences(prefs) {
      this.user = (await Movies.savePreferences(prefs)).user;
    },
    async logout() {
      await Auth.logout().catch(() => {});
      this.user = null;
    },
    async logoutAll() {
      await Auth.logoutAll();
      this.user = null;
    },
    async deleteAccount() {
      await Auth.deleteAccount();
      this.user = null;
    },
  },
});
