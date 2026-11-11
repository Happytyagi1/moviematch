import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { appRoutes } from './routes/app-routes.js';
import { errorHandler, notFound, sameOriginOnly } from './middleware/index.js';

export function createApp({ recommender, firebase }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Cloud Run sits behind Google's front end
  app.locals.firebase = firebase; // Identity Platform verifier (a fake in tests)

  // The Firebase JS SDK talks to Identity Platform directly and uses a popup + iframe
  // on the project's auth domain for "Sign in with Google".
  const { projectId, authDomain, emulatorHost } = config.firebase;
  const authOrigin = `https://${authDomain || `${projectId}.firebaseapp.com`}`;
  const emulator = emulatorHost ? [`http://${emulatorHost}`] : [];
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://image.tmdb.org', 'https://lh3.googleusercontent.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          scriptSrc: ["'self'", 'https://apis.google.com'],
          connectSrc: ["'self'", 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', ...emulator],
          // Trailers play in YouTube's privacy-enhanced player, loaded only when someone presses Play.
          frameSrc: [authOrigin, 'https://www.youtube-nocookie.com', ...emulator],
        },
      },
      // The Google sign-in popup must be able to report back to this window.
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());
  if (!config.isTest) app.use(morgan(config.isProd ? 'tiny' : 'dev'));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down', model: recommender.meta.version, movies: recommender.n });
  });
  app.use('/api', sameOriginOnly, (_req, res, next) => {
    res.set('Cache-Control', 'no-store'); // personal data & tokens must never be cached by proxies
    next();
  });
  app.use('/api/auth', authRoutes());
  app.use('/api', appRoutes(recommender));
  app.use('/api', notFound);

  // Serve the built Vue SPA (single container deployment).
  if (fs.existsSync(path.join(config.staticDir, 'index.html'))) {
    app.use('/assets', express.static(path.join(config.staticDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(config.staticDir, { maxAge: '1h', index: false }));
    app.get('/{*splat}', (_req, res) => {
      res.set('Cache-Control', 'no-cache').sendFile(path.join(config.staticDir, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
