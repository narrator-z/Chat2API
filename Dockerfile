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
    chromium

# Set working directory
WORKDIR /app

# Copy all files
COPY . .

# Install all dependencies (including dev dependencies) - skip postinstall
RUN npm install --include=dev --ignore-scripts

# Build application - use npx to find electron-vite
RUN npx electron-vite build

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create data directories
RUN mkdir -p /app/config /app/logs

# Create app user
RUN adduser -D -u 1000 chat2api && \
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
