# Chat2API Linux Installation Guide

## Quick Start

### Method 1: Direct Run (Simple)
```bash
# Set up virtual display and run
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 &
/opt/Chat2API/chat2api %U
```

### Method 2: Using Launcher Script (Recommended)
```bash
# Download and run the launcher
./chat2api-launcher.sh %U
```

### Method 3: System Service (Background)
```bash
# Install as systemd service
sudo systemctl enable chat2api
sudo systemctl start chat2api
```

## Manual Installation

### 1. Extract Chat2API
```bash
sudo mkdir -p /opt/Chat2API
sudo tar -xzf Chat2API-*.tar.gz -C /opt/Chat2API
sudo chown -R $USER:$USER /opt/Chat2API
sudo chmod +x /opt/Chat2API/chat2api
```

### 2. Install Dependencies
```bash
# For Ubuntu/Debian:
sudo apt-get update
sudo apt-get install -y xvfb libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 \
    xdg-utils libatspi2.0-0 libdrm2 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libxkbcommon0 libasound2

# For RHEL/CentOS:
sudo yum install -y xorg-x11-server-Xvfb gtk3 nss libXScrnSaver libXtst \
    xdg-utils at-spi2-atk libdrm libXcomposite libXdamage libXrandr \
    mesa-libgbm libxkbcommon alsa-lib

# For Fedora:
sudo dnf install -y xorg-x11-server-Xvfb gtk3 nss libXScrnSaver libXtst \
    xdg-utils at-spi2-atk libdrm libXcomposite libXdamage libXrandr \
    mesa-libgbm libxkbcommon alsa-lib

# For Arch Linux:
sudo pacman -S --noconfirm xorg-server-xvfb gtk3 nss libxscrnsaver libxtst \
    xdg-utils at-spi2-core libdrm libxcomposite libxdamage libxrandr \
    mesa libxkbcommon alsa-lib
```

### 3. Run Chat2API
```bash
# Using virtual display
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 &
/opt/Chat2API/chat2api %U
```

## Troubleshooting

### Error: Missing X server or $DISPLAY
This error occurs when Chat2API cannot find a display server. Solution:

```bash
# Start virtual framebuffer
Xvfb :99 -screen 0 1024x768x24 &
export DISPLAY=:99
/opt/Chat2API/chat2api %U
```

### Error: Segmentation fault
This usually happens when the virtual display is not properly set up. Make sure:

1. Xvfb is running: `pgrep -f Xvfb`
2. DISPLAY is set: `echo $DISPLAY`
3. Dependencies are installed

### Service Issues
```bash
# Check service status
sudo systemctl status chat2api

# View logs
sudo journalctl -u chat2api -f

# Restart service
sudo systemctl restart chat2api
```

## Advanced Configuration

### Environment Variables
- `DISPLAY=:99` - Virtual display number
- `ELECTRON_IS_DEV=0` - Production mode
- `NODE_ENV=production` - Node environment

### Custom Display Resolution
```bash
Xvfb :99 -screen 0 1920x1080x24 &
```

### Running without GUI (Headless)
If you want to run Chat2API completely headless:

```bash
# Add to command line
--no-sandbox --disable-gpu --disable-dev-shm-usage
```

## Uninstall
```bash
# Stop and disable service
sudo systemctl stop chat2api
sudo systemctl disable chat2api

# Remove files
sudo rm -rf /opt/Chat2API
sudo rm -f /usr/local/bin/chat2api-launcher
sudo rm -f /etc/systemd/system/chat2api.service
sudo rm -f /usr/share/applications/chat2api.desktop

# Reload systemd
sudo systemctl daemon-reload
```
