# Multi-stage Dockerfile optimized for Koyeb & Container Deployments
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependency manifests
COPY package*.json bun.lock* ./

# Install dependencies (including devDependencies required for Vite build)
RUN npm install --legacy-peer-deps

# Copy application source code
COPY . .

# Build Vite frontend production bundle into /app/dist
RUN npm run build

# Production runner stage
FROM node:22-alpine AS runner
WORKDIR /app

# Install ffmpeg for native multi-frame grid thumbnail generation
RUN apk add --no-cache ffmpeg

ENV NODE_ENV=production
ENV PORT=3000

# Install production Node dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy compiled frontend distribution
COPY --from=builder /app/dist ./dist

# Copy public static directory and server runtime files
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/vite.config.ts ./vite.config.ts

# Default port (dynamically overridden by Koyeb via PORT env variable)
EXPOSE 3000

# Start server
CMD ["./node_modules/.bin/tsx", "server.ts"]
