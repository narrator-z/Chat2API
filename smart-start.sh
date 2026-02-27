#!/bin/bash

# Chat2API Smart Start Script - 自动处理常见问题

set -e

echo "🚀 Chat2API 智能启动脚本"
echo "=========================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 检查函数
check_step() {
    echo -e "${GREEN}[✓]${NC} $1"
}

error_step() {
    echo -e "${RED}[✗]${NC} $1"
}

warn_step() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

info_step() {
    echo -e "${BLUE}[ℹ]${NC} $1"
}

# 自动安装 Docker Compose（如果需要）
install_docker_compose() {
    info_step "检查 Docker Compose 安装..."
    
    if command -v docker-compose &> /dev/null; then
        check_step "Docker Compose 已安装"
        return 0
    fi
    
    info_step "Docker Compose 未安装，正在安装..."
    
    # 检测系统类型
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        sudo apt-get update
        sudo apt-get install -y docker-compose-plugin
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        sudo yum install -y docker-compose-plugin
    elif command -v dnf &> /dev/null; then
        # Fedora
        sudo dnf install -y docker-compose-plugin
    else
        error_step "无法自动安装 Docker Compose"
        echo "请手动安装: https://docs.docker.com/compose/install/"
        return 1
    fi
    
    if command -v docker-compose &> /dev/null; then
        check_step "Docker Compose 安装成功"
        return 0
    else
        error_step "Docker Compose 安装失败"
        return 1
    fi
}

# 自动安装 Node.js（如果需要）
install_nodejs() {
    info_step "检查 Node.js 安装..."
    
    if command -v node &> /dev/null; then
        check_step "Node.js 已安装: $(node --version)"
        return 0
    fi
    
    info_step "Node.js 未安装，正在安装..."
    
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
    else
        error_step "无法自动安装 Node.js"
        return 1
    fi
    
    if command -v node &> /dev/null; then
        check_step "Node.js 安装成功: $(node --version)"
        return 0
    else
        error_step "Node.js 安装失败"
        return 1
    fi
}

# 检查并创建数据目录
setup_directories() {
    info_step "设置数据目录..."
    mkdir -p docker-data/config docker-data/logs out
    chmod 755 docker-data
    check_step "数据目录已创建"
}

# 检查端口
check_port() {
    info_step "检查端口可用性..."
    PORT=58080
    
    if netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
        warn_step "端口 $PORT 已被占用"
        
        # 尝试寻找可用端口
        for alt_port in 58123 58124 58125 58126; do
            if ! netstat -tlnp 2>/dev/null | grep -q ":$alt_port "; then
                PORT=$alt_port
                check_step "使用端口 $alt_port"
                break
            fi
        done
        
        if netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
            error_step "所有尝试端口都被占用"
            return 1
        fi
    else
        check_step "端口 $PORT 可用"
    fi
    
    echo $PORT > /tmp/chat2api_port
    return 0
}

# 构建 Docker 镜像
build_image() {
    info_step "构建 Docker 镜像..."
    if docker build -t chat2api-local .; then
        check_step "镜像构建成功"
        return 0
    else
        error_step "镜像构建失败"
        return 1
    fi
}

# 启动容器
start_container() {
    local port=$1
    local image_name=$2
    
    info_step "启动容器 (端口: $port)..."
    
    # 创建临时 docker-compose 文件
    cat > /tmp/docker-compose-temp.yml << EOF
version: '3.8'

services:
  chat2api:
    image: $image_name
    container_name: chat2api
    ports:
      - "$port:58080"
    environment:
      - NODE_ENV=production
      - ELECTRON_IS_DEV=0
      - TZ=Asia/Shanghai
    volumes:
      - ./docker-data:/app/data
      - ./out:/app/out
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:58080/health" || "true"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF
    
    if docker-compose -f /tmp/docker-compose-temp.yml up -d; then
        check_step "容器启动成功"
        rm -f /tmp/docker-compose-temp.yml
        return 0
    else
        error_step "容器启动失败"
        rm -f /tmp/docker-compose-temp.yml
        return 1
    fi
}

# 主函数
main() {
    echo "🔍 系统检查中..."
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        error_step "Docker 未安装，请先安装: https://docs.docker.com/get-docker/"
        exit 1
    fi
    check_step "Docker 已安装"
    
    # 安装 Docker Compose（如果需要）
    if ! install_docker_compose; then
        exit 1
    fi
    
    # 检查并安装 Node.js（如果需要）
    if [ ! -f "out/main/index.js" ] && ! command -v node &> /dev/null; then
        if ! install_nodejs; then
            exit 1
        fi
    fi
    
    # 设置目录
    setup_directories
    
    # 检查端口
    if ! check_port; then
        exit 1
    fi
    
    PORT=$(cat /tmp/chat2api_port)
    
    # 构建应用（如果需要）
    if [ ! -f "out/main/index.js" ]; then
        info_step "应用未构建，正在构建..."
        if ! npm run build; then
            error_step "应用构建失败"
            exit 1
        fi
        check_step "应用构建完成"
    else
        check_step "应用已构建"
    fi
    
    # 选择启动方式
    echo ""
    echo "🚀 启动选项:"
    echo "1. 使用本地构建镜像"
    echo "2. 使用 Node.js 官方镜像"
    echo "3. 使用简化配置"
    echo ""
    read -p "请选择 (1-3): " choice
    
    case $choice in
        1)
            if build_image; then
                start_container $PORT chat2api-local
            else
                error_step "镜像构建失败"
                exit 1
            fi
            ;;
        2)
            start_container $PORT node:18-bullseye-slim
            ;;
        3)
            info_step "使用简化配置启动..."
            if [ -f "docker-compose.fallback.yml" ]; then
                docker-compose -f docker-compose.fallback.yml up -d
            else
                error_step "简化配置文件不存在"
                exit 1
            fi
            ;;
        *)
            error_step "无效选择"
            exit 1
            ;;
    esac
    
    # 检查启动结果
    sleep 3
    echo ""
    info_step "检查容器状态..."
    
    if docker ps | grep -q "chat2api"; then
        echo ""
        echo "🎉 启动成功！"
        echo ""
        echo "🌐 访问信息:"
        echo "   Web 管理界面: http://localhost:$PORT"
        echo "   健康检查: http://localhost:$PORT/health"
        echo "   API 端点: http://localhost:$PORT/v1/chat/completions"
        echo ""
        echo "🔧 管理命令:"
        echo "   查看日志: docker logs -f chat2api"
        echo "   停止服务: docker stop chat2api"
        echo "   重启服务: docker restart chat2api"
        echo "   查看状态: docker ps"
        echo ""
        echo "📁 数据持久化:"
        echo "   配置文件: ./docker-data/config/"
        echo "   日志文件: ./docker-data/logs/"
        echo ""
        echo "💡 首次使用:"
        echo "   1. 在浏览器中打开 Web 管理界面"
        echo "   2. 配置 AI 服务提供商"
        echo "   3. 生成 API 密钥"
        echo "   4. 开始使用 OpenAI 兼容的 API！"
    else
        error_step "容器启动失败"
        echo ""
        echo "🔍 查看日志获取更多信息:"
        echo "docker logs chat2api"
        exit 1
    fi
    
    # 清理临时文件
    rm -f /tmp/chat2api_port /tmp/docker-compose-temp.yml
}

# 运行主函数
main "$@"
