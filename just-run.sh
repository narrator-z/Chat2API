#!/bin/bash

# Chat2API 极简启动脚本 - 适用于任何环境

echo "🚀 Chat2API 极简启动"
echo "=================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

# 检查 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

echo "✅ Docker 环境就绪"

# 创建数据目录
mkdir -p docker-data

# 检查端口
PORT=58080
if netstat -tlnp 2>/dev/null | grep -q ":58080 "; then
    echo "⚠️ 端口 58080 被占用，使用 58123"
    PORT=58123
fi

echo "🚀 启动 Chat2API (端口: $PORT)..."

# 使用最简单的配置
docker run -d \
    --name chat2api \
    -p $PORT:58080 \
    -v $(pwd)/docker-data:/app/data \
    -e NODE_ENV=production \
    -e ELECTRON_IS_DEV=0 \
    node:18-bullseye-slim \
    bash -c "
        # 安装依赖
        npm ci --only=production --silent
        
        # 构建应用
        npm run build
        
        # 启动应用
        node_modules/.bin/electron .
    "

# 等待启动
sleep 5

# 检查是否成功
if docker ps | grep -q chat2api; then
    echo ""
    echo "🎉 启动成功！"
    echo ""
    echo "🌐 访问地址: http://localhost:$PORT"
    echo "📊 管理命令:"
    echo "   查看日志: docker logs -f chat2api"
    echo "   停止服务: docker stop chat2api"
    echo "   重启服务: docker restart chat2api"
else
    echo ""
    echo "❌ 启动失败"
    echo "查看日志: docker logs chat2api"
fi
