#!/bin/bash

# Chat2API Final D-Bus Bypass Solution
# This script completely bypasses D-Bus and uses the working app structure

echo "=== Chat2API 最终 D-Bus 绕过方案 ==="
echo

# Stop everything
echo "1. 停止所有服务:"
sudo systemctl stop chat2api.service 2>/dev/null || true
sudo pkill -f chat2api 2>/dev/null || true
sudo pkill -f Xvfb 2>/dev/null || true
sleep 2
echo

# Start Xvfb with minimal environment
echo "2. 启动最小化虚拟显示:"
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 -ac &
XVFB_PID=$!
sleep 3
echo "Xvfb PID: $XVFB_PID"
echo

# Create completely isolated environment
echo "3. 创建隔离环境:"
cd /opt/Chat2API

# Disable all D-Bus and system integration
export DISPLAY=:99
export ELECTRON_DISABLE_GPU=1
export ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1
export ELECTRON_RUN_AS_NODE=0
export DBUS_SESSION_BUS_ADDRESS=
export DBUS_SYSTEM_BUS_ADDRESS=
export XDG_SESSION_TYPE=none
export XDG_RUNTIME_DIR=/tmp/runtime-admin
export NO_AT_BRIDGE=1
export GTK_THEME=Adwaita:dark
export ELECTRON_IS_DEV=0
export NODE_ENV=production
export HOME=/home/admin

# Create runtime directory
sudo -u admin mkdir -p /tmp/runtime-admin
echo "✅ 隔离环境已创建"
echo

# Test with completely disabled D-Bus
echo "4. 测试完全禁用 D-Bus 启动:"

# Method 1: Try with electron command
echo "方法1: electron 命令（完全禁用 D-Bus）:"
timeout 20 sudo -u admin \
  DISPLAY=:99 \
  ELECTRON_DISABLE_GPU=1 \
  DBUS_SESSION_BUS_ADDRESS= \
  DBUS_SYSTEM_BUS_ADDRESS= \
  XDG_SESSION_TYPE=none \
  electron . &
PID1=$!
sleep 10

# Check port
if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 方法1成功！端口 58080 正在监听"
    echo "✅ 请访问: http://192.168.31.145:58080/"
    sudo kill $PID1 2>/dev/null
    SUCCESS=true
    WORKING_CMD="electron ."
else
    echo "❌ 方法1失败"
    sudo kill $PID1 2>/dev/null
    
    # Method 2: Try with direct binary
    echo "方法2: 直接二进制启动:"
    timeout 20 sudo -u admin \
      DISPLAY=:99 \
      ELECTRON_DISABLE_GPU=1 \
      DBUS_SESSION_BUS_ADDRESS= \
      DBUS_SYSTEM_BUS_ADDRESS= \
      XDG_SESSION_TYPE=none \
      /opt/Chat2API/chat2api &
    PID2=$!
    sleep 10
    
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 方法2成功！端口 58080 正在监听"
        echo "✅ 请访问: http://192.168.31.145:58080/"
        sudo kill $PID2 2>/dev/null
        SUCCESS=true
        WORKING_CMD="/opt/Chat2API/chat2api"
    else
        echo "❌ 方法2失败"
        sudo kill $PID2 2>/dev/null
        SUCCESS=false
    fi
fi
echo

# Create working service if successful
if [ "$SUCCESS" = true ]; then
    echo "5. 创建工作的 systemd 服务:"
    
    sudo tee /etc/systemd/system/chat2api.service > /dev/null << EOF
[Unit]
Description=Chat2API Service
After=network.target

[Service]
Type=simple
User=admin
Group=Users
WorkingDirectory=/opt/Chat2API
# Completely disable D-Bus and system integration
Environment=DISPLAY=:99
Environment=ELECTRON_DISABLE_GPU=1
Environment=ELECTRON_DISABLE_SOFTWARE_RASTERIZER=1
Environment=DBUS_SESSION_BUS_ADDRESS=
Environment=DBUS_SYSTEM_BUS_ADDRESS=
Environment=XDG_SESSION_TYPE=none
Environment=XDG_RUNTIME_DIR=/tmp/runtime-admin
Environment=NO_AT_BRIDGE=1
Environment=GTK_THEME=Adwaita:dark
Environment=ELECTRON_IS_DEV=0
Environment=NODE_ENV=production
Environment=HOME=/home/admin
# Use the working command
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
        echo "📋 手动启动命令:"
        echo "cd /opt/Chat2API"
        echo "DISPLAY=:99 ELECTRON_DISABLE_GPU=1 DBUS_SESSION_BUS_ADDRESS= $WORKING_CMD"
    fi
    
else
    echo "❌ 所有方法都失败"
    echo "📋 最后尝试 - 使用原始二进制文件:"
    
    # Try the original binary without any environment
    echo "尝试原始二进制:"
    timeout 10 /opt/Chat2API/chat2api &
    PID3=$!
    sleep 5
    
    if sudo netstat -tlnp | grep -q ":58080 "; then
        echo "🎉 原始二进制成功！"
        sudo kill $PID3 2>/dev/null
        echo "✅ 请访问: http://192.168.31.145:58080/"
    else
        echo "❌ 原始二进制也失败"
        sudo kill $PID3 2>/dev/null
        
        echo "📋 应用可能需要重新编译或检查系统兼容性"
        echo "当前系统: $(uname -a)"
        echo "Node.js: $(node --version)"
        echo "Electron: $(electron --version)"
    fi
fi

echo
echo "=== D-Bus 绕过方案完成 ==="
