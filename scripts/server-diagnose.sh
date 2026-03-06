#!/bin/bash

# Chat2API Server Diagnostics Script
# This script helps diagnose why Chat2API is not accessible

echo "=== Chat2API 服务器诊断 ==="
echo

echo "1. 检查 Chat2API 服务状态:"
systemctl is-active chat2api.service
echo

echo "2. 检查端口监听状态:"
echo "监听 58080 端口的进程:"
sudo netstat -tlnp | grep 58080 || echo "端口 58080 没有监听"
echo

echo "3. 检查所有 Chat2API 相关端口:"
echo "Chat2API 进程监听的所有端口:"
sudo netstat -tlnp | grep chat2api
echo

echo "4. 检查 Chat2API 进程:"
ps aux | grep chat2api | grep -v grep
echo

echo "5. 检查最近的日志:"
echo "最近 10 行日志:"
sudo journalctl -u chat2api.service --no-pager -n 10
echo

echo "6. 检查配置文件:"
CONFIG_DIR="/home/admin/.config/chat2api"
if [ -d "$CONFIG_DIR" ]; then
    echo "配置目录存在: $CONFIG_DIR"
    ls -la "$CONFIG_DIR"
    if [ -f "$CONFIG_DIR/config.json" ]; then
        echo "配置文件内容:"
        cat "$CONFIG_DIR/config.json"
    else
        echo "配置文件不存在"
    fi
else
    echo "配置目录不存在"
fi
echo

echo "7. 检查防火墙状态:"
if command -v ufw &> /dev/null; then
    sudo ufw status
elif command -v firewall-cmd &> /dev/null; then
    sudo firewall-cmd --list-all
else
    echo "防火墙未安装或未知"
fi
echo

echo "8. 测试本地连接:"
echo "测试 localhost:58080..."
curl -s --connect-timeout 3 http://localhost:58080/ && echo "本地连接成功" || echo "本地连接失败"
echo

echo "9. 检查网络接口:"
ip addr show | grep "inet " | grep -v 127.0.0.1
echo

echo "10. 检查进程资源使用:"
top -b -n 1 | grep chat2api || echo "进程信息获取失败"
echo

echo "=== 诊断完成 ==="
echo "如果发现问题，请将此输出发送给开发者进行分析"
