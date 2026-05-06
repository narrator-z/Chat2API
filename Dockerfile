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

# Build frontend (renderer only) - create dummy files to satisfy electron-vite
RUN mkdir -p src/preload && echo "export {}" > src/preload/index.ts
RUN if [ ! -f src/main/index.ts ]; then echo "export {}" > src/main/index.ts; fi
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

# Stage 3: Final runtime image
FROM node:20-alpine

WORKDIR /app

# Use npm registry mirror for faster builds in China
RUN npm config set registry https://registry.npmmirror.com

# Install runtime dependencies only
COPY package.json package-lock.json* ./
RUN npm install --production --ignore-scripts

# Install tsx for running TypeScript files
RUN npm install -g tsx

# Copy built frontend
COPY --from=frontend-builder /app/out/renderer ./out/renderer

# Copy backend source files
COPY src/main ./src/main
COPY src/shared ./src/shared

# Copy WASM files for SHA3 challenge calculation
COPY sha3_wasm_bg.7b9ca65ddd.wasm ./

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
CMD ["tsx", "src/main/web-server.ts"]
