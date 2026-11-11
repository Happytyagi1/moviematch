#!/usr/bin/env bash
# One-time Google Cloud setup for MovieMatch, then the first deploy.
#
#   PROJECT_ID=my-project MONGODB_URI='mongodb+srv://...' FIREBASE_API_KEY=AIza... ./deploy/setup-gcp.sh
#
# Optional: TMDB_API_KEY=...  REGION=us-central1
#
# Sign-in uses Google Identity Platform in the same project. Before running this:
#   1. Console → Identity Platform → Enable. Add the "Google" provider (MovieMatch is Google-only).
#   2. Identity Platform → Providers → "Application setup details": copy the apiKey → FIREBASE_API_KEY.
# After the first deploy, add your Cloud Run domain under Identity Platform → Settings →
# Security → Authorized domains (this script prints it at the end).
# Requires: gcloud CLI, logged in (`gcloud auth login`) with Owner/Editor on the project.
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${MONGODB_URI:?Set MONGODB_URI (MongoDB Atlas connection string)}"
: "${FIREBASE_API_KEY:?Set FIREBASE_API_KEY (Identity Platform web API key, see the comment at the top)}"
REGION="${REGION:-us-central1}"
SERVICE=moviematch
REPO=moviematch
RUN_SA="moviematch-run"

gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "▶ Enabling APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com identitytoolkit.googleapis.com

# The account Cloud Build runs as: the legacy Cloud Build account in older projects, the
# Compute Engine default account in projects created since 2024. Ask instead of guessing.
BUILD_SA=$(gcloud builds get-default-service-account --format='value(serviceAccountEmail)' | sed 's#.*/##')
: "${BUILD_SA:?Could not determine the Cloud Build service account}"
echo "  Cloud Build runs as: $BUILD_SA"

echo "▶ Artifact Registry repo"
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --description="MovieMatch images"

echo "▶ Secrets"
upsert_secret() { # name value
  if gcloud secrets describe "$1" >/dev/null 2>&1; then
    printf '%s' "$2" | gcloud secrets versions add "$1" --data-file=-
  else
    printf '%s' "$2" | gcloud secrets create "$1" --replication-policy=automatic --data-file=-
  fi
}
upsert_secret moviematch-mongodb-uri "$MONGODB_URI"
# Optional integrations: only stored when provided (Secret Manager rejects empty values).
SECRETS=(moviematch-mongodb-uri)
optional_secret() { # name value
  if [ -n "$2" ]; then upsert_secret "$1" "$2"; fi
  if gcloud secrets describe "$1" >/dev/null 2>&1; then SECRETS+=("$1"); fi
}
optional_secret moviematch-tmdb-key "${TMDB_API_KEY:-}"

echo "▶ Runtime service account (least privilege: read secrets + manage sign-in sessions)"
gcloud iam service-accounts describe "${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$RUN_SA" --display-name="MovieMatch Cloud Run"
for s in "${SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor >/dev/null
done
# Create session cookies, check/revoke sessions and delete accounts in Identity Platform.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/firebaseauth.admin >/dev/null

echo "▶ Let Cloud Build test, build and deploy (only the roles it needs)"
# Newer projects don't give the build account broad Editor rights, so grant exactly what
# cloudbuild.yaml uses: read the uploaded source, write logs, push the image, look up
# the project and secret names, and deploy to Cloud Run as the runtime account.
for role in roles/run.admin roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectViewer roles/browser roles/secretmanager.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${BUILD_SA}" --role="$role" --condition=None >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/iam.serviceAccountUser >/dev/null

echo "▶ Build, test and deploy (Cloud Build)"
gcloud builds submit --config cloudbuild.yaml --substitutions="_REGION=${REGION},_FIREBASE_API_KEY=${FIREBASE_API_KEY}" .

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo "✅ Live at: $URL"
echo "   Add this to Identity Platform → Settings → Security → Authorized domains:"
echo "     ${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
