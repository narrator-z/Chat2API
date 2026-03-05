#!/bin/bash
# Chat2API Installation Script for Linux

set -e

echo "🚀 Installing Chat2API..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run this script with sudo: sudo ./install.sh"
    exit 1
fi

# Copy files to system
echo "📁 Copying files..."
cp -r opt/chat2api /opt/
chmod +x /opt/chat2api/chat2api
chmod -R 755 /opt/chat2api

# Create desktop file
echo "📱 Creating desktop integration..."
mkdir -p /usr/share/applications
cat > /usr/share/applications/chat2api.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Chat2API
Comment=统一管理多个 AI 服务提供商，提供 OpenAI 兼容 API 接口
Exec=/opt/chat2api/chat2api
Categories=Utility;Network;Development;
Keywords=ai;api;proxy;chatgpt;openai;
StartupWMClass=chat2api
StartupNotify=true
EOF

# Create symbolic link
echo "🔗 Creating symbolic link..."
ln -sf /opt/chat2api/chat2api /usr/local/bin/chat2api

# Update desktop database
echo "📱 Updating desktop database..."
update-desktop-database -q /usr/share/applications || true

# Create user config directory
echo "📁 Creating user configuration directory..."
mkdir -p ~/.chat2api/logs

echo "✅ Chat2API installed successfully!"
echo ""
echo "📋 Usage:"
echo "  - Launch from application menu: Chat2API"
echo "  - Run from terminal: chat2api"
echo "  - Run directly: /opt/chat2api/chat2api"
echo ""
echo "🌐 Web Management: http://localhost:58080 (default port)"
echo "💡 If port 58080 is occupied, the app will automatically use an available port"
echo "🗂️ Configuration directory: ~/.chat2api/"
echo "📖 Documentation: https://github.com/xiaoY233/Chat2API"
