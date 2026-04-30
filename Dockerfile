# Multi-stage Dockerfile for Chat2API

# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Use npm registry mirror for faster builds in China
RUN npm config set registry https://registry.npmmirror.com

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --ignore-scripts

# Copy source files
COPY src/renderer ./src/renderer
COPY src/main ./src/main
COPY src/shared ./src/shared
COPY electron.vite.config.ts ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./

# Build frontend (renderer only)
RUN npx electron-vite build --mode production

# Stage 2: Build Node.js backend
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Use npm registry mirror for faster builds in China
RUN npm config set registry https://registry.npmmirror.com

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --ignore-scripts

# Copy source files
COPY src/main ./src/main
COPY src/shared ./src/shared
COPY tsconfig.json ./
COPY tsconfig.node.json ./

# Build backend
RUN npx tsc --project tsconfig.json

# Stage 3: Final runtime image
FROM node:20-alpine

WORKDIR /app

# Use npm registry mirror for faster builds in China
RUN npm config set registry https://registry.npmmirror.com

# Install runtime dependencies only
COPY package.json package-lock.json* ./
RUN npm install --production --ignore-scripts

# Copy built backend
COPY --from=backend-builder /app/out ./out

# Copy built frontend
COPY --from=frontend-builder /app/out/renderer ./out/renderer

# Create data directory
RUN mkdir -p /app/data

# Environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV API_PORT=8088
ENV WEB_PORT=3001
ENV API_HOST=0.0.0.0
ENV WEB_HOST=0.0.0.0

# Expose ports
EXPOSE 8088 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8088/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the web server
CMD ["node", "out/main/web-server.js"]
