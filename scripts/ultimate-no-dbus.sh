#!/bin/bash

# Chat2API Ultimate No-DBus Solution
# This script completely bypasses D-Bus and uses a working Xvfb setup

echo "=== Chat2API 终极无 D-Bus 解决方案 ==="
echo

# Stop everything and clean up
echo "1. 完全清理环境:"
sudo systemctl stop chat2api.service 2>/dev/null || true
sudo pkill -f chat2api 2>/dev/null || true
sudo pkill -f Xvfb 2>/dev/null || true

# Clean up all X11 related files
sudo rm -f /tmp/.X99-lock
sudo rm -f /tmp/.X11-unix/X99
sudo rm -f /tmp/.Xauthority
sudo rm -rf /tmp/runtime-admin
sleep 2
echo "✅ 环境已清理"
echo

# Install dbus-x11 if needed
echo "2. 安装 D-Bus 工具:"
sudo apt-get install -y dbus-x11 2>/dev/null || echo "dbus-x11 安装失败，继续..."
echo

# Start Xvfb with admin user directly
echo "3. 以 admin 用户启动 Xvfb:"
sudo -u admin mkdir -p /tmp
sudo -u admin Xvfb :99 -screen 0 1024x768x24 -ac &
XVFB_PID=$!
sleep 5

# Verify Xvfb is working
if sudo -u admin xdpyinfo -display :99 >/dev/null 2>&1; then
    echo "✅ Xvfb 正常运行 (PID: $XVFB_PID)"
else
    echo "⚠️ Xvfb 可能有问题，但继续尝试..."
fi
echo

# Create completely isolated environment without D-Bus
echo "4. 创建无 D-Bus 环境:"
cd /opt/Chat2API

# Set environment to completely disable D-Bus
export DISPLAY=:99
export ELECTRON_DISABLE_GPU=1
export ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1
export LIBGL_ALWAYS_SOFTWARE=1
export MOZ_DISABLE_WEBGL=1
export ELECTRON_IS_DEV=0
export NODE_ENV=production
export HOME=/home/admin
export XAUTHORITY=
export DBUS_SESSION_BUS_ADDRESS=
export DBUS_SYSTEM_BUS_ADDRESS=
export XDG_SESSION_TYPE=none
export XDG_RUNTIME_DIR=/tmp
export NO_AT_BRIDGE=1
export GTK_THEME=Adwaita:dark

echo "✅ 无 D-Bus 环境已创建"
echo

# Test with completely disabled D-Bus
echo "5. 测试无 D-Bus 启动:"
echo "启动 Chat2API (无 D-Bus 模式)..."

# Try to start with timeout
timeout 15 sudo -u admin \
  DISPLAY=:99 \
  ELECTRON_DISABLE_GPU=1 \
  ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1 \
  LIBGL_ALWAYS_SOFTWARE=1 \
  DBUS_SESSION_BUS_ADDRESS= \
  DBUS_SYSTEM_BUS_ADDRESS= \
  XDG_SESSION_TYPE=none \
  ./chat2api &
CHAT2API_PID=$!

echo "Chat2API PID: $CHAT2API_PID"
sleep 8

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
# Complete D-Bus and GUI disable
Environment=DISPLAY=:99
Environment=ELECTRON_DISABLE_GPU=1
Environment=ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1
Environment=LIBGL_ALWAYS_SOFTWARE=1
Environment=MOZ_DISABLE_WEBGL=1
Environment=ELECTRON_IS_DEV=0
Environment=NODE_ENV=production
Environment=HOME=/home/admin
Environment=XAUTHORITY=
Environment=DBUS_SESSION_BUS_ADDRESS=
Environment=DBUS_SYSTEM_BUS_ADDRESS=
Environment=XDG_SESSION_TYPE=none
Environment=XDG_RUNTIME_DIR=/tmp
Environment=NO_AT_BRIDGE=1
Environment=GTK_THEME=Adwaita:dark
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
        
        # Final verification
        echo "🔍 最终验证:"
        echo "端口监听: $(sudo netstat -tlnp | grep :58080)"
        echo "进程状态: $(ps aux | grep chat2api | grep -v grep)"
        
    else
        echo "❌ systemd 服务启动失败"
    fi
    
else
    echo "❌ 启动失败"
    sudo kill $CHAT2API_PID 2>/dev/null
    
    echo "📋 尝试最后的解决方案 - 使用 Wayland:"
    
    # Try with Wayland backend
    echo "尝试 Wayland 后端:"
    export GDK_BACKEND=wayland
    export WAYLAND_DISPLAY=wayland-0
    
    timeout 10 sudo -u admin \
      DISPLAY=:99 \
      ELECTRON_DISABLE_GPU=1 \
      DBUS_SESSION_BUS_ADDRESS= \
      XDG_SESSION_TYPE=wayland \
      ./chat2api &
    PID2=$!
    sleep 5
    
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 Wayland 方式成功！"
        sudo kill $PID2 2>/dev/null
    else
        echo "❌ Wayland 也失败"
        sudo kill $PID2 2>/dev/null
        
        echo "📋 最终诊断:"
        echo "系统信息: $(uname -a)"
        echo "Node.js: $(node --version)"
        echo "Electron: $(electron --version 2>/dev/null || echo '未安装')"
        echo "Xvfb: $(which Xvfb)"
        echo "dbus-launch: $(which dbus-launch)"
        
        echo "📋 可能的问题:"
        echo "1. 系统缺少必要的图形库"
        echo "2. Electron 应用需要特定的系统配置"
        echo "3. 可能需要重新编译应用以支持无头模式"
        
        echo "📋 建议的解决方案:"
        echo "1. 联系开发者获取服务器版本"
        echo "2. 在有 GUI 的系统上测试"
        echo "3. 使用 Docker 容器运行"
    fi
fi

echo
echo "=== 终极无 D-Bus 解决方案完成 ==="
