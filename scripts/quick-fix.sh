#!/bin/bash

# Chat2API Quick Fix Script
# This script creates proper configuration and fixes startup issues

echo "=== Chat2API 快速修复 ==="
echo

# Create config directory
CONFIG_DIR="/home/admin/.config/chat2api"
mkdir -p "$CONFIG_DIR"

# Create proper configuration
cat > "$CONFIG_DIR/config.json" << 'EOF'
{
  "server": {
    "host": "0.0.0.0",
    "port": 58080,
    "cors": true,
    "autoStart": true
  },
  "app": {
    "autoLaunch": false,
    "minimizeToTray": false,
    "closeToTray": false
  },
  "logging": {
    "level": "info",
    "file": true,
    "console": true
  }
}
EOF

echo "✅ 配置文件已创建: $CONFIG_DIR/config.json"

# Fix systemd service with better environment variables
sudo tee /etc/systemd/system/chat2api.service > /dev/null << 'EOF'
[Unit]
Description=Chat2API Service
After=network.target

[Service]
Type=simple
User=admin
Group=Users
WorkingDirectory=/opt/Chat2API
Environment=DISPLAY=:99
Environment=ELECTRON_IS_DEV=0
Environment=NODE_ENV=production
Environment=HOME=/home/admin
Environment=XAUTHORITY=/home/admin/.Xauthority
# Disable GPU and D-Bus to fix initialization errors
Environment=ELECTRON_DISABLE_GPU=1
Environment=ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1
Environment=DBUS_SESSION_BUS_ADDRESS=
Environment=DISABLE_WAYLAND=1
# Force server mode
Environment=CHAT2API_SERVER_MODE=1
ExecStart=/usr/local/bin/chat2api-launcher
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✅ systemd 服务已更新"

# Reload and restart service
sudo systemctl daemon-reload
sudo systemctl restart chat2api.service

echo "✅ 服务已重启"
echo

# Wait for service to start
echo "等待服务启动..."
sleep 5

# Check if port is listening
if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 端口 58080 正在监听！"
    echo "✅ 请访问: http://192.168.31.145:58080/"
else
    echo "⚠️ 端口仍未监听，检查日志:"
    sudo journalctl -u chat2api.service --no-pager -n 20
fi

echo
echo "=== 修复完成 ==="
