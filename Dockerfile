# syntax=docker/dockerfile:1
# MovieMatch — single container: Express API + built Vue SPA + trained model.
# Built by Cloud Build and deployed to Cloud Run (see cloudbuild.yaml).

# ---- 1. Build the Vue frontend -------------------------------------------
FROM node:24-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. Production dependencies for the API ------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# ---- 3. Runtime image ----------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/public \
    MODEL_DIR=/app/model
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY backend/model ./model
COPY --from=web /web/dist ./public
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "src/server.js"]
