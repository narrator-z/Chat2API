#!/bin/bash

# Chat2API Final Working Solution
# This script installs Electron and uses proper virtual display

echo "=== Chat2API 最终工作方案 ==="
echo

# Stop everything
echo "1. 停止所有服务:"
sudo systemctl stop chat2api.service 2>/dev/null || true
sudo pkill -f chat2api 2>/dev/null || true
sudo pkill -f Xvfb 2>/dev/null || true
sleep 2
echo

# Install Electron globally
echo "2. 安装 Electron:"
sudo npm install -g electron
echo "✅ Electron 已安装"
echo

# Install app dependencies
echo "3. 安装应用依赖:"
cd /opt/Chat2API
sudo -u admin npm install --production
echo "✅ 应用依赖已安装"
echo

# Start Xvfb properly
echo "4. 启动虚拟显示:"
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 3
echo "Xvfb PID: $XVFB_PID"

# Verify Xvfb is working
echo "验证虚拟显示:"
timeout 3 xdpyinfo -display :99 >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ 虚拟显示正常工作"
else
    echo "❌ 虚拟显示未正常工作"
    # Try different Xvfb command
    pkill -f Xvfb
    Xvfb :99 -screen 0 1024x768x16 &
    XVFB_PID=$!
    sleep 3
    echo "尝试 16 位色深度"
fi
echo

# Test with proper environment
echo "5. 测试正确环境启动:"
cd /opt/Chat2API

# Set complete environment
export ELECTRON_DISABLE_GPU=1
export LIBGL_ALWAYS_SOFTWARE=1
export MOZ_DISABLE_WEBGL=1
export ELECTRON_IS_DEV=0
export NODE_ENV=production
export HOME=/home/admin
export XAUTHORITY=/home/admin/.Xauthority

# Try running with electron command
echo "方法1: 使用 electron 命令:"
timeout 15 sudo -u admin \
  DISPLAY=:99 \
  ELECTRON_DISABLE_GPU=1 \
  electron . &
PID1=$!
sleep 8

if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 方法1成功！端口 58080 正在监听"
    echo "✅ 请访问: http://192.168.31.145:58080/"
    sudo kill $PID1 2>/dev/null
    SUCCESS=true
    WORKING_CMD="electron ."
else
    echo "❌ 方法1失败"
    sudo kill $PID1 2>/dev/null
    SUCCESS=false
fi
echo

# Method 2: Try with direct binary if method 1 failed
if [ "$SUCCESS" = false ]; then
    echo "方法2: 使用直接二进制:"
    timeout 15 sudo -u admin \
      DISPLAY=:99 \
      ELECTRON_DISABLE_GPU=1 \
      /opt/Chat2API/chat2api &
    PID2=$!
    sleep 8
    
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 方法2成功！端口 58080 正在监听"
        echo "✅ 请访问: http://192.168.31.145:58080/"
        sudo kill $PID2 2>/dev/null
        SUCCESS=true
        WORKING_CMD="/opt/Chat2API/chat2api"
    else
        echo "❌ 方法2失败"
        sudo kill $PID2 2>/dev/null
    fi
    echo
fi

# Create working systemd service if successful
if [ "$SUCCESS" = true ]; then
    echo "6. 创建工作的 systemd 服务:"
    
    sudo tee /etc/systemd/system/chat2api.service > /dev/null << EOF
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
Environment=LIBGL_ALWAYS_SOFTWARE=1
Environment=MOZ_DISABLE_WEBGL=1
Environment=ELECTRON_IS_DEV=0
Environment=NODE_ENV=production
Environment=HOME=/home/admin
Environment=XAUTHORITY=/home/admin/.Xauthority
ExecStart=$WORKING_CMD
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
    
    sleep 5
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 systemd 服务运行成功！"
        echo "✅ 服务状态:"
        sudo systemctl status chat2api.service --no-pager -l
        echo "✅ 请访问: http://192.168.31.145:58080/"
    else
        echo "❌ systemd 服务启动失败"
        echo "📋 手动启动命令:"
        echo "cd /opt/Chat2API && sudo -u admin DISPLAY=:99 ELECTRON_DISABLE_GPU=1 $WORKING_CMD"
    fi
else
    echo "❌ 所有方法都失败"
    echo "📋 调试信息:"
    echo "检查 Electron 版本:"
    electron --version
    echo
    echo "检查应用目录:"
    ls -la /opt/Chat2API/
    echo
    echo "检查 node_modules:"
    ls -la /opt/Chat2API/node_modules/electron 2>/dev/null || echo "electron 模块未找到"
    echo
    echo "尝试手动调试:"
    echo "cd /opt/Chat2API"
    echo "DISPLAY=:99 ELECTRON_DISABLE_GPU=1 electron ."
fi

echo
echo "=== 最终工作方案完成 ==="
