import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';

vi.mock('../src/api.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    Auth: { ...real.Auth, config: vi.fn(), session: vi.fn(), me: vi.fn(), logout: vi.fn(), logoutAll: vi.fn(), deleteAccount: vi.fn() },
    Movies: {
      options: vi.fn(), seeds: vi.fn(), savePreferences: vi.fn(), home: vi.fn(), recommendations: vi.fn(),
      search: vi.fn(), details: vi.fn(), interact: vi.fn(), library: vi.fn(), libraryState: vi.fn(), favorites: vi.fn(), model: vi.fn(),
    },
  };
});

// Google Identity Platform (the Firebase JS SDK) is faked: tests check what we ask it to do
// and that its ID token is exchanged for our session.
vi.mock('../src/firebase.js', async (orig) => ({ ...(await orig()), firebaseAuth: vi.fn() }));
const fb = {
  signInWithPopup: vi.fn(), signOut: vi.fn(),
  GoogleAuthProvider: class { setCustomParameters() { return this; } },
};
const fbAuth = { name: 'fake-auth' };
const cfg = { providers: ['google.com'], firebase: {} };
const fbUser = { getIdToken: () => Promise.resolve('id-token') };
const authError = (code) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

const { Auth, Movies, ApiError, api, setUnauthorizedHandler } = await import('../src/api.js');
const { firebaseAuth } = await import('../src/firebase.js');
const { useAuth } = await import('../src/stores/auth.js');
const { useUi } = await import('../src/stores/ui.js');
const { createAppRouter } = await import('../src/router.js');
const { passwordStrength, posterGradient } = await import('../src/utils/movie.js');
const AuthView = (await import('../src/views/AuthView.vue')).default;
const MovieCard = (await import('../src/components/MovieCard.vue')).default;
const OnboardingView = (await import('../src/views/OnboardingView.vue')).default;

const movie = { id: 1, title: 'Toy Story', year: 1995, genres: ['Animation'], rating: 3.9, match: 92, reason: { text: 'Because you liked Up' } };
const stubs = { RouterLink: { template: '<a><slot /></a>' } };

let pinia;
beforeEach(() => {
  vi.resetAllMocks();
  Auth.me.mockRejectedValue(new ApiError(401, "signed out"));
  Auth.config.mockResolvedValue(cfg);
  firebaseAuth.mockResolvedValue({ auth: fbAuth, fb, cfg });
  fb.signOut.mockResolvedValue();
  pinia = createPinia();
  setActivePinia(pinia);
});

describe('utils', () => {
  it('rates password strength', () => {
    expect(passwordStrength('abc').level).toBe(0);
    expect(passwordStrength('abcdefg1').level).toBe(2);
    expect(passwordStrength('Abcdefgh12!x').label).toBe('Strong');
  });
  it('poster gradients are deterministic per movie', () => {
    expect(posterGradient(42)).toBe(posterGradient(42));
    expect(posterGradient(42)).not.toBe(posterGradient(43));
  });
});

describe('router guards', () => {
  async function go(path, user) {
    Auth.me.mockImplementation(() => (user ? Promise.resolve({ user }) : Promise.reject(new ApiError(401, 'no'))));
    const router = createAppRouter(createMemoryHistory());
    await router.push(path);
    return router.currentRoute.value;
  }
  it('sends guests to sign-in and remembers where they were going', async () => {
    const r = await go('/library');
    expect(r.name).toBe('signin');
    expect(r.query.next).toBe('/library');
  });
  it('forces the quiz before the app for new users', async () => {
    expect((await go('/home', { id: 'u', name: 'A', onboarded: false })).name).toBe('onboarding');
  });
  it('skips landing/sign-in for signed-in users', async () => {
    expect((await go('/signin', { id: 'u', name: 'A', onboarded: true })).name).toBe('home');
  });
});

describe('AuthView (Google-only sign-in)', () => {
  // Wait for the router's initial navigation (and its 'who is signed in?' check) before mounting.
  const mountAuth = async (mode, query = {}) => {
    const router = createAppRouter(createMemoryHistory());
    await router.push({ path: mode === 'signup' ? '/signup' : '/signin', query });
    return { router, wrapper: mount(AuthView, { props: { mode }, global: { plugins: [pinia, router], stubs } }) };
  };
  const onboardedUser = { id: 'u', name: 'Ada', onboarded: true };

  it('shows only Google sign-in: no email or password fields', async () => {
    for (const mode of ['signin', 'signup']) {
      const { wrapper } = await mountAuth(mode);
      expect(wrapper.find('input[type=email]').exists()).toBe(false);
      expect(wrapper.find('input[type=password]').exists()).toBe(false);
      expect(wrapper.text()).not.toMatch(/Forgot password/i);
      expect(wrapper.find('.google-btn').text()).toBe(mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google');
    }
  });

  it('signs in with the Google popup, swaps the ID token for a session, and forgets the SDK state', async () => {
    fb.signInWithPopup.mockResolvedValue({ user: fbUser });
    Auth.session.mockResolvedValue({ user: onboardedUser });
    const { wrapper, router } = await mountAuth('signin');
    const replace = vi.spyOn(router, 'replace').mockResolvedValue();
    await wrapper.find('.google-btn').trigger('click');
    await flushPromises();
    expect(fb.signInWithPopup).toHaveBeenCalledWith(fbAuth, expect.any(fb.GoogleAuthProvider));
    expect(Auth.session).toHaveBeenCalledWith('id-token', false);
    expect(fb.signOut).toHaveBeenCalled(); // the HttpOnly cookie is the only credential kept
    expect(replace).toHaveBeenCalledWith('/home');
  });

  it('sends "Remember me" with the session exchange', async () => {
    fb.signInWithPopup.mockResolvedValue({ user: fbUser });
    Auth.session.mockResolvedValue({ user: onboardedUser });
    const { wrapper, router } = await mountAuth('signin');
    vi.spyOn(router, 'replace').mockResolvedValue();
    await wrapper.find('input[type=checkbox]').setValue(true);
    await wrapper.find('.google-btn').trigger('click');
    await flushPromises();
    expect(Auth.session).toHaveBeenCalledWith('id-token', true);
  });

  it('sends brand-new accounts to the quiz', async () => {
    fb.signInWithPopup.mockResolvedValue({ user: fbUser });
    Auth.session.mockResolvedValue({ user: { ...onboardedUser, onboarded: false } });
    const { wrapper, router } = await mountAuth('signup');
    const replace = vi.spyOn(router, 'replace').mockResolvedValue();
    await wrapper.find('.google-btn').trigger('click');
    await flushPromises();
    expect(replace).toHaveBeenCalledWith('/welcome');
  });

  it.each([
    ['auth/popup-closed-by-user', 'Google sign-in was cancelled.'],
    ['auth/popup-blocked', /blocked the Google sign-in window/],
    ['auth/unauthorized-domain', /isn’t authorised for sign-in/],
  ])('explains %s in plain English', async (code, message) => {
    fb.signInWithPopup.mockRejectedValue(authError(code));
    const { wrapper } = await mountAuth('signin');
    await wrapper.find('.google-btn').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toMatch(message);
    expect(Auth.session).not.toHaveBeenCalled();
  });

  it('disables the button while the Google window is open', async () => {
    let finish;
    fb.signInWithPopup.mockReturnValue(new Promise((r) => { finish = r; }));
    const { wrapper } = await mountAuth('signin');
    await wrapper.find('.google-btn').trigger('click');
    await flushPromises();
    expect(wrapper.find('.google-btn').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.google-btn').text()).toBe('Waiting for Google…');
    finish({ user: fbUser });
  });
});

describe('MovieCard', () => {
  const mountCard = () => mount(MovieCard, { props: { movie }, global: { plugins: [pinia] } });

  it('renders title, match and the reason', () => {
    const w = mountCard();
    expect(w.text()).toContain('Toy Story');
    expect(w.text()).toContain('92%');
    expect(w.text()).toContain('Because you liked Up');
  });

  it('adds to watchlist optimistically', async () => {
    let resolve;
    Movies.interact.mockReturnValue(new Promise((r) => (resolve = r)));
    const w = mountCard();
    await w.find('[aria-label="Add to watchlist"]').trigger('click');
    expect(useUi().stateOf(1).inWatchlist).toBe(true); // before the server answers
    resolve({ interaction: { inWatchlist: true, reaction: null, watched: false } });
    await flushPromises();
    expect(w.find('[aria-label="Remove from watchlist"]').exists()).toBe(true);
  });

  it('rolls back and shows a toast when the server fails', async () => {
    Movies.interact.mockRejectedValue(new ApiError(500, 'Something went wrong'));
    const w = mountCard();
    await w.find('[aria-label="I like this"]').trigger('click');
    await flushPromises();
    const ui = useUi();
    expect(ui.stateOf(1).reaction).toBe(null);
    expect(ui.toasts[0]).toMatchObject({ type: 'error', text: 'Something went wrong' });
  });

  it('opens the details modal', async () => {
    const w = mountCard();
    await w.find('.poster-btn').trigger('click');
    expect(useUi().modalMovieId).toBe(1);
  });
});

describe('OnboardingView quiz', () => {
  it('requires a genre, then 3 favourite movies, then saves', async () => {
    Movies.options.mockResolvedValue({ genres: ['Comedy', 'Drama', 'Horror'], moods: ['funny'], eras: ['recent'], discovery: ['balanced'], audience: ['solo'] });
    Movies.seeds.mockResolvedValue({ movies: [1, 2, 3, 4].map((id) => ({ ...movie, id, title: `M${id}` })) });
    Movies.savePreferences.mockResolvedValue({ user: { id: 'u', name: 'Ada', onboarded: true } });
    Object.assign(useAuth(), { user: { id: 'u', name: 'Ada Lovelace', onboarded: false, preferences: {} }, ready: true });
    const router = createAppRouter(createMemoryHistory());
    vi.spyOn(router, 'replace').mockResolvedValue();
    const w = mount(OnboardingView, { global: { plugins: [pinia, router], stubs } });
    await flushPromises();

    const continueBtn = () => w.find('.nav-bar .btn-primary');
    expect(w.text()).toContain('Hi Ada');
    expect(continueBtn().attributes('disabled')).toBeDefined();

    await w.findAll('.chip').find((c) => c.text().includes('Comedy')).trigger('click');
    expect(continueBtn().attributes('disabled')).toBeUndefined();
    await continueBtn().trigger('click'); // → avoid step
    expect(continueBtn().text()).toContain('Skip');
    await continueBtn().trigger('click'); // → favourites
    await flushPromises();
    expect(Movies.seeds).toHaveBeenCalledWith(['Comedy'], { limit: 60, offset: 0 });

    const seeds = w.findAll('.seed');
    await seeds[0].trigger('click');
    await seeds[1].trigger('click');
    expect(continueBtn().attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('Pick 1 more');
    await seeds[2].trigger('click');
    expect(continueBtn().attributes('disabled')).toBeUndefined();

    await continueBtn().trigger('click'); // moods
    await continueBtn().trigger('click'); // eras
    await continueBtn().trigger('click'); // style
    expect(continueBtn().text()).toContain('Show my movies');
    await continueBtn().trigger('click'); // building → save
    await flushPromises();
    expect(Movies.savePreferences).toHaveBeenCalledWith(expect.objectContaining({ genres: ['Comedy'], favoriteMovies: [1, 2, 3], discovery: 'balanced' }));
  });
});

describe('api() session handling', () => {
  const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('a 401 on a private call ends the session once, with no retries', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = vi.fn().mockResolvedValue(json(401, { error: 'Your session expired', code: 'SESSION_EXPIRED' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/library')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    setUnauthorizedHandler(() => {});
  });

  it('expected 401s (checking who is signed in) don’t trigger the sign-out handler', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { error: 'Please sign in' })));
    await expect(api('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    setUnauthorizedHandler(() => {});
  });
});
