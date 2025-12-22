# Build stage
FROM node:20-alpine AS builder

# Install pnpm and openssl for Prisma
RUN npm install -g pnpm && apk add --no-cache openssl

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY apps/web apps/web

# Build-time args for NEXT_PUBLIC_* variables (these get inlined during build)
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_APP_URL=""
ARG NEXT_PUBLIC_WS_URL=""
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# Note: Don't copy .env file - server-side env vars (REDIS_HOST, etc.)
# are provided by ECS at runtime

# Generate Prisma client
WORKDIR /app/apps/web
RUN npx prisma generate

# Build Next.js
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

# Install pnpm and openssl for Prisma
RUN npm install -g pnpm && apk add --no-cache openssl

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/web/package.json apps/web/
COPY --from=builder /app/apps/web/.next apps/web/.next
COPY --from=builder /app/apps/web/server.ts apps/web/
COPY --from=builder /app/apps/web/prisma apps/web/prisma
COPY --from=builder /app/apps/web/src apps/web/src
COPY --from=builder /app/apps/web/next.config.js apps/web/
COPY --from=builder /app/apps/web/tsconfig.json apps/web/
COPY --from=builder /app/apps/web/tailwind.config.js apps/web/
COPY --from=builder /app/apps/web/postcss.config.js apps/web/
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/web/node_modules apps/web/node_modules

# Create data directory for SQLite
RUN mkdir -p /app/data

WORKDIR /app/apps/web

# Set environment variables
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/dev.db

EXPOSE 3000

# Start the server
CMD ["pnpm", "start"]
