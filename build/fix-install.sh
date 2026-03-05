#!/bin/bash

# Chat2API Installation Fix Script
# This script fixes the Windows line ending and path issues

set -e

echo "🔧 Fixing Chat2API installation..."

# Check if we're in the right directory
if [ ! -f "install.sh" ]; then
    echo "❌ install.sh not found in current directory"
    echo "💡 Please run this script from the Chat2API directory"
    exit 1
fi

# Fix line endings in install.sh
echo "📝 Fixing line endings..."
dos2unix install.sh 2>/dev/null || {
    # If dos2unix is not available, use sed
    sed -i 's/\r$//' install.sh
}

# Make install.sh executable
echo "🔧 Making install.sh executable..."
chmod +x install.sh

# Fix directory structure if needed
if [ -d "opt\\chat2api" ]; then
    echo "📁 Fixing directory structure..."
    # Move Windows-style paths to Linux paths
    if [ ! -d "opt/chat2api" ]; then
        mkdir -p opt/chat2api
        cp -r opt\\chat2api\\* opt/chat2api/
        rm -rf opt\\chat2api
    fi
fi

# Check if opt/chat2api exists
if [ ! -d "opt/chat2api" ]; then
    echo "❌ opt/chat2api directory not found"
    echo "💡 Please ensure you have the correct Chat2API files"
    exit 1
fi

echo "✅ Installation fixed!"
echo ""
echo "📋 Now you can run:"
echo "  sudo ./install.sh"
echo ""
echo "🔧 If you still have issues, try manual installation:"
echo "  sudo cp -r opt/chat2api /opt/"
echo "  sudo chmod +x /opt/chat2api/chat2api"
echo "  sudo ln -sf /opt/chat2api/chat2api /usr/local/bin/chat2api"
