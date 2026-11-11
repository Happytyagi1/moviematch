/**
 * Tiny fetch wrapper: JSON in/out, cookie-based session, consistent errors.
 *
 * The session is an HttpOnly cookie issued after signing in with Google Identity
 * Platform, so this code never sees a token. A 401 means the session ended (expired,
 * signed out everywhere, or account deleted) and sends the user back to sign in.
 */
export class ApiError extends Error {
  constructor(status, message, details, code) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

// Endpoints where a 401 is an expected answer, not "your session ended".
const QUIET_401 = ['/auth/me', '/auth/session', '/auth/logout'];

export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'Can’t reach MovieMatch — check your connection');
  }

  if (res.status === 401 && !QUIET_401.includes(path)) onUnauthorized();
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong', data.details, data.code);
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const Auth = {
  /** Public Identity Platform web config + whether the emulator is in use. */
  config: () => api('/auth/config'),
  /** Exchange a fresh Identity Platform ID token for our HttpOnly session cookie. */
  session: (idToken, remember = false, name) => api('/auth/session', { method: 'POST', body: { idToken, remember, ...(name ? { name } : {}) } }),
  me: () => api('/auth/me'),
  logout: () => api('/auth/logout', { method: 'POST' }),
  logoutAll: () => api('/auth/logout-all', { method: 'POST' }),
  deleteAccount: () => api('/auth/me', { method: 'DELETE' }),
};

export const Movies = {
  options: () => api('/onboarding/options'),
  previews: () => api('/onboarding/previews'),
  // `v` busts browser caches when the showcase list changes (the server ignores it).
  showcase: () => api('/showcase?v=2'),
  seeds: (genres = [], { limit, offset } = {}) => api(`/onboarding/seeds${qs({ genres: genres.join(','), limit, offset })}`),
  savePreferences: (prefs) => api('/preferences', { method: 'PUT', body: prefs }),
  home: () => api('/recommendations/home'),
  recommendations: (params, signal) => api(`/recommendations${qs(params)}`, { signal }),
  search: (q, signal, limit) => api(`/movies/search${qs({ q, limit })}`, { signal }),
  details: (id) => api(`/movies/${id}`),
  interact: (id, patch) => api(`/interactions/${id}`, { method: 'PUT', body: patch }),
  library: () => api('/library'),
  libraryState: () => api('/library/state'),
  favorites: () => api('/favorites'),
  model: () => api('/model'),
};
