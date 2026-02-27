#!/bin/bash

# Chat2API Quick Start Script

set -e

echo "🚀 Chat2API Quick Start"
echo "======================"
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

# 检查 Docker 环境
echo "📋 检查环境..."

if ! command -v docker &> /dev/null; then
    error_step "Docker 未安装，请先安装: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    error_step "Docker Compose 未安装，请先安装: https://docs.docker.com/compose/install/"
    exit 1
fi

check_step "Docker 和 Docker Compose 已安装"

# 检查端口占用
echo ""
echo "📋 检查端口 58080..."
if netstat -tlnp 2>/dev/null | grep -q ":58080 "; then
    warn_step "端口 58080 已被占用"
    echo "尝试使用端口 58123..."
    PORT=58123
else
    PORT=58080
    check_step "端口 $PORT 可用"
fi
