# 🎬 MovieMatch

MovieMatch asks you a short, fun quiz when you sign up, then recommends movies you'll actually enjoy. Every pick comes with a reason, and each 👍 or 👎 you give improves the next set of picks.

| Layer | Tech |
|---|---|
| Frontend | Vue 3 · Vite · Pinia · Vue Router (lazy-loaded routes, ~55 KB gzipped first load). The "Midnight Programme" visual design is described below |
| Backend | Node.js · Express 5 · Mongoose · Google Identity Platform sign-in (Firebase Admin, HttpOnly session cookies) · zod · helmet · rate limiting |
| Auth | Google Identity Platform (Firebase Authentication): email/password + Google; Firebase Auth emulator for local dev |
| Database | MongoDB (MongoDB Atlas on GCP in production) |
| ML | Python · numpy · scipy: a hybrid collaborative + content recommender trained on MovieLens |
| Cloud | Google Cloud Run · Cloud Build CI/CD · Artifact Registry · Secret Manager |

```
             ┌──────────────── Cloud Run container ────────────────┐
 Browser ──▶ │ Express ─┬─ /api/*  → auth, quiz, recs, library      │ ──▶ MongoDB Atlas
  (Vue SPA)  │          │            └─ Recommender (in-memory, ~1 ms) │     users, interactions,
             │          └─ /*      → built Vue app (static, cached)  │     TMDB cache
             └──────────────────────────────────────────────────────┘
                     ▲ model.json + embeddings.bin (trained offline by ml/train.py)
```

---

## The machine-learning model

**Dataset:** [MovieLens `ml-latest-small`](https://grouplens.org/datasets/movielens/) from GroupLens: 100,836 ratings by 610 users, plus genres, free-text user tags and IMDb/TMDB links. It's the standard academic benchmark for recommenders, it's licensed for research and education, and it's small enough to retrain in about a second. Movies with fewer than 5 ratings are dropped, which leaves **3,650 movies**.

**Model (`ml/moviematch_ml/model.py`):** a hybrid embedding with one 80-dimensional vector per movie.

1. **Collaborative filtering:** truncated SVD (k=48) of the user-mean-centred rating matrix. Movies loved by the same people end up close together.
2. **Content:** TF-IDF over genres and user tags (for example "pixar", "mind-bending", "twist ending"), compressed with LSA (k=32). This handles rarely rated movies (cold start).
3. **Fusion:** `[√α · collab, √(1-α) · content]`, so the dot product of two vectors = `α·cos_collab + (1-α)·cos_content`.

**Personalisation without retraining:** a user's taste vector is the weighted sum of the movies they picked or liked (+) and disliked (−), plus the centroids of their favourite genres. A brand-new user gets personal results right after the quiz. At request time the API adds:
- a popularity prior, scaled by the user's "crowd-pleasers ↔ hidden gems" answer;
- mood, era and audience boosts;
- hard filters for avoided genres;
- **MMR** re-ranking for diversity;
- a human-readable reason for each pick.

**Evaluation** (per-user *temporal* 80/20 split: we predict each user's most recent likes from their earlier ones):

| Model | NDCG@10 | Recall@10 | Catalogue coverage |
|---|---|---|---|
| Popularity baseline | 0.076 | 0.075 | 2.6% |
| Content only (α=0) | 0.045 | 0.049 | 18.2% |
| Collaborative only (α=1) | 0.103 | 0.108 | 24.2% |
| **Hybrid (α=0.9, β=0.4), shipped** | **0.109** | **0.116** | **22.6%** |

Hyperparameters are chosen to maximise NDCG@10 **subject to ≥20% catalogue coverage**. Chasing accuracy alone pushes toward "show everyone the same blockbusters", which scores a little better offline but is a worse product. The full grid prints when you run `train.py`. The live numbers also appear in the app under *Profile → How MovieMatch picks for you*.

Retrain:
```bash
cd ml
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # (.venv/bin/pip on macOS/Linux)
curl -LO https://files.grouplens.org/datasets/movielens/ml-latest-small.zip
mkdir -p data/raw && unzip ml-latest-small.zip -d data/raw
.venv/Scripts/python train.py           # writes ../backend/model/{model.json,embeddings.bin}
```

### 📓 The notebook

[`ml/notebooks/MovieMatch_Hybrid_Recommender.ipynb`](ml/notebooks/MovieMatch_Hybrid_Recommender.ipynb) is the full, executed walkthrough of the model. Before every major cell it explains *the goal*, *the why* and *the key parameters*, in five phases:

1. **Environment & hardware check:** CPU/GPU/TPU/BLAS detection, frozen run config, dataset download.
2. **EDA & preprocessing:** dataset summary, 11 data-integrity checks, distributions, and a leak-free temporal split with its own validations.
3. **Architecture:** the maths, a shapes/parameter table (292k learned values, a 1.1 MB artifact), invariant checks and SVD spectra.
4. **Training pipeline:** a 126-trial grid search with logging and a resumable JSONL checkpoint, coverage-constrained selection, a capacity curve, then refit and export with a SHA-256 manifest.
5. **Evaluation:** baselines, a hyperparameter heatmap and accuracy-vs-coverage frontier, Recall/NDCG@K curves, a confusion matrix and classification report @10, cold-start analysis by user activity, nearest neighbours, and serving latency.

It imports the core maths from `moviematch_ml`, so it can't drift from production. Its exported embeddings are verified to be byte-identical to `backend/model/`. It writes only to `ml/artifacts/` unless you set `export_to_backend=True`.

```bash
cd ml && .venv/Scripts/pip install -r requirements-notebook.txt
jupyter lab notebooks/   # or open it in VS Code; it runs in under 10 s on a laptop CPU
```

---

## Visual design: "Midnight Programme"

The UI is styled after a printed film-festival programme rather than a generic streaming app.

- **Palette:** newsprint paper (`--paper`) with film grain, ink black, and a single projector-red accent. Mustard and teal appear only on posters. Every colour is a CSS variable in [frontend/src/styles/main.css](frontend/src/styles/main.css).
- **Type:**
  - *Big Shoulders Display*, a condensed face from Chicago marquee signage, for headlines.
  - *Newsreader*, an editorial serif, for body text; its italics carry the "why you'll like it" notes.
  - *Courier Prime*, the screenplay typeface, for labels and metadata (`INT. YOUR COUCH — TONIGHT`).
- **Posters:** films without a TMDB poster get a generated **screen-print**: two inks, a geometric motif, a halftone field and an offset "misregistered" title. The colours are hashed from the movie id, so they're stable and evenly spread.
- **Motifs:** match scores are perforated ticket stubs, mood filters are punched tickets, rows are numbered like programme entries, the sign-in form is an admission ticket, and quiz answers are ruled index cards.
- **Motion (CSS only):**
  - **Landing:** the headline drops in tile by tile on a marquee with chasing bulbs, above a rolling film strip.
  - **Home:** the "Tonight's feature" block reveals in a staggered sequence.
  - **Quiz finish:** ends on a film-leader **3-2-1 countdown**.
  - `prefers-reduced-motion` turns all of it off.

## Run it locally

**Fastest (no MongoDB install needed):**
```bash
cd frontend && npm install && npm run build
cd ../backend && npm install && npm run demo      # → http://localhost:8080
```
`npm run demo` starts a temporary in-memory MongoDB and the **Firebase Auth emulator** (sign-in, no Google account or Java needed), so all data, accounts included, is lost when you stop it. In the emulator, "Sign in with Google" opens a stand-in account picker: choose *Add new account* → *Auto-generate user information* → *Sign in with Google.com*.

**Development with hot reload** (needs MongoDB, or a free Atlas cluster):
```bash
cp backend/.env.example backend/.env    # fill in MONGODB_URI; set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
cd backend && npm run emulator          # Firebase Auth emulator on :9099
cd backend && npm run dev               # API on :8080
cd frontend && npm run dev              # UI on :5173 (proxies /api to :8080)
```

**Posters (optional):** set `TMDB_API_KEY` (free from themoviedb.org) to show real posters, plot overviews and runtimes. Results are cached in MongoDB, so each movie is fetched only once. Without a key, the UI shows designed gradient cards.

---

## Tests

| Suite | Command | What it covers |
|---|---|---|
| ML (13) | `cd ml && .venv/Scripts/python -m pytest` | title cleaning, temporal split, TF-IDF, hybrid maths, taste-cluster separation, metrics, exported artifact integrity |
| Backend (57) | `cd backend && npm test` | recommender behaviour and latency; API integration on a real in-memory MongoDB: validation, security headers, full quiz → recs → feedback journey, data isolation; **sign-in security**: forged / expired / stale ID tokens, session-cookie flags and expiry, profile-hijack via unverified email, "sign out of all devices", password-reset revocation, CSRF. Identity Platform is replaced by an offline fake ([test/helpers.js](backend/test/helpers.js)) |
| Frontend (24) | `cd frontend && npm test` | router guards, sign-in form (Identity Platform calls, ID-token → session exchange, remember me, Google popup, friendly errors), forgot password (no account enumeration), session-expiry handling, optimistic updates and rollback, full quiz flow |

All three suites run in Cloud Build before every deploy.

---

## Deploy to Google Cloud

1. **Database:** create a MongoDB Atlas cluster. Choose **Google Cloud** as the provider, in the same region as Cloud Run (e.g. `us-central1`). Create a database user and copy the `mongodb+srv://…` connection string. Under *Network Access*, allow `0.0.0.0/0` (simplest), or set up a Serverless VPC connector with a static egress IP for a stricter setup.
2. **Sign-in:** in the Cloud Console, open **Identity Platform** → *Enable*. Add the **Google** provider only. Under *Application setup details*, copy the `apiKey`.
3. **One-time setup and first deploy** (needs the [gcloud CLI](https://cloud.google.com/sdk/docs/install)):
   ```bash
   PROJECT_ID=your-project MONGODB_URI='mongodb+srv://…' FIREBASE_API_KEY='AIza…' TMDB_API_KEY=optional ./deploy/setup-gcp.sh
   ```
   This enables the APIs, creates the Artifact Registry repo and the Secret Manager secrets, and creates a least-privilege runtime service account (secret access + *Firebase Authentication Admin*, to manage sessions). It then runs `cloudbuild.yaml`: **tests → Docker build → push → Cloud Run deploy**, and prints the URL.
4. **Authorise the domain:** add the printed Cloud Run domain under Identity Platform → *Settings → Security → Authorized domains*.
5. **Continuous deployment:** in Cloud Build, create a trigger on pushes to `main` that uses `cloudbuild.yaml` (set the `_FIREBASE_API_KEY` substitution on the trigger).

Production safeguards:
- The server refuses to start without `MONGODB_URI`, `FIREBASE_PROJECT_ID` and `FIREBASE_API_KEY`, or if the auth emulator is configured.
- The container runs as a non-root user.
- Secrets are never baked into the image.
- Auth cookies are `HttpOnly; Secure; SameSite=Strict` (see *Authentication & security*).
- Helmet sets a strict CSP, and sign-in endpoints are rate-limited.
- Shutdown on Cloud Run's SIGTERM is graceful.

## Authentication & security

Sign-in is **Google-only**, through **Google Identity Platform** (Firebase Authentication). MovieMatch never sees or stores a password.

**Sign-in:** a single "Sign in with Google" button (a Google popup), plus "Remember me for 14 days". A first sign-in creates the account and leads into the taste quiz. The sign-in and sign-up pages keep MovieMatch's own design; the button talks to Identity Platform through the Firebase JS SDK, which is loaded only on those pages.

**What Google handles:** passwords, 2-step verification, account recovery and suspicious-sign-in protection all live in the person's Google account. Google also guarantees the email address is verified.

**Enforced on the server:** `POST /api/auth/session` only accepts ID tokens from an allowed provider (`allowedProviders` in [backend/src/config.js](backend/src/config.js)). An email/password or anonymous account created directly against Identity Platform gets `403 PROVIDER_NOT_ALLOWED`, so hiding the form isn't the only protection.

**How a session starts:**
1. The browser signs in with Identity Platform and receives a short-lived **ID token**.
2. It posts the token to `POST /api/auth/session`. The server verifies it (signature, project, expiry) and only accepts tokens from a sign-in **within the last 5 minutes**, so an old leaked token can't start a session.
3. The server finds or creates the MovieMatch profile and sets a Firebase **session cookie** (`mm_session`): 14 days with "Remember me", otherwise a browser-session cookie (24 h max).
4. The browser SDK then signs itself out and keeps its state in memory only, so the HttpOnly cookie is the only credential left in the browser.

**Session security:**
- The cookie is `HttpOnly` (unreadable by JavaScript, so an XSS bug can't steal it), `Secure` in production and `SameSite=Strict`. Tokens are never returned in JSON bodies. API clients can send `Authorization: Bearer <Identity Platform ID token>` instead.
- Every API call verifies the cookie's signature locally, then maps it to the profile with one indexed lookup.
- **Sign out of all devices** (*Profile → Security*) ends every session and revokes the user's Identity Platform tokens.
- **Revocation from Identity Platform** (e.g. an admin disabling the account or revoking its tokens) ends existing sessions. The server checks Identity Platform's "tokens valid after" time, cached for 60 seconds per user, so other devices are signed out within a minute.
- **Deleting the account** removes the MovieMatch profile, its history and the Identity Platform account.
- A profile can only be claimed by a different identity with the same email if Identity Platform has *verified* that email (e.g. Google), which blocks account takeover through unverified sign-ups.

**Request hygiene:**
- Cross-site POST/PUT/DELETE requests are rejected using the `Origin` and `Sec-Fetch-Site` headers.
- API responses are `Cache-Control: no-store`.
- Helmet applies a strict CSP (allowing only Identity Platform's endpoints and the Google sign-in frame), `Cross-Origin-Opener-Policy: same-origin-allow-popups` for the Google popup, zod validation on every input, JSON bodies capped at 50 KB, and a rate limit on session creation.

**Configuration** (see [backend/.env.example](backend/.env.example)): `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY` (the public web key) and optionally `FIREBASE_AUTH_DOMAIN`. Locally, leave them unset and the emulator is used.

## Performance notes
- The model loads in ~15 ms. Scoring all 3,650 movies plus diversity re-ranking takes **~1 ms** per request, and the 6-row home page responds in ~35 ms end to end.
- Responses are gzip-compressed. Hashed assets are cached for a year (`immutable`), and `index.html` is never cached.
- Each page is its own JS chunk. Images lazy-load, and search is debounced and cancels in-flight requests.

## Known limitations
- MovieLens has no age ratings. *"Watching with family"* mode blocks Horror, Crime, Thriller and Film-Noir plus titles tagged with adult content, but untagged adult comedies can still slip through. The fix is to fetch TMDB `release_dates` certifications into the existing `MovieMeta` cache and filter on them.
- The catalogue stops at 2018 (when the dataset was released). Retrain on `ml-latest` (33M ratings) for a bigger, newer catalogue; the code is the same.
