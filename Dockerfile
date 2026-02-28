# Chat2API Docker Image
FROM node:22-bullseye-slim

# Build arguments
ARG NODE_ENV=production

# Install system dependencies with retry and mirror
RUN apt-get update || apt-get update && \
    apt-get install -y --no-install-recommends \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libasound2 \
    wget \
    curl \
    xvfb \
    gosu \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install build tools globally FIRST (before npm install)
RUN npm install -g electron-builder electron-vite

# Copy source code
COPY . .

# Install electron first (needed by electron-builder)
RUN npm install electron --save-dev

# Install all other dependencies (skip postinstall for now)
RUN npm install --ignore-scripts

# Run postinstall manually after electron is installed
RUN npm run postinstall || true

# Build application
RUN npm run build

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create data directories
RUN mkdir -p /app/config /app/logs

# Create app user
RUN useradd -m -u 1000 chat2api && \
    chown -R chat2api:chat2api /app

# Switch to app user
USER chat2api

# Set environment
ENV NODE_ENV=${NODE_ENV}
ENV ELECTRON_IS_DEV=0

# Expose port
EXPOSE 58080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:58080/health || exit 1

# Set entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]

# Start application
CMD ["sh", "-c", "cd /app && export ELECTRON_IS_DEV=0 && export NODE_ENV=production && xvfb-run --auto-servernum --server-args='-screen 0 1024x768x24' node_modules/.bin/electron ."]
