#!/bin/bash

# Chat2API Native Electron Solution
# This script uses the built-in Electron from the app itself

echo "=== Chat2API 原生 Electron 解决方案 ==="
echo

# Stop everything
echo "1. 停止所有服务:"
sudo systemctl stop chat2api.service 2>/dev/null || true
sudo pkill -f chat2api 2>/dev/null || true
sudo pkill -f Xvfb 2>/dev/null || true
sleep 2
echo

# Check what Electron version the app uses
echo "2. 检查应用内置的 Electron:"
if [ -f "/opt/Chat2API/version" ]; then
    echo "应用版本文件:"
    cat /opt/Chat2API/version
fi

# Look for Electron in the app
echo "检查应用中的 Electron:"
find /opt/Chat2API -name "*electron*" -o -name "*chrome*" | head -10
echo

# Try to use the app's built-in Electron directly
echo "3. 尝试使用内置 Electron:"

# Start Xvfb
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 -ac &
XVFB_PID=$!
sleep 3
echo "Xvfb PID: $XVFB_PID"
echo

# Method 1: Try to run with minimal environment using the built-in electron
echo "方法1: 使用应用内置的 Electron（最小环境）:"
cd /opt/Chat2API

# Set minimal environment to avoid D-Bus
export DISPLAY=:99
export ELECTRON_DISABLE_GPU=1
export ELECTRON_RUN_AS_NODE=0
export NODE_ENV=production
export HOME=/home/admin

# Try running the binary directly (it should have its own Electron)
timeout 15 sudo -u admin \
  DISPLAY=:99 \
  ELECTRON_DISABLE_GPU=1 \
  ./chat2api &
PID1=$!
sleep 8

# Check if port is listening
if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 方法1成功！端口 58080 正在监听"
    echo "✅ 请访问: http://192.168.31.145:58080/"
    sudo kill $PID1 2>/dev/null
    SUCCESS=true
    WORKING_CMD="./chat2api"
else
    echo "❌ 方法1失败"
    sudo kill $PID1 2>/dev/null
    SUCCESS=false
fi
echo

# Method 2: Try with different display settings
if [ "$SUCCESS" = false ]; then
    echo "方法2: 尝试不同的显示设置:"
    
    # Try with a different display resolution
    pkill -f Xvfb
    Xvfb :99 -screen 0 800x600x16 &
    XVFB_PID=$!
    sleep 3
    
    timeout 15 sudo -u admin \
      DISPLAY=:99 \
      ELECTRON_DISABLE_GPU=1 \
      ./chat2api &
    PID2=$!
    sleep 8
    
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 方法2成功！端口 58080 正在监听"
        echo "✅ 请访问: http://192.168.31.145:58080/"
        sudo kill $PID2 2>/dev/null
        SUCCESS=true
        WORKING_CMD="./chat2api"
    else
        echo "❌ 方法2失败"
        sudo kill $PID2 2>/dev/null
    fi
    echo
fi

# Method 3: Try to extract and use the internal Electron
if [ "$SUCCESS" = false ]; then
    echo "方法3: 尝试提取内部 Electron:"
    
    # Look for the actual electron binary in the app
    ELECTRON_BINARY=$(find /opt/Chat2API -name "electron" -type f | head -1)
    if [ -n "$ELECTRON_BINARY" ]; then
        echo "找到 Electron: $ELECTRON_BINARY"
        
        # Try using the internal electron with the app path
        timeout 15 sudo -u admin \
          DISPLAY=:99 \
          ELECTRON_DISABLE_GPU=1 \
          "$ELECTRON_BINARY" . &
        PID3=$!
        sleep 8
        
        if sudo netstat -tlnp | grep -q ":58080 "; then
            echo "🎉 方法3成功！端口 58080 正在监听"
            echo "✅ 请访问: http://192.168.31.145:58080/"
            sudo kill $PID3 2>/dev/null
            SUCCESS=true
            WORKING_CMD="$ELECTRON_BINARY ."
        else
            echo "❌ 方法3失败"
            sudo kill $PID3 2>/dev/null
        fi
    else
        echo "❌ 未找到内部 Electron"
    fi
    echo
fi

# Create working service if successful
if [ "$SUCCESS" = true ]; then
    echo "4. 创建工作的 systemd 服务:"
    
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
Environment=ELECTRON_RUN_AS_NODE=0
Environment=NODE_ENV=production
Environment=HOME=/home/admin
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
    
    sleep 8
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 systemd 服务运行成功！"
        echo "✅ 服务状态:"
        sudo systemctl status chat2api.service --no-pager -l
        echo "✅ 请访问: http://192.168.31.145:58080/"
        
        # Test external access
        echo "🌐 测试外部访问:"
        if curl -s --connect-timeout 3 http://192.168.31.145:58080/ >/dev/null; then
            echo "✅ 外部访问成功！"
        else
            echo "⚠️ 外部访问失败，但服务正在运行"
        fi
        
    else
        echo "❌ systemd 服务启动失败"
    fi
    
else
    echo "❌ 所有方法都失败"
    echo "📋 诊断信息:"
    
    echo "检查应用文件:"
    ls -la /opt/Chat2API/ | grep -E "(chat2api|electron|chrome)"
    
    echo "检查进程状态:"
    ps aux | grep -E "(chat2api|electron)" | grep -v grep || echo "没有相关进程"
    
    echo "检查端口:"
    sudo netstat -tlnp | grep -E "(58080|electron)" || echo "没有监听端口"
    
    echo "📋 可能的解决方案:"
    echo "1. 检查系统是否缺少必要的库"
    echo "2. 尝试在不同的 Linux 发行版上运行"
    echo "3. 联系开发者获取服务器版本的应用"
    
    echo "📋 手动测试命令:"
    echo "cd /opt/Chat2API"
    echo "DISPLAY=:99 ELECTRON_DISABLE_GPU=1 ./chat2api"
fi

echo
echo "=== 原生 Electron 解决方案完成 ==="
