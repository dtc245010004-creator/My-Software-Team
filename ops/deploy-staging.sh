#!/usr/bin/env bash
set -euo pipefail

deploy_dir="${1:?Usage: deploy-staging.sh DEPLOY_DIR IMAGE_BASE IMAGE_TAG}"
image_base="${2:?Missing image base}"
new_tag="${3:?Missing image tag}"
cd "$deploy_dir"

if [[ ! -f .env ]]; then
  echo "Missing staging .env in $deploy_dir" >&2
  exit 1
fi

old_tag="$(cat .csms-image-tag 2>/dev/null || true)"
export CSMS_BACKEND_IMAGE="$image_base/backend"
export CSMS_FRONTEND_IMAGE="$image_base/frontend"
export CSMS_IMAGE_TAG="$new_tag"

docker compose pull backend frontend
docker compose up -d --remove-orphans

healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:${API_PORT:-8000}/api/v1/health >/dev/null 2>&1 \
    && curl --fail --silent http://127.0.0.1:${FRONTEND_PORT:-5173}/healthz >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" == true ]]; then
  printf '%s\n' "$new_tag" > .csms-image-tag
  echo "Staging is healthy on image tag $new_tag"
  exit 0
fi

echo "New staging deployment failed health checks; attempting rollback." >&2
if [[ -n "$old_tag" ]]; then
  export CSMS_IMAGE_TAG="$old_tag"
  docker compose up -d --remove-orphans || true
  for attempt in $(seq 1 30); do
    if curl --fail --silent http://127.0.0.1:${API_PORT:-8000}/api/v1/health >/dev/null 2>&1 \
      && curl --fail --silent http://127.0.0.1:${FRONTEND_PORT:-5173}/healthz >/dev/null 2>&1; then
      echo "Previous staging version ($old_tag) is healthy again." >&2
      exit 1
    fi
    sleep 2
  done
fi

echo "Rollback could not be confirmed; inspect the staging host." >&2
exit 1
