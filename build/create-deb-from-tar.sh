#!/bin/bash

# Chat2API deb package creation script from tar.gz
# This script converts the tar.gz package to deb format

set -e

VERSION="1.0.0"
ARCH="amd64"
PACKAGE_NAME="chat2api"

echo "🚀 Converting Chat2API tar.gz to deb package..."

# Check if we're on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "❌ This script must be run on Linux"
    exit 1
fi

# Check dependencies
echo "🔧 Checking dependencies..."
for cmd in dpkg-deb fakeroot; do
    if ! command -v $cmd &> /dev/null; then
        echo "❌ $cmd is not installed"
        echo "💡 Install with: sudo apt-get install $cmd"
        exit 1
    fi
done

# Find tar.gz file
TAR_FILE=$(find . -name "Chat2API-$VERSION-$ARCH.tar.gz" | head -1)
if [ -z "$TAR_FILE" ]; then
    echo "❌ Chat2API tar.gz file not found"
    echo "💡 Please run the build script first to create the tar.gz package"
    exit 1
fi

echo "📦 Found tar.gz file: $TAR_FILE"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
PACKAGE_DIR="$TEMP_DIR/$PACKAGE_NAME-$VERSION"
DEBIAN_DIR="$PACKAGE_DIR/DEBIAN"

echo "📁 Creating package structure..."
mkdir -p "$PACKAGE_DIR"
mkdir -p "$DEBIAN_DIR"

# Extract tar.gz
echo "📂 Extracting tar.gz..."
tar -xzf "$TAR_FILE" -C "$TEMP_DIR"

# Move extracted files
if [ -d "$TEMP_DIR/chat2api-$VERSION" ]; then
    mv "$TEMP_DIR/chat2api-$VERSION"/* "$PACKAGE_DIR/"
    rmdir "$TEMP_DIR/chat2api-$VERSION"
else
    echo "❌ Expected directory not found in tar.gz"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Create control file
echo "📝 Creating control file..."
cat > "$DEBIAN_DIR/control" << EOF
Package: $PACKAGE_NAME
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Maintainer: Chat2API Team <support@chat2api.com>
Description: AI Services Unified Management Tool
 Chat2API is a powerful desktop application that provides an OpenAI-compatible API 
 for multiple AI service providers. It allows you to use any OpenAI-compatible 
 client with DeepSeek, GLM, Kimi, MiniMax, Qwen, Z.ai and more. 
 Features include real-time monitoring, API key management, and web-based remote management.
Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libdrm2, libxcomposite1, libxdamage1, libxrandr2, libgbm1, libxkbcommon0, libasound2
Recommends: gnome-keyring, libsecret-1-0
Homepage: https://github.com/xiaoY233/Chat2API
License: GPL-3.0
EOF

# Calculate installed size
echo "📊 Calculating package size..."
INSTALLED_SIZE=$(du -s "$PACKAGE_DIR" | cut -f1)
echo "Installed-Size: $INSTALLED_SIZE" >> "$DEBIAN_DIR/control"

# Copy maintainer scripts
if [ -f "$PACKAGE_DIR/postinst.sh" ]; then
    cp "$PACKAGE_DIR/postinst.sh" "$DEBIAN_DIR/postinst"
    chmod +x "$DEBIAN_DIR/postinst"
fi

if [ -f "$PACKAGE_DIR/prerm.sh" ]; then
    cp "$PACKAGE_DIR/prerm.sh" "$DEBIAN_DIR/prerm"
    chmod +x "$DEBIAN_DIR/prerm"
fi

# Create simple postinst if not exists
if [ ! -f "$DEBIAN_DIR/postinst" ]; then
    cat > "$DEBIAN_DIR/postinst" << 'EOF'
#!/bin/bash
set -e

# Create user config directory
if [ ! -d "$HOME/.chat2api" ]; then
    mkdir -p "$HOME/.chat2api"
    chmod 755 "$HOME/.chat2api"
fi

# Create logs directory
LOGS_DIR="$HOME/.chat2api/logs"
if [ ! -d "$LOGS_DIR" ]; then
    mkdir -p "$LOGS_DIR"
    chmod 755 "$LOGS_DIR"
fi

# Update desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi

# Update mime database
if command -v update-mime-database >/dev/null 2>&1; then
    update-mime-database /usr/share/mime || true
fi

# Update icon cache
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

exit 0
EOF
    chmod +x "$DEBIAN_DIR/postinst"
fi

# Create simple prerm if not exists
if [ ! -f "$DEBIAN_DIR/prerm" ]; then
    cat > "$DEBIAN_DIR/prerm" << 'EOF'
#!/bin/bash
set -e

# Stop running instances
if pgrep -f "chat2api" >/dev/null; then
    echo "Stopping running Chat2API instances..."
    pkill -f "chat2api" || true
    sleep 2
fi

# Clean up desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi

# Clean up icon cache
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

exit 0
EOF
    chmod +x "$DEBIAN_DIR/prerm"
fi

# Build deb package
echo "📦 Building deb package..."
DEB_FILE="Chat2API-$VERSION-$ARCH.deb"
fakeroot dpkg-deb --build "$PACKAGE_DIR" "$DEB_FILE"

# Check if deb was created
if [ -f "$DEB_FILE" ]; then
    echo "✅ Deb package created successfully!"
    echo "📁 Package location: $DEB_FILE"
    
    # Show package info
    echo "📋 Package information:"
    dpkg-deb -I "$DEB_FILE"
    
    # Show package size
    PACKAGE_SIZE=$(du -h "$DEB_FILE" | cut -f1)
    echo "📊 Package size: $PACKAGE_SIZE"
    
    # Show package contents (first 20 lines)
    echo "📂 Package contents (first 20 items):"
    dpkg-deb -c "$DEB_FILE" | head -20
    
    echo ""
    echo "🎉 Chat2API deb package conversion completed!"
    echo ""
    echo "📋 Installation:"
    echo "  sudo dpkg -i $DEB_FILE"
    echo ""
    echo "📋 Uninstallation:"
    echo "  sudo dpkg -r $PACKAGE_NAME"
    echo ""
    echo "📋 Configuration directory: ~/.chat2api/"
    echo "🌐 Web Management: http://localhost:8080"
    
else
    echo "❌ Failed to create deb package"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Cleanup
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "✅ Conversion completed successfully!"
