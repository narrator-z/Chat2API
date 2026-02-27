#!/bin/bash

# Chat2API Docker 故障排除脚本

echo "🛠️ Chat2API Docker 故障排除工具"
echo "=================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# 1. 检查 Docker 环境
echo "📋 1. 检查 Docker 环境..."
if ! command -v docker &> /dev/null; then
    error_step "Docker 未安装"
    echo "请先安装 Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    error_step "Docker Compose 未安装"
    echo "请先安装 Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

check_step "Docker 和 Docker Compose 已安装"

# 2. 检查端口占用
echo ""
echo "📋 2. 检查端口占用..."
PORT=58080
if netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
    warn_step "端口 $PORT 已被占用"
    echo "占用进程:"
    netstat -tlnp | grep ":$PORT "
    echo ""
    echo "解决方案:"
    echo "1. 修改 docker-compose.yml 中的端口映射"
    echo "2. 或停止占用端口的进程"
else
    check_step "端口 $PORT 可用"
fi

# 3. 检查构建文件
echo ""
echo "📋 3. 检查应用构建..."
if [ ! -f "out/main/index.js" ]; then
    warn_step "应用未构建"
    echo "正在构建应用..."
    if ! npm run build; then
        error_step "构建失败"
        exit 1
    fi
    check_step "应用构建完成"
else
    check_step "应用已构建"
fi

# 4. 检查 Docker Compose 配置
echo ""
echo "📋 4. 检查配置文件..."
if [ -f "docker-compose.yml" ]; then
    check_step "找到 docker-compose.yml"
    if docker-compose config > /dev/null 2>&1; then
        check_step "配置文件语法正确"
    else
        error_step "docker-compose.yml 语法错误"
        docker-compose config
    fi
else
    warn_step "未找到 docker-compose.yml"
    if [ -f "docker-compose.fallback.yml" ]; then
        echo "尝试使用备用配置..."
        if docker-compose -f docker-compose.fallback.yml config > /dev/null 2>&1; then
            check_step "备用配置可用"
        else
            error_step "备用配置也有问题"
        fi
    else
        error_step "未找到任何配置文件"
        exit 1
    fi
fi

# 5. 提供启动选项
echo ""
echo "📋 5. 启动选项..."
echo "选择启动方式:"
echo "1. 标准启动 (docker-compose up)"
echo "2. 简化启动 (使用预构建镜像)"
echo "3. 重建启动 (重新构建镜像)"
echo "4. 仅检查环境"
echo ""
read -p "请选择 (1-4): " choice

case $choice in
    1)
        echo "启动标准配置..."
        docker-compose up
        ;;
    2)
        echo "启动简化配置..."
        if [ -f "docker-compose.fallback.yml" ]; then
            docker-compose -f docker-compose.fallback.yml up
        else
            error_step "简化配置文件不存在"
        fi
        ;;
    3)
        echo "重建并启动..."
        docker-compose up --build
        ;;
    4)
        echo "仅检查完成"
        exit 0
        ;;
    *)
        error_step "无效选择"
        exit 1
        ;;
esac

# 6. 检查启动结果
echo ""
echo "📋 6. 检查启动结果..."
sleep 5

if docker-compose ps | grep -q "chat2api.*Up"; then
    check_step "容器运行中"
    echo ""
    echo "🌐 访问信息:"
    echo "Web 管理界面: http://localhost:58080"
    echo "健康检查: http://localhost:58080/health"
    echo ""
    echo "📊 容器状态:"
    docker-compose ps
else
    error_step "容器未运行"
    echo ""
    echo "查看日志获取更多信息:"
    echo "docker-compose logs chat2api"
fi

echo ""
echo "🎉 故障排除完成！"
