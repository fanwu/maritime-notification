# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/mock-producer/package.json packages/mock-producer/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/mock-producer packages/mock-producer

# Production stage
FROM node:20-alpine AS runner

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/mock-producer packages/mock-producer
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/mock-producer/node_modules packages/mock-producer/node_modules

WORKDIR /app/packages/mock-producer

# Set environment variables
ENV NODE_ENV=production
ENV KAFKA_BROKERS=kafka:9092

# Start the producer
CMD ["pnpm", "start"]
