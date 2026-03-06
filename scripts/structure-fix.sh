#!/bin/bash

# Chat2API Structure Fix Solution
# This script fixes the missing main file and permissions

echo "=== Chat2API 结构修复方案 ==="
echo

# Stop everything
echo "1. 停止所有服务:"
sudo systemctl stop chat2api.service 2>/dev/null || true
sudo pkill -f chat2api 2>/dev/null || true
sudo pkill -f Xvfb 2>/dev/null || true
sleep 2
echo

# Fix permissions
echo "2. 修复权限:"
sudo chown -R admin:Users /opt/Chat2API
sudo chmod +x /opt/Chat2API/chat2api
echo "✅ 权限已修复"
echo

# Copy the extracted app structure
echo "3. 复制应用结构:"
if [ -d "/tmp/chat2api_extract/out" ]; then
    sudo -u admin cp -r /tmp/chat2api_extract/out /opt/Chat2API/
    echo "✅ out 目录已复制"
else
    echo "❌ 提取的 out 目录不存在"
    exit 1
fi

if [ -d "/tmp/chat2api_extract/node_modules" ]; then
    sudo -u admin cp -r /tmp/chat2api_extract/node_modules/* /opt/Chat2API/node_modules/
    echo "✅ node_modules 已补充"
fi
echo

# Verify structure
echo "4. 验证应用结构:"
echo "检查主文件:"
if [ -f "/opt/Chat2API/out/main/index.js" ]; then
    echo "✅ 主文件存在: /opt/Chat2API/out/main/index.js"
else
    echo "❌ 主文件仍然缺失"
fi

echo "检查 package.json main 字段:"
MAIN_FIELD=$(cat /opt/Chat2API/package.json | grep '"main"' | cut -d'"' -f4)
echo "main 字段: $MAIN_FIELD"
echo

# Install dependencies properly
echo "5. 重新安装依赖:"
cd /opt/Chat2API
sudo -u admin npm install --production --no-package-lock
echo "✅ 依赖已重新安装"
echo

# Start Xvfb
echo "6. 启动虚拟显示:"
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 3
echo "Xvfb PID: $XVFB_PID"
echo

# Test with electron command
echo "7. 测试 Electron 启动:"
cd /opt/Chat2API

# Set environment
export ELECTRON_DISABLE_GPU=1
export LIBGL_ALWAYS_SOFTWARE=1
export MOZ_DISABLE_WEBGL=1
export ELECTRON_IS_DEV=0
export NODE_ENV=production
export HOME=/home/admin

# Try electron command
echo "尝试 electron 命令启动:"
timeout 15 sudo -u admin \
  DISPLAY=:99 \
  ELECTRON_DISABLE_GPU=1 \
  electron . &
PID=$!
sleep 8

# Check port
if sudo netstat -tlnp | grep -q ":58080 "; then
    echo "🎉 成功！端口 58080 正在监听"
    echo "✅ 请访问: http://192.168.31.145:58080/"
    
    # Kill test and create service
    sudo kill $PID 2>/dev/null
    sleep 2
    
    echo "8. 创建 systemd 服务:"
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
Environment=LIBGL_ALWAYS_SOFTWARE=1
Environment=MOZ_DISABLE_WEBGL=1
Environment=ELECTRON_IS_DEV=0
Environment=NODE_ENV=production
Environment=HOME=/home/admin
Environment=XAUTHORITY=/home/admin/.Xauthority
ExecStart=electron .
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
    fi
    
else
    echo "❌ Electron 启动失败"
    sudo kill $PID 2>/dev/null
    
    echo "📋 调试信息:"
    echo "检查应用结构:"
    ls -la /opt/Chat2API/out/main/
    echo
    echo "检查 Electron 版本:"
    sudo -u admin DISPLAY=:99 electron --version 2>/dev/null || echo "Electron 版本检查失败"
    echo
    echo "手动调试命令:"
    echo "cd /opt/Chat2API"
    echo "DISPLAY=:99 ELECTRON_DISABLE_GPU=1 electron ."
fi

echo
echo "=== 结构修复完成 ==="
