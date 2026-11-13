# syntax=docker/dockerfile:1
# Production image for the JobFlow Next.js app.
FROM node:20-bookworm-slim AS base
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NEXT_TELEMETRY_DISABLED=1
# Prisma needs openssl; ca-certificates for outbound TLS (job provider, etc.)
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- deps: install node modules from the lockfile -------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- build: generate Prisma client and compile Next -----------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder values only so env validation passes during build. The REAL
# AUTH_SECRET and DATABASE_URL are injected at runtime by docker-compose.
ENV NODE_ENV=production \
    AUTH_SECRET=build-time-placeholder-secret-0123456789 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npx prisma generate && npm run build

# --- runner: runtime (includes Chromium for the server-side apply engine) ---
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/prisma ./prisma
# The packaged browser extension zip, served by /api/extension/download.
COPY --from=build /app/extension/jobflow-extension.zip ./extension/jobflow-extension.zip
# Install Chromium + its OS libraries for the server-side auto-apply engine.
# (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD from the base stage only affects npm install;
# this explicit install still downloads the browser into PLAYWRIGHT_BROWSERS_PATH.)
RUN npx playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/storage/uploads
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
