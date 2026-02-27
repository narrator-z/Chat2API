#!/bin/bash

# Chat2API Linux deb package build script
# This script builds Chat2API for Linux and creates deb packages

set -e

echo "🚀 Starting Chat2API Linux deb build process..."

# Check if we're on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "❌ This script must be run on Linux"
    echo "💡 Use Docker: docker build -f Dockerfile.build -t chat2api-builder ."
    exit 1
fi

# Install dependencies
echo "📦 Installing build dependencies..."
sudo apt-get update
sudo apt-get install -y \
    build-essential \
    python3 \
    python3-pip \
    ruby \
    ruby-dev \
    rpm \
    dpkg \
    dpkg-dev

# Install fpm for deb packaging
echo "🔧 Installing fpm..."
sudo gem install fpm -v 1.15.1

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/
rm -rf out/

# Install Node.js dependencies
echo "📥 Installing Node.js dependencies..."
npm ci

# Build the application
echo "🏗️ Building application..."
npm run build

# Create deb package
echo "📦 Creating deb package..."
npx electron-builder --linux deb --x64

# Check if deb was created
if [ -f "dist/Chat2API-1.0.0-amd64.deb" ]; then
    echo "✅ Build successful!"
    echo "📁 Package location: dist/Chat2API-1.0.0-amd64.deb"
    
    # Show package info
    echo "📋 Package information:"
    dpkg-deb -I dist/Chat2API-1.0.0-amd64.deb
    
    # Show package contents
    echo "📂 Package contents:"
    dpkg-deb -c dist/Chat2API-1.0.0-amd64.deb | head -20
    
    echo "🎉 Chat2API deb package build completed!"
else
    echo "❌ Build failed - no deb package found"
    exit 1
fi
