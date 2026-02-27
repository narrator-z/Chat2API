# Chat2API Docker Image
FROM node:18-bullseye-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
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
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY out/ ./out/
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create app user
RUN useradd -m -u 1000 chat2api && \
    mkdir -p /app/config /app/logs && \
    chown -R chat2api:chat2api /app

# Switch to app user
USER chat2api

# Expose ports
EXPOSE 58080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:58080/health || exit 1

# Set entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]

# Start the application
CMD ["sh", "-c", "cd /app && export ELECTRON_IS_DEV=0 && export NODE_ENV=production && xvfb-run --auto-servernum --server-args='-screen 0 1024x768x24' node_modules/.bin/electron ."]
