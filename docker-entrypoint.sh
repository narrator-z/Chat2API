#!/bin/bash

# Chat2API Docker Entrypoint Script

set -e

echo "🚀 Starting Chat2API Docker Container..."

# Set default values
: ${NODE_ENV:=production}
: ${ELECTRON_IS_DEV:=0}
: ${TZ:=Asia/Shanghai}

# Set timezone
if [ -f "/usr/share/zoneinfo/$TZ" ]; then
    echo "📍 Setting timezone to $TZ"
    ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
    echo "$TZ" > /etc/timezone
fi

# Create necessary directories
mkdir -p /app/config /app/logs

# Set permissions
chown -R chat2api:chat2api /app

# Check for existing configuration
if [ ! -f "/app/config/config.json" ]; then
    echo "📝 Creating default configuration..."
    cat > /app/config/config.json << 'EOF'
{
  "proxyPort": 58080,
  "loadBalanceStrategy": "round_robin",
  "enableApiKey": true,
  "apiKeys": [],
  "providers": [],
  "webControl": {
    "enabled": true,
    "password": null
  }
}
EOF
fi

# Start the application
echo "🎯 Starting Chat2API..."
exec "$@"
