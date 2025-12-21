# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY packages/vessel-processor/package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY packages/vessel-processor/src ./src
COPY packages/vessel-processor/tsconfig.json ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 processor

# Copy package.json and install production dependencies only
COPY packages/vessel-processor/package.json ./
RUN npm install --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER processor

# Set environment variables
ENV NODE_ENV=production

# Start the processor
CMD ["node", "dist/index.js"]
