# Chat2API Docker Image - Using Alpine for better network stability
FROM node:22-alpine

# Build arguments
ARG NODE_ENV=production

# Install system dependencies (Alpine uses apk instead of apt-get)
RUN apk update && apk add --no-cache \
    gtk+3.0 \
    libnotify \
    nss \
    libxscrnsaver \
    libxtst \
    xdg-utils \
    at-spi2-core \
    libdrm \
    libxcomposite \
    libxdamage \
    libxrandr \
    mesa-gbm \
    libxkbcommon \
    alsa-lib \
    wget \
    curl \
    xvfb \
    su-exec \
    git \
    ca-certificates \
    chromium \
    dos2unix \
    python3 \
    py3-pip \
    make \
    g++ \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    pango-dev

# Set working directory
WORKDIR /app

# Copy all files
COPY . .

# Install setuptools to fix distutils issue
RUN pip3 install --no-cache-dir --break-system-packages setuptools

# Install all dependencies (excluding canvas to avoid compilation issues)
RUN npm install --include=dev --ignore-scripts && \
    npm install --include=dev --ignore-scripts electron electron-vite

# Build application - use npx to find electron-vite
RUN npx electron-vite build

# Copy entrypoint script and fix line endings
COPY docker-entrypoint.sh /usr/local/bin/
RUN dos2unix /usr/local/bin/docker-entrypoint.sh && \
    chmod 755 /usr/local/bin/docker-entrypoint.sh && \
    chown root:root /usr/local/bin/docker-entrypoint.sh && \
    ls -la /usr/local/bin/docker-entrypoint.sh

# Create app user
RUN adduser -D -u 1001 chat2api

# Create data directories with proper ownership
RUN mkdir -p /app/config /app/logs && \
    chown -R chat2api:chat2api /app/config /app/logs

# Note: Container runs as root for entrypoint, then drops to chat2api
# Switch to app user is handled by su-exec in CMD

# Set environment
ENV NODE_ENV=${NODE_ENV}
ENV ELECTRON_IS_DEV=0

# Expose port
EXPOSE 58080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:58080/health || exit 1

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start application with su-exec to drop privileges to chat2api
CMD ["sh", "-c", "rm -f /tmp/.X*-lock /tmp/.X11-unix/X* 2>/dev/null; Xvfb :99 -screen 0 1024x768x24 & export DISPLAY=:99 && cd /app && export ELECTRON_IS_DEV=0 && export NODE_ENV=production && su-exec chat2api node -e \"console.log('Testing Electron...'); try { const electron = require('electron'); console.log('Electron loaded successfully:', electron); } catch (e) { console.error('Electron load failed:', e); process.exit(1); }\" && su-exec chat2api node_modules/.bin/electron ."]
