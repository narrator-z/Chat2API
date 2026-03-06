#!/bin/bash

# Chat2API Deep Analysis Script
# This script extracts and analyzes the application to find the correct startup method

echo "=== Chat2API 深度分析 ==="
echo

# Install required tools
echo "1. 安装分析工具:"
sudo apt-get update
sudo apt-get install -y npm nodejs unzip
npm install -g asar
echo

# Extract the application
echo "2. 提取应用包:"
mkdir -p /tmp/chat2api_extract
cd /tmp/chat2api_extract
asar extract /opt/Chat2API/resources/app.asar .
echo "✅ 应用已提取到 /tmp/chat2api_extract"
echo

# Analyze the extracted application
echo "3. 分析应用结构:"
echo "📁 目录结构:"
find . -type f | head -20
echo

echo "📄 主要文件:"
ls -la
echo

echo "📖 package.json:"
if [ -f package.json ]; then
    cat package.json
else
    echo "❌ package.json 不存在"
fi
echo

echo "📖 主入口文件:"
if [ -f package.json ]; then
    MAIN_FILE=$(cat package.json | grep '"main"' | cut -d'"' -f4)
    echo "主文件: $MAIN_FILE"
    if [ -f "$MAIN_FILE" ]; then
        echo "主文件内容 (前50行):"
        head -50 "$MAIN_FILE"
    fi
fi
echo

echo "📖 查找服务器相关代码:"
grep -r "server\|port\|http\|listen" . --include="*.js" --include="*.json" | head -10
echo

echo "📖 查找启动脚本:"
find . -name "*.js" -exec grep -l "app\.listen\|createServer\|express" {} \; 2>/dev/null | head -5
echo

# Look for alternative startup methods
echo "4. 查找其他启动方式:"
cd /opt/Chat2API
echo "📁 检查二进制文件:"
file chat2api
echo

echo "📄 检查是否有 Node.js 包装器:"
strings chat2api | grep -E "(node|electron|main|app)" | head -10
echo

echo "📄 检查应用参数:"
strings chat2api | grep -E "(^-|--)" | head -10
echo

# Try to find the real startup method
echo "5. 尝试不同的启动方法:"

# Method 1: Try as normal user without GUI
echo "方法1: 普通用户启动（无 GUI）:"
sudo -u admin \
  DISPLAY= \
  ELECTRON_DISABLE_GPU=1 \
  ELECTRON_RUN_AS_NODE=1 \
  /opt/Chat2API/chat2api --version 2>&1 | head -5 || echo "版本检查失败"
echo

# Method 2: Try with extracted app
echo "方法2: 使用提取的应用:"
if [ -f /tmp/chat2api_extract/package.json ]; then
    cd /tmp/chat2api_extract
    MAIN_FILE=$(cat package.json | grep '"main"' | cut -d'"' -f4)
    if [ -f "$MAIN_FILE" ]; then
        echo "尝试直接运行主文件:"
        sudo -u admin DISPLAY= ELECTRON_DISABLE_GPU=1 node "$MAIN_FILE" --version 2>&1 | head -5 || echo "直接运行失败"
    fi
fi
echo

# Method 3: Check if it's a standard Electron app
echo "方法3: 标准 Electron 启动:"
cd /opt/Chat2API
sudo -u admin \
  DISPLAY= \
  ELECTRON_DISABLE_GPU=1 \
  /opt/Chat2API/chat2api --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --version 2>&1 | head -5 || echo "Electron 启动失败"
echo

# Create a minimal server-only startup script
echo "6. 创建最小化启动脚本:"
cat > /tmp/chat2api-minimal.sh << 'EOF'
#!/bin/bash
# Minimal Chat2API startup script

cd /opt/Chat2API

export DISPLAY=
export ELECTRON_DISABLE_GPU=1
export ELECTRON_RUN_AS_NODE=1
export NODE_ENV=production

# Try to start as server
exec sudo -u admin /opt/Chat2API/chat2api --no-sandbox "$@"
EOF

chmod +x /tmp/chat2api-minimal.sh
echo "✅ 最小化启动脚本已创建: /tmp/chat2api-minimal.sh"
echo

echo "📋 分析完成！"
echo "请检查上述输出以确定正确的启动方法。"
echo "如果找到正确的方法，我们可以创建相应的 systemd 服务。"
