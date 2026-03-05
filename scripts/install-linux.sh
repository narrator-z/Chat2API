#!/bin/bash

# Chat2API Installation Script for Linux
# This script installs Chat2API and sets up the necessary components

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Installation directory
INSTALL_DIR="/opt/Chat2API"
SERVICE_NAME="chat2api"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    print_error "This script should not be run as root for security reasons."
    print_error "Please run as a regular user with sudo privileges."
    exit 1
fi

# Check if Chat2API binary exists
if [ ! -f "$INSTALL_DIR/chat2api" ]; then
    print_error "Chat2API binary not found at $INSTALL_DIR/chat2api"
    print_error "Please extract the Chat2API archive to $INSTALL_DIR first"
    exit 1
fi

print_status "Installing Chat2API..."

# Create installation directory if it doesn't exist
sudo mkdir -p "$INSTALL_DIR"

# Set permissions
sudo chown -R $USER:$USER "$INSTALL_DIR"
sudo chmod +x "$INSTALL_DIR/chat2api"

# Install dependencies
print_status "Installing dependencies..."

# Detect package manager
if command -v apt-get &> /dev/null; then
    # Debian/Ubuntu
    sudo apt-get update
    sudo apt-get install -y xvfb libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 \
        xdg-utils libatspi2.0-0 libdrm2 libxcomposite1 libxdamage1 libxrandr2 \
        libgbm1 libxkbcommon0 libasound2
elif command -v yum &> /dev/null; then
    # RHEL/CentOS
    sudo yum install -y xorg-x11-server-Xvfb gtk3 nss libXScrnSaver libXtst \
        xdg-utils at-spi2-atk libdrm libXcomposite libXdamage libXrandr \
        mesa-libgbm libxkbcommon alsa-lib
elif command -v dnf &> /dev/null; then
    # Fedora
    sudo dnf install -y xorg-x11-server-Xvfb gtk3 nss libXScrnSaver libXtst \
        xdg-utils at-spi2-atk libdrm libXcomposite libXdamage libXrandr \
        mesa-libgbm libxkbcommon alsa-lib
elif command -v pacman &> /dev/null; then
    # Arch Linux
    sudo pacman -S --noconfirm xorg-server-xvfb gtk3 nss libxscrnsaver libxtst \
        xdg-utils at-spi2-core libdrm libxcomposite libxdamage libxrandr \
        mesa libxkbcommon alsa-lib
else
    print_warning "Unsupported package manager. Please install the following dependencies manually:"
    print_warning "- xvfb (virtual framebuffer)"
    print_warning "- GTK3, NSS, and other Electron dependencies"
fi

# Install launcher script
print_status "Installing launcher script..."
sudo cp "$(dirname "$0")/chat2api-launcher.sh" /usr/local/bin/chat2api-launcher
sudo chmod +x /usr/local/bin/chat2api-launcher

# Install systemd service (optional)
if command -v systemctl &> /dev/null; then
    read -p "Do you want to install Chat2API as a systemd service? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Installing systemd service..."
        sudo cp "$(dirname "$0")/chat2api.service" /etc/systemd/system/
        sudo systemctl daemon-reload
        sudo systemctl enable $SERVICE_NAME
        
        print_status "Service installed. You can start it with:"
        print_status "  sudo systemctl start $SERVICE_NAME"
        print_status "Or run it directly with:"
        print_status "  /usr/local/bin/chat2api-launcher"
    fi
fi

# Create desktop entry (optional)
if [ -d "/usr/share/applications" ]; then
    read -p "Do you want to create a desktop entry? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Creating desktop entry..."
        sudo tee /usr/share/applications/chat2api.desktop > /dev/null <<EOF
[Desktop Entry]
Name=Chat2API
Comment=AI Services Unified Management Tool
Exec=/usr/local/bin/chat2api-launcher %U
Icon=$INSTALL_DIR/chat2api.png
Terminal=false
Type=Application
Categories=Utility;Network;Development;
StartupNotify=true
EOF
    fi
fi

print_status "Installation completed!"
print_status "You can now run Chat2API with:"
print_status "  /usr/local/bin/chat2api-launcher"
print_status "Or directly:"
print_status "  DISPLAY=:99 $INSTALL_DIR/chat2api"

if command -v systemctl &> /dev/null && sudo systemctl is-enabled $SERVICE_NAME &> /dev/null; then
    print_status "To start the service:"
    print_status "  sudo systemctl start $SERVICE_NAME"
    print_status "To check status:"
    print_status "  sudo systemctl status $SERVICE_NAME"
fi
