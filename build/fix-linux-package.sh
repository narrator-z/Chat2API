#!/bin/bash

# Chat2API Linux Package Fix Script
# This script fixes corrupted tar.gz files and creates proper packages

set -e

VERSION="1.0.0"
ARCH="x64"
PACKAGE_NAME="chat2api"

echo "🔧 Chat2API Linux Package Fix Script"
echo "=================================="

# Check if we're on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "❌ This script must be run on Linux"
    exit 1
fi

# Find the corrupted tar.gz file
echo "🔍 Looking for Chat2API tar.gz file..."
TAR_FILE=$(find . -name "Chat2API-$VERSION-$ARCH.tar.gz" | head -1)

if [ -z "$TAR_FILE" ]; then
    echo "❌ Chat2API tar.gz file not found"
    echo "💡 Please upload the Chat2API-$VERSION-$ARCH.tar.gz file to this directory"
    exit 1
fi

echo "📦 Found: $TAR_FILE"

# Check file integrity
echo "🔍 Checking file integrity..."
FILE_SIZE=$(stat -c%s "$TAR_FILE")
echo "📊 File size: $FILE_SIZE bytes"

if [ $FILE_SIZE -lt 1000000 ]; then
    echo "❌ File too small, likely corrupted"
    exit 1
fi

# Try to extract with different methods
echo "📂 Attempting to extract..."

# Method 1: Standard tar
echo "🔧 Method 1: Standard tar extraction..."
TEMP_DIR=$(mktemp -d)
if tar -xzf "$TAR_FILE" -C "$TEMP_DIR" 2>/dev/null; then
    echo "✅ Standard tar extraction successful"
    EXTRACTED_DIR="$TEMP_DIR/chat2api-$VERSION"
else
    echo "❌ Standard tar extraction failed"
    
    # Method 2: Try with different options
    echo "🔧 Method 2: Alternative tar extraction..."
    if tar -xf "$TAR_FILE" -C "$TEMP_DIR" 2>/dev/null; then
        echo "✅ Alternative tar extraction successful"
        EXTRACTED_DIR=$(find "$TEMP_DIR" -name "chat2api*" -type d | head -1)
    else
        echo "❌ Alternative tar extraction failed"
        
        # Method 3: Try with 7zip if available
        if command -v 7z >/dev/null 2>&1; then
            echo "🔧 Method 3: 7zip extraction..."
            if 7z x "$TAR_FILE" -o"$TEMP_DIR" >/dev/null 2>&1; then
                echo "✅ 7zip extraction successful"
                EXTRACTED_DIR=$(find "$TEMP_DIR" -name "chat2api*" -type d | head -1)
            else
                echo "❌ 7zip extraction failed"
                rm -rf "$TEMP_DIR"
                exit 1
            fi
        else
            echo "❌ No extraction method worked"
            rm -rf "$TEMP_DIR"
            exit 1
        fi
    fi
fi

# Check if extraction was successful
if [ ! -d "$EXTRACTED_DIR" ]; then
    echo "❌ Extraction failed - no directory found"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "✅ Extraction successful: $EXTRACTED_DIR"

# Check contents
echo "📂 Checking package contents..."
if [ -f "$EXTRACTED_DIR/install.sh" ] && [ -f "$EXTRACTED_DIR/chat2api" ]; then
    echo "✅ Package structure looks correct"
else
    echo "⚠️ Package structure incomplete, attempting to fix..."
    
    # If we have the Chrome files but not the full structure, we need to rebuild
    if [ -f "$EXTRACTED_DIR/chat2api" ]; then
        echo "🔧 Found partial package, creating proper structure..."
        
        # Create proper directory structure
        FIXED_DIR="$TEMP_DIR/chat2api-fixed"
        mkdir -p "$FIXED_DIR/opt/chat2api"
        mkdir -p "$FIXED_DIR/usr/share/applications"
        mkdir -p "$FIXED_DIR/usr/share/icons/hicolor/1024x1024/apps"
        
        # Move files to proper locations
        if [ -d "$EXTRACTED_DIR/out" ]; then
            mv "$EXTRACTED_DIR/out" "$FIXED_DIR/opt/chat2api/"
        fi
        mv "$EXTRACTED_DIR/chat2api" "$FIXED_DIR/opt/chat2api/"
        
        # Create missing files
        cat > "$FIXED_DIR/install.sh" << 'EOF'
#!/bin/bash
set -e

echo "🚀 Installing Chat2API..."

if [ "$EUID" -ne 0 ]; then
    echo "Please run this script with sudo: sudo ./install.sh"
    exit 1
fi

cp -r opt/chat2api /opt/
chmod +x /opt/chat2api/chat2api
chmod -R 755 /opt/chat2api

echo "✅ Chat2API installed successfully!"
echo "📋 Run with: /opt/chat2api/chat2api"
echo "🌐 Web UI: http://localhost:8080"
EOF
        
        chmod +x "$FIXED_DIR/install.sh"
        
        EXTRACTED_DIR="$FIXED_DIR"
        echo "✅ Package structure fixed"
    else
        echo "❌ Cannot fix package structure"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
fi

# Create a new, proper tar.gz
echo "📦 Creating new tar.gz package..."
NEW_TAR="Chat2API-$VERSION-$ARCH-fixed.tar.gz"

cd "$TEMP_DIR"
tar -czf "../$NEW_TAR" "$(basename "$EXTRACTED_DIR")"
cd ..

# Verify the new package
echo "🔍 Verifying new package..."
if tar -tzf "$NEW_TAR" >/dev/null 2>&1; then
    echo "✅ New package created successfully!"
    echo "📁 New file: $NEW_TAR"
    
    # Show package info
    NEW_SIZE=$(stat -c%s "$NEW_TAR")
    echo "📊 New package size: $NEW_SIZE bytes"
    
    echo "📂 Package contents:"
    tar -tzf "$NEW_TAR" | head -10
    
    echo ""
    echo "🎉 Package fix completed!"
    echo ""
    echo "📋 Installation:"
    echo "  tar -xzf $NEW_TAR"
    echo "  cd $(basename "$EXTRACTED_DIR")"
    echo "  sudo ./install.sh"
    echo ""
    echo "🌐 After installation, access Web UI at: http://localhost:8080"
    
else
    echo "❌ New package verification failed"
    rm -f "$NEW_TAR"
fi

# Cleanup
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "✅ Fix process completed!"
