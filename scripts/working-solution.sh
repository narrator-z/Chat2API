#!/bin/bash

# Chat2API Working Solution
# This script creates a proper Electron environment for Chat2API

echo "=== Chat2API 工作解决方案 ==="
echo

# Stop existing services
echo "1. 停止现有服务:"
sudo systemctl stop chat2api.service 2>/dev/null || true
sudo pkill -f chat2api 2>/dev/null || true
sudo pkill -f Xvfb 2>/dev/null || true
sleep 2
echo

# Install missing dependencies
echo "2. 安装 Electron 依赖:"
cd /opt/Chat2API
if [ ! -d "node_modules" ]; then
    echo "安装 Node.js 依赖..."
    npm install --production
else
    echo "Node.js 依赖已存在"
fi
echo

# Start proper Xvfb
echo "3. 启动虚拟显示:"
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 3
echo "Xvfb PID: $XVFB_PID"
echo

# Create proper systemd service
echo "4. 创建正确的 systemd 服务:"
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
# Disable GPU but keep basic functionality
Environment=ELECTRON_DISABLE_GPU=1
Environment=LIBGL_ALWAYS_SOFTWARE=1
Environment=MOZ_DISABLE_WEBGL=1
# Use the original launcher which handles everything properly
ExecStart=/usr/local/bin/chat2api-launcher
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✅ systemd 服务已创建"
echo

# Test with launcher script
echo "5. 测试启动器脚本:"
timeout 20 sudo -u admin /usr/local/bin/chat2api-launcher &
LAUNCHER_PID=$!

echo "启动器 PID: $LAUNCHER_PID"
sleep 10

# Check if port is listening
if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 成功！端口 58080 正在监听"
    echo "✅ 请访问: http://192.168.31.145:58080/"
    
    # Kill test process and start service
    sudo kill $LAUNCHER_PID 2>/dev/null
    sleep 2
    sudo systemctl daemon-reload
    sudo systemctl start chat2api.service
    echo "✅ 已切换到 systemd 服务"
    
    # Final verification
    sleep 5
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 systemd 服务运行正常！"
        echo "✅ 服务状态:"
        sudo systemctl status chat2api.service --no-pager -l
    else
        echo "⚠️ systemd 服务端口未监听"
    fi
    
else
    echo "❌ 启动器脚本仍然失败"
    sudo kill $LAUNCHER_PID 2>/dev/null
    
    echo "📋 检查详细日志:"
    sudo journalctl -u chat2api.service --no-pager -n 30
    
    echo "📋 尝试手动运行以获取更多信息:"
    echo "手动运行命令:"
    echo "cd /opt/Chat2API && sudo -u admin DISPLAY=:99 ELECTRON_DISABLE_GPU=1 /usr/local/bin/chat2api-launcher"
fi

echo
echo "=== 解决方案完成 ==="
