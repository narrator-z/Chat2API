#!/bin/bash

# Chat2API Server Auto-Fix Script
# This script automatically diagnoses and fixes common Chat2API deployment issues

set -e

echo "=== Chat2API 自动修复脚本 ==="
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if port is listening
check_port() {
    local port=$1
    if sudo netstat -tlnp | grep -q ":$port "; then
        return 0
    else
        return 1
    fi
}

# Function to open firewall port
open_firewall_port() {
    local port=$1
    print_status "尝试开放端口 $port..."
    
    if command -v ufw &> /dev/null; then
        sudo ufw allow $port/tcp && print_status "UFW 防火墙端口 $port 已开放"
    elif command -v firewall-cmd &> /dev/null; then
        sudo firewall-cmd --permanent --add-port=$port/tcp
        sudo firewall-cmd --reload
        print_status "firewalld 防火墙端口 $port 已开放"
    else
        print_warning "未检测到防火墙管理工具"
    fi
}

# Step 1: Check service status
print_status "1. 检查 Chat2API 服务状态..."
if systemctl is-active --quiet chat2api.service; then
    print_status "服务正在运行"
else
    print_warning "服务未运行，尝试启动..."
    sudo systemctl start chat2api.service
    sleep 3
fi

# Step 2: Check port 58080
print_status "2. 检查端口 58080..."
if check_port 58080; then
    print_status "端口 58080 正在监听"
    PORT_PROCESS=$(sudo netstat -tlnp | grep :58080 | awk '{print $7}' | cut -d'/' -f1)
    print_status "进程 ID: $PORT_PROCESS"
else
    print_error "端口 58080 没有监听"
    
    # Check what ports Chat2API is actually using
    print_status "检查 Chat2API 实际使用的端口..."
    CHAT2API_PORTS=$(sudo netstat -tlnp | grep chat2api)
    if [ -n "$CHAT2API_PORTS" ]; then
        echo "$CHAT2API_PORTS"
        ACTUAL_PORT=$(echo "$CHAT2API_PORTS" | head -1 | awk '{print $4}' | cut -d':' -f2)
        print_status "Chat2API 实际监听端口: $ACTUAL_PORT"
        print_warning "请尝试访问 http://192.168.31.145:$ACTUAL_PORT/"
    else
        print_error "Chat2API 没有监听任何端口"
        
        # Try to restart service
        print_status "尝试重启服务..."
        sudo systemctl restart chat2api.service
        sleep 5
        
        if check_port 58080; then
            print_status "重启后端口 58080 正常监听"
        else
            print_error "重启后仍然没有监听端口"
        fi
    fi
fi

# Step 3: Check firewall
print_status "3. 检查防火墙状态..."
if command -v ufw &> /dev/null; then
    UFW_STATUS=$(sudo ufw status | head -1)
    echo "UFW 状态: $UFW_STATUS"
    if echo "$UFW_STATUS" | grep -q "active"; then
        if ! sudo ufw status | grep -q "58080/tcp"; then
            print_warning "防火墙启用但端口 58080 未开放"
            open_firewall_port 58080
        else
            print_status "端口 58080 已在防火墙中开放"
        fi
    fi
elif command -v firewall-cmd &> /dev/null; then
    if sudo firewall-cmd --state &> /dev/null; then
        print_status "firewalld 防火墙启用"
        if ! sudo firewall-cmd --list-ports | grep -q "58080/tcp"; then
            print_warning "端口 58080 未在防火墙中开放"
            open_firewall_port 58080
        else
            print_status "端口 58080 已在防火墙中开放"
        fi
    else
        print_status "firewalld 防火墙未启用"
    fi
else
    print_status "未检测到防火墙"
fi

# Step 4: Test local connection
print_status "4. 测试本地连接..."
if curl -s --connect-timeout 3 http://localhost:58080/ > /dev/null; then
    print_status "本地连接成功"
else
    print_warning "本地连接失败，尝试其他端口..."
    
    # Try to find the actual port
    CHAT2API_PORTS=$(sudo netstat -tlnp | grep chat2api)
    if [ -n "$CHAT2API_PORTS" ]; then
        ACTUAL_PORT=$(echo "$CHAT2API_PORTS" | head -1 | awk '{print $4}' | cut -d':' -f2)
        print_status "尝试端口 $ACTUAL_PORT..."
        if curl -s --connect-timeout 3 http://localhost:$ACTUAL_PORT/ > /dev/null; then
            print_status "端口 $ACTUAL_PORT 连接成功"
            print_warning "请使用 http://192.168.31.145:$ACTUAL_PORT/ 访问"
        else
            print_error "所有端口连接都失败"
        fi
    fi
fi

# Step 5: Check configuration
print_status "5. 检查配置文件..."
CONFIG_DIR="/home/admin/.config/chat2api"
if [ -f "$CONFIG_DIR/config.json" ]; then
    print_status "配置文件存在"
    echo "配置内容:"
    cat "$CONFIG_DIR/config.json"
else
    print_warning "配置文件不存在，使用默认配置"
fi

# Step 6: Final test
print_status "6. 最终连接测试..."
if check_port 58080; then
    print_status "✅ 端口 58080 正在监听"
    print_status "✅ 请访问: http://192.168.31.145:58080/"
else
    CHAT2API_PORTS=$(sudo netstat -tlnp | grep chat2api)
    if [ -n "$CHAT2API_PORTS" ]; then
        ACTUAL_PORT=$(echo "$CHAT2API_PORTS" | head -1 | awk '{print $4}' | cut -d':' -f2)
        print_status "✅ 端口 $ACTUAL_PORT 正在监听"
        print_status "✅ 请访问: http://192.168.31.145:$ACTUAL_PORT/"
    else
        print_error "❌ 没有找到监听的端口"
        print_status "建议检查日志: sudo journalctl -u chat2api.service -f"
    fi
fi

echo
echo "=== 自动修复完成 ==="
echo "如果仍有问题，请运行: sudo journalctl -u chat2api.service -f"
