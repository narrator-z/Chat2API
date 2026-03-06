#!/bin/bash

# Chat2API Server-Only Fix Script
# This script completely disables GUI and runs Chat2API as a pure server

echo "=== Chat2API 纯服务器模式修复 ==="
echo

# Create minimal server-only configuration
CONFIG_DIR="/home/admin/.config/chat2api"
mkdir -p "$CONFIG_DIR"

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
    "closeToTray": false,
    "startMinimized": true
  },
  "logging": {
    "level": "info",
    "file": true,
    "console": true
  }
}
EOF

echo "✅ 服务器配置已创建"

# Create server-only systemd service
sudo tee /etc/systemd/system/chat2api.service > /dev/null << 'EOF'
[Unit]
Description=Chat2API Server Service
After=network.target

[Service]
Type=simple
User=admin
Group=Users
WorkingDirectory=/opt/Chat2API
Environment=NODE_ENV=production
Environment=HOME=/home/admin
# Completely disable GUI and GPU
Environment=DISPLAY=
Environment=ELECTRON_DISABLE_GPU=1
Environment=ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1
Environment=ELECTRON_RUN_AS_NODE=1
Environment=DBUS_SESSION_BUS_ADDRESS=
Environment=WAYLAND_DISPLAY=
Environment=XDG_SESSION_TYPE=
Environment=GTK_THEME=
# Force server mode
Environment=CHAT2API_SERVER_ONLY=1
Environment=CHAT2API_NO_GUI=1
# Direct execution without launcher
ExecStart=/opt/Chat2API/chat2api --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage --disable-setuid-sandbox --no-zygote --single-process
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✅ 纯服务器模式服务已创建"

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart chat2api.service

echo "✅ 服务已重启（纯服务器模式）"
echo

# Wait for startup
echo "等待服务启动..."
sleep 8

# Check port
if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 端口 58080 正在监听！"
    echo "✅ 请访问: http://192.168.31.145:58080/"
    echo
    echo "📊 服务状态:"
    sudo systemctl status chat2api.service --no-pager -l
else
    echo "⚠️ 端口仍未监听，尝试直接启动..."
    
    # Try direct execution
    echo "尝试直接启动 Chat2API..."
    cd /opt/Chat2API
    sudo -u admin DISPLAY= ELECTRON_DISABLE_GPU=1 ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1 DBUS_SESSION_BUS_ADDRESS= /opt/Chat2API/chat2api --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage --disable-setuid-sandbox --no-zygote --single-process &
    CHAT2API_PID=$!
    
    echo "Chat2API PID: $CHAT2API_PID"
    sleep 5
    
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 直接启动成功！端口 58080 正在监听"
        echo "✅ 请访问: http://192.168.31.145:58080/"
    else
        echo "❌ 直接启动也失败，检查进程:"
        ps aux | grep chat2api | grep -v grep
        echo
        echo "📋 检查最新日志:"
        sudo journalctl -u chat2api.service --no-pager -n 30
    fi
fi

echo
echo "=== 修复完成 ==="
