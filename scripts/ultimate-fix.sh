#!/bin/bash

# Chat2API Ultimate Fix Script
# This script addresses the root cause: sandbox and D-Bus issues

echo "=== Chat2API 终极修复 ==="
echo

# Stop all services first
echo "1. 停止所有服务:"
sudo systemctl stop chat2api.service 2>/dev/null || true
sudo pkill -f chat2api 2>/dev/null || true
sudo pkill -f Xvfb 2>/dev/null || true
sleep 2
echo

# Start D-Bus session for admin user
echo "2. 启动 D-Bus 会话:"
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ]; then
    export $(dbus-launch)
    echo "D-Bus 会话已启动: $DBUS_SESSION_BUS_ADDRESS"
fi
echo

# Start Xvfb with proper environment
echo "3. 启动虚拟显示:"
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 3
echo "Xvfb PID: $XVFB_PID"
echo

# Create proper config
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
    "closeToTray": false
  }
}
EOF

echo "✅ 配置文件已创建"
echo

# Test with --no-sandbox flag
echo "4. 测试带 --no-sandbox 参数启动:"
cd /opt/Chat2API

# Set up complete environment
export ELECTRON_DISABLE_GPU=1
export LIBGL_ALWAYS_SOFTWARE=1
export MOZ_DISABLE_WEBGL=1
export DBUS_SESSION_BUS_ADDRESS
export DISPLAY=:99
export HOME=/home/admin

# Try with --no-sandbox
echo "尝试启动 Chat2API..."
timeout 15 sudo -u admin \
  DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
  DISPLAY=:99 \
  ELECTRON_DISABLE_GPU=1 \
  /opt/Chat2API/chat2api --no-sandbox &
CHAT2API_PID=$!

echo "Chat2API PID: $CHAT2API_PID"
sleep 8

# Check if port is listening
if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 成功！端口 58080 正在监听"
    echo "✅ 请访问: http://192.168.31.145:58080/"
    
    # Create working systemd service
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
Environment=ELECTRON_DISABLE_GPU=1
Environment=LIBGL_ALWAYS_SOFTWARE=1
Environment=MOZ_DISABLE_WEBGL=1
# Start D-Bus session automatically
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=%t/bus
ExecStartPre=/bin/bash -c 'export $(dbus-launch); export DBUS_SESSION_BUS_ADDRESS'
ExecStart=/opt/Chat2API/chat2api --no-sandbox
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    echo "✅ systemd 服务已更新"
    sudo systemctl daemon-reload
    
    # Kill test process and start service
    sudo kill $CHAT2API_PID 2>/dev/null
    sleep 2
    sudo systemctl start chat2api.service
    echo "✅ 已切换到 systemd 服务"
    
else
    echo "❌ --no-sandbox 仍然失败"
    sudo kill $CHAT2API_PID 2>/dev/null
    
    echo "📋 尝试查看应用内部信息:"
    # Try to extract app info
    if command -v asar &> /dev/null; then
        echo "尝试提取应用信息..."
        asar list /opt/Chat2API/resources/app.asar | head -10
    else
        echo "安装 asar 来查看应用内容:"
        sudo apt-get install -y asar
        asar list /opt/Chat2API/resources/app.asar | head -10
    fi
    
    echo "📋 检查是否有其他启动方式:"
    ls -la /opt/Chat2API/ | grep -E "\.(sh|py|js)$"
    
    echo "📋 检查应用包内容:"
    if command -v asar &> /dev/null; then
        asar extract /opt/Chat2API/resources/app.asar /tmp/app_extracted
        ls -la /tmp/app_extracted/
        find /tmp/app_extracted -name "*.json" -o -name "*.js" | head -5
    fi
fi

echo
echo "=== 修复完成 ==="
