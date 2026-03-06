#!/bin/bash

# Chat2API Final Working Solution
# This script properly handles Xvfb and D-Bus issues

echo "=== Chat2API 最终工作解决方案 ==="
echo

# Stop everything and clean up
echo "1. 清理环境:"
sudo systemctl stop chat2api.service 2>/dev/null || true
sudo pkill -f chat2api 2>/dev/null || true
sudo pkill -f Xvfb 2>/dev/null || true

# Clean up X11 lock files
sudo rm -f /tmp/.X99-lock
sudo rm -f /tmp/.X11-unix/X99
sleep 2
echo "✅ 环境已清理"
echo

# Install missing dependencies
echo "2. 安装系统依赖:"
sudo apt-get update
sudo apt-get install -y libxss1 libgconf-2-4 libxtst6 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 libgtk-3-0 libgdk-pixbuf2.0-0 libxcomposite1 libxcursor1 libxdamage1 libxi6 libxtst6 libnss3 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 libgtk-3-0 libgdk-pixbuf2.0-0 libxcomposite1 libxcursor1 libxdamage1 libxi6
echo "✅ 依赖已安装"
echo

# Start Xvfb properly
echo "3. 正确启动 Xvfb:"
export DISPLAY=:99

# Create X11 socket directory
sudo mkdir -p /tmp/.X11-unix
sudo chmod 1777 /tmp/.X11-unix

# Start Xvfb with proper permissions
sudo -u admin Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset -auth /tmp/.Xauthority &
XVFB_PID=$!
sleep 5

# Verify Xvfb is running
if sudo -u admin xdpyinfo -display :99 >/dev/null 2>&1; then
    echo "✅ Xvfb 正常运行 (PID: $XVFB_PID)"
else
    echo "❌ Xvfb 启动失败，尝试替代方法"
    sudo kill $XVFB_PID 2>/dev/null
    
    # Try alternative Xvfb command
    Xvfb :99 -screen 0 1024x768x16 -ac &
    XVFB_PID=$!
    sleep 3
    echo "使用备用 Xvfb (PID: $XVFB_PID)"
fi
echo

# Create proper D-Bus environment
echo "4. 创建 D-Bus 环境:"
# Start a proper D-Bus session for admin user
sudo -u admin mkdir -p /home/admin/.cache
sudo -u admin dbus-launch --sh-syntax > /tmp/dbus-env.sh
source /tmp/dbus-env.sh
echo "✅ D-Bus 会话已启动: $DBUS_SESSION_BUS_ADDRESS"
echo

# Set complete environment
export ELECTRON_DISABLE_GPU=1
export ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1
export LIBGL_ALWAYS_SOFTWARE=1
export MOZ_DISABLE_WEBGL=1
export ELECTRON_IS_DEV=0
export NODE_ENV=production
export HOME=/home/admin
export XAUTHORITY=/home/admin/.Xauthority

# Test with proper environment
echo "5. 测试完整环境启动:"
cd /opt/Chat2API

echo "启动 Chat2API..."
timeout 20 sudo -u admin \
  DISPLAY=:99 \
  ELECTRON_DISABLE_GPU=1 \
  ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1 \
  LIBGL_ALWAYS_SOFTWARE=1 \
  DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
  ./chat2api &
CHAT2API_PID=$!

echo "Chat2API PID: $CHAT2API_PID"
sleep 10

# Check if port is listening
if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 成功！端口 58080 正在监听"
    echo "✅ 请访问: http://192.168.31.145:58080/"
    
    # Test external access
    if curl -s --connect-timeout 3 http://192.168.31.145:58080/ >/dev/null; then
        echo "🌐 外部访问成功！"
    else
        echo "⚠️ 外部访问测试中..."
    fi
    
    # Kill test process and create service
    sudo kill $CHAT2API_PID 2>/dev/null
    sleep 2
    
    echo "6. 创建工作的 systemd 服务:"
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
Environment=ELECTRON_DISABLE_GPU=1
Environment=ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1
Environment=LIBGL_ALWAYS_SOFTWARE=1
Environment=MOZ_DISABLE_WEBGL=1
Environment=ELECTRON_IS_DEV=0
Environment=NODE_ENV=production
Environment=HOME=/home/admin
Environment=XAUTHORITY=/home/admin/.Xauthority
ExecStartPre=/bin/bash -c 'source /tmp/dbus-env.sh'
ExecStart=./chat2api
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    echo "✅ systemd 服务已创建"
    sudo systemctl daemon-reload
    sudo systemctl start chat2api.service
    
    sleep 8
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 systemd 服务运行成功！"
        echo "✅ 服务状态:"
        sudo systemctl status chat2api.service --no-pager -l
        echo "✅ 请访问: http://192.168.31.145:58080/"
        echo "🎉 Chat2API 部署完成！"
    else
        echo "❌ systemd 服务启动失败"
    fi
    
else
    echo "❌ 启动失败"
    sudo kill $CHAT2API_PID 2>/dev/null
    
    echo "📋 调试信息:"
    echo "检查 Xvfb 状态:"
    ps aux | grep Xvfb | grep -v grep || echo "Xvfb 未运行"
    
    echo "检查 D-Bus 状态:"
    echo "DBUS_SESSION_BUS_ADDRESS: $DBUS_SESSION_BUS_ADDRESS"
    
    echo "检查应用进程:"
    ps aux | grep chat2api | grep -v grep || echo "Chat2API 进程未运行"
    
    echo "检查端口:"
    sudo netstat -tlnp | grep 58080 || echo "端口 58080 未监听"
    
    echo "📋 手动调试:"
    echo "1. 检查 Xvfb: xdpyinfo -display :99"
    echo "2. 检查 D-Bus: echo $DBUS_SESSION_BUS_ADDRESS"
    echo "3. 手动启动: cd /opt/Chat2API && DISPLAY=:99 ELECTRON_DISABLE_GPU=1 ./chat2api"
fi

echo
echo "=== 最终解决方案完成 ==="
