#!/bin/bash

# Chat2API Cleanup Script
# This script cleans up all installation attempts and files

echo "=== Chat2API 清理脚本 ==="
echo

# Stop all services
echo "1. 停止所有服务:"
sudo systemctl stop chat2api.service 2>/dev/null || true
sudo systemctl disable chat2api.service 2>/dev/null || true
sudo pkill -f chat2api 2>/dev/null || true
sudo pkill -f Xvfb 2>/dev/null || true
echo "✅ 服务已停止"
echo

# Remove systemd service
echo "2. 删除 systemd 服务:"
sudo rm -f /etc/systemd/system/chat2api.service
sudo systemctl daemon-reload
echo "✅ systemd 服务已删除"
echo

# Remove application directory
echo "3. 删除应用目录:"
sudo rm -rf /opt/Chat2API
echo "✅ 应用目录已删除"
echo

# Remove launcher scripts
echo "4. 删除启动器脚本:"
sudo rm -f /usr/local/bin/chat2api-launcher
sudo rm -f /usr/local/bin/chat2api
echo "✅ 启动器脚本已删除"
echo

# Remove user config
echo "5. 删除用户配置:"
sudo rm -rf /home/admin/.config/chat2api
sudo rm -rf /home/admin/.cache/chat2api
echo "✅ 用户配置已删除"
echo

# Clean up temporary files
echo "6. 清理临时文件:"
sudo rm -f /tmp/.X99-lock
sudo rm -f /tmp/.X11-unix/X99
sudo rm -f /tmp/.Xauthority
sudo rm -rf /tmp/runtime-admin
sudo rm -rf /tmp/chat2api_extract
sudo rm -f /tmp/dbus-env.sh
echo "✅ 临时文件已清理"
echo

# Remove installed packages (optional)
echo "7. 清理安装的包:"
echo "已安装的包将被保留，如需删除请手动运行:"
echo "sudo apt-get remove --purge dbus-x11 electron npm nodejs"
echo "sudo apt-get autoremove"
echo

# Show final status
echo "8. 最终状态:"
echo "服务状态: $(systemctl is-active chat2api.service 2>/dev/null || echo '未安装')"
echo "应用目录: $(ls -la /opt/Chat2API 2>/dev/null || echo '不存在')"
echo "启动器: $(ls -la /usr/local/bin/chat2api* 2>/dev/null || echo '不存在')"
echo

echo "✅ Chat2API 清理完成！"
echo
echo "📋 总结:"
echo "- Chat2API 应用在当前系统上存在严重的 D-Bus 兼容性问题"
echo "- 所有尝试的启动方法都因为 D-Bus FD 权限违规而失败"
echo "- 建议联系开发者获取专门的服务器版本或使用 Docker 部署"
echo
echo "📋 保留的文件:"
echo "- /home/admin/.npm/ (npm 缓存)"
echo "- /usr/local/lib/node_modules/ (全局 npm 包)"
echo "- 系统包 (dbus-x11 等)"
