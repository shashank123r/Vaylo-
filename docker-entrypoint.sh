#!/bin/sh
# Apply pending DB migrations, then start the app. Fails fast if migrations fail.
set -e
echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
npx prisma migrate deploy
echo "[entrypoint] Starting: $*"
exec "$@"
