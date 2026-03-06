#!/bin/bash

# Chat2API Final Bypass Solution
# This script completely bypasses D-Bus and GUI issues

echo "=== Chat2API 绕过解决方案 ==="
echo

# Stop everything
echo "1. 停止所有服务:"
sudo systemctl stop chat2api.service 2>/dev/null || true
sudo pkill -f chat2api 2>/dev/null || true
sudo pkill -f Xvfb 2>/dev/null || true
sleep 2
echo

# Copy package.json from extracted app
echo "2. 复制 package.json:"
if [ -f "/tmp/chat2api_extract/package.json" ]; then
    cp /tmp/chat2api_extract/package.json /opt/Chat2API/
    echo "✅ package.json 已复制"
else
    echo "❌ 提取的 package.json 不存在"
fi
echo

# Create a completely headless environment
echo "3. 创建无头环境:"

# Create minimal D-Bus environment
sudo -u admin mkdir -p /home/admin/.cache
sudo -u admin mkdir -p /home/admin/.dbus_session

# Set environment variables to completely disable GUI
export DISPLAY=
export WAYLAND_DISPLAY=
export DBUS_SESSION_BUS_ADDRESS=
export ELECTRON_DISABLE_GPU=1
export ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1
export ELECTRON_RUN_AS_NODE=0
export XDG_SESSION_TYPE=none
export GTK_THEME=Adwaita:dark
export NO_AT_BRIDGE=1
export HOME=/home/admin
echo

# Try to run without any display
echo "4. 尝试完全无头运行:"
cd /opt/Chat2API

# Method 1: Try with minimal flags
echo "方法1: 最小化参数启动:"
timeout 10 sudo -u admin \
  DISPLAY= \
  DBUS_SESSION_BUS_ADDRESS= \
  ELECTRON_DISABLE_GPU=1 \
  /opt/Chat2API/chat2api &
PID1=$!
sleep 5

if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 方法1成功！端口 58080 正在监听"
    echo "✅ 请访问: http://192.168.31.145:58080/"
    sudo kill $PID1 2>/dev/null
    SUCCESS=true
else
    echo "❌ 方法1失败"
    sudo kill $PID1 2>/dev/null
    SUCCESS=false
fi
echo

# Method 2: Try with --no-sandbox if method 1 failed
if [ "$SUCCESS" = false ]; then
    echo "方法2: 添加 --no-sandbox 参数:"
    timeout 10 sudo -u admin \
      DISPLAY= \
      DBUS_SESSION_BUS_ADDRESS= \
      ELECTRON_DISABLE_GPU=1 \
      /opt/Chat2API/chat2api --no-sandbox &
    PID2=$!
    sleep 5
    
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 方法2成功！端口 58080 正在监听"
        echo "✅ 请访问: http://192.168.31.145:58080/"
        sudo kill $PID2 2>/dev/null
        SUCCESS=true
    else
        echo "❌ 方法2失败"
        sudo kill $PID2 2>/dev/null
    fi
    echo
fi

# Method 3: Try with extracted app if still failed
if [ "$SUCCESS" = false ]; then
    echo "方法3: 使用提取的应用:"
    cd /tmp/chat2api_extract
    timeout 10 sudo -u admin \
      DISPLAY= \
      DBUS_SESSION_BUS_ADDRESS= \
      ELECTRON_DISABLE_GPU=1 \
      node ./out/main/index.js &
    PID3=$!
    sleep 5
    
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 方法3成功！端口 58080 正在监听"
        echo "✅ 请访问: http://192.168.31.145:58080/"
        sudo kill $PID3 2>/dev/null
        SUCCESS=true
    else
        echo "❌ 方法3失败"
        sudo kill $PID3 2>/dev/null
    fi
    echo
fi

# Create working systemd service if successful
if [ "$SUCCESS" = true ]; then
    echo "5. 创建工作的 systemd 服务:"
    
    # Determine which method worked
    WORKING_METHOD="method1"
    if sudo netstat -tlnp | grep -q ":58080 "; then
        WORKING_METHOD="current"
    fi
    
    sudo tee /etc/systemd/system/chat2api.service > /dev/null << EOF
[Unit]
Description=Chat2API Service
After=network.target

[Service]
Type=simple
User=admin
Group=Users
WorkingDirectory=/opt/Chat2API
# Completely disable GUI and D-Bus
Environment=DISPLAY=
Environment=DBUS_SESSION_BUS_ADDRESS=
Environment=ELECTRON_DISABLE_GPU=1
Environment=ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1
Environment=XDG_SESSION_TYPE=none
Environment=HOME=/home/admin
# Use the working command
ExecStart=/opt/Chat2API/chat2api
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
        sudo systemctl status chat2api.service --no-pager -l
    else
        echo "❌ systemd 服务启动失败"
    fi
else
    echo "❌ 所有方法都失败"
    echo "📋 可能需要重新编译应用或检查系统环境"
    
    echo "📋 系统信息:"
    echo "操作系统: $(uname -a)"
    echo "Node.js: $(node --version 2>/dev/null || echo '未安装')"
    echo "Electron: $(electron --version 2>/dev/null || echo '未安装')"
    echo "显示: $(echo $DISPLAY)"
fi

echo
echo "=== 绕过解决方案完成 ==="
