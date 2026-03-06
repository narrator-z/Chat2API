#!/bin/bash

# Chat2API Final Fix Script
# This script uses the correct approach for Electron applications

echo "=== Chat2API 最终修复 ==="
echo

# First, let's check what arguments Chat2API supports
echo "1. 检查 Chat2API 支持的参数:"
/opt/Chat2API/chat2api --help 2>&1 | head -10 || echo "无法获取帮助信息"
echo

# Stop any running services
echo "2. 停止现有服务:"
sudo systemctl stop chat2api.service 2>/dev/null || echo "服务未运行"
sudo pkill -f chat2api 2>/dev/null || echo "没有运行的进程"
echo

# Check if Xvfb is running
echo "3. 检查虚拟显示:"
if ! pgrep -f "Xvfb :99" > /dev/null; then
    echo "启动 Xvfb..."
    Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
    XVFB_PID=$!
    sleep 3
    echo "Xvfb PID: $XVFB_PID"
else
    echo "Xvfb 已在运行"
fi
echo

# Create simple configuration
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
  },
  "logging": {
    "level": "info",
    "file": true,
    "console": true
  }
}
EOF

echo "✅ 配置文件已创建"
echo

# Create proper systemd service
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
# Basic GPU disable without unsupported flags
Environment=ELECTRON_DISABLE_GPU=1
Environment=LIBGL_ALWAYS_SOFTWARE=1
Environment=MOZ_DISABLE_WEBGL=1
# Use launcher script which handles Xvfb properly
ExecStart=/usr/local/bin/chat2api-launcher
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✅ systemd 服务已更新"
echo

# Test direct startup with minimal environment
echo "4. 测试直接启动:"
cd /opt/Chat2API
timeout 10 sudo -u admin \
  DISPLAY=:99 \
  ELECTRON_DISABLE_GPU=1 \
  LIBGL_ALWAYS_SOFTWARE=1 \
  /opt/Chat2API/chat2api &
CHAT2API_PID=$!

echo "Chat2API PID: $CHAT2API_PID"
sleep 5

# Check if port is listening
if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 直接启动成功！端口 58080 正在监听"
    echo "✅ 请访问: http://192.168.31.145:58080/"
    
    # Kill the test process and start service
    sudo kill $CHAT2API_PID 2>/dev/null
    sleep 2
    sudo systemctl start chat2api.service
    echo "✅ 已切换到 systemd 服务"
else
    echo "⚠️ 直接启动没有监听端口，检查进程状态:"
    ps aux | grep $CHAT2API_PID | grep -v grep || echo "进程已退出"
    
    # Kill test process
    sudo kill $CHAT2API_PID 2>/dev/null
    
    echo "📋 尝试使用启动器脚本:"
    timeout 10 sudo -u admin /usr/local/bin/chat2api-launcher &
    LAUNCHER_PID=$!
    sleep 5
    
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 启动器脚本成功！端口 58080 正在监听"
        echo "✅ 请访问: http://192.168.31.145:58080/"
        sudo kill $LAUNCHER_PID 2>/dev/null
        sudo systemctl start chat2api.service
    else
        echo "❌ 启动器脚本也失败"
        sudo kill $LAUNCHER_PID 2>/dev/null
        
        echo "📋 检查 Chat2API 日志:"
        sudo journalctl -u chat2api.service --no-pager -n 20
        
        echo "📋 检查应用是否需要特殊参数:"
        echo "尝试查看应用内部结构:"
        ls -la /opt/Chat2API/resources/app.asar 2>/dev/null && echo "应用包存在"
    fi
fi

echo
echo "=== 修复完成 ==="
