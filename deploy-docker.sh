#!/bin/bash

# Chat2API Docker Deployment Script

set -e

echo "🐳 Chat2API Docker 部署脚本"
echo "============================"

# Configuration
IMAGE_NAME="chat2api"
CONTAINER_NAME="chat2api-container"
DEFAULT_PORT="58080"
DATA_DIR="./docker-data"

# Parse command line arguments
PORT=${1:-$DEFAULT_PORT}
ENVIRONMENT=${2:-production}

echo "📋 配置信息:"
echo "   端口: $PORT"
echo "   环境: $ENVIRONMENT"
echo "   数据目录: $DATA_DIR"
echo ""

# Create data directories
echo "📁 创建数据目录..."
mkdir -p "$DATA_DIR/config"
mkdir -p "$DATA_DIR/logs"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker 未运行，请先启动 Docker"
    exit 1
fi

# Stop and remove existing container
if docker ps -a | grep -q $CONTAINER_NAME; then
    echo "🛑 停止现有容器..."
    docker stop $CONTAINER_NAME || true
    docker rm $CONTAINER_NAME || true
fi

# Build Docker image
echo "🔨 构建 Docker 镜像..."
docker build -t $IMAGE_NAME .

# Run Docker container
echo "🚀 启动 Docker 容器..."
docker run -d \
    --name $CONTAINER_NAME \
    --restart unless-stopped \
    -p "$PORT:58080" \
    -v "$(pwd)/$DATA_DIR/config:/app/config" \
    -v "$(pwd)/$DATA_DIR/logs:/app/logs" \
    -e NODE_ENV=$ENVIRONMENT \
    -e ELECTRON_IS_DEV=0 \
    -e TZ=Asia/Shanghai \
    --health-cmd="curl -f http://localhost:58080/health || exit 1" \
    --health-interval=30s \
    --health-timeout=10s \
    --health-retries=3 \
    $IMAGE_NAME

# Wait for container to start
echo "⏳ 等待容器启动..."
sleep 10

# Check container status
if docker ps | grep -q $CONTAINER_NAME; then
    echo "✅ 容器启动成功！"
    echo ""
    echo "📋 访问信息:"
    echo "   Web 管理界面: http://localhost:$PORT"
    echo "   API 端点: http://localhost:$PORT/v1/chat/completions"
    echo "   健康检查: http://localhost:$PORT/health"
    echo ""
    echo "🔧 管理命令:"
    echo "   查看日志: docker logs -f $CONTAINER_NAME"
    echo "   停止容器: docker stop $CONTAINER_NAME"
    echo "   重启容器: docker restart $CONTAINER_NAME"
    echo "   进入容器: docker exec -it $CONTAINER_NAME bash"
    echo ""
    echo "📁 数据持久化:"
    echo "   配置文件: $DATA_DIR/config/"
    echo "   日志文件: $DATA_DIR/logs/"
else
    echo "❌ 容器启动失败"
    echo "🔍 查看错误日志:"
    docker logs $CONTAINER_NAME
    exit 1
fi
