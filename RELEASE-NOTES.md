# Chat2API Release Package Contents

## 📦 Package Structure

When you install Chat2API from a release package, the following structure will be created:

```
/opt/Chat2API/
├── chat2api                    # Main executable
├── resources/
│   ├── build/                  # Build resources
│   │   ├── icon.png
│   │   ├── icon.ico
│   │   ├── postinst.sh
│   │   ├── prerm.sh
│   │   └── ...
│   ├── scripts/               # Linux scripts (NEW!)
│   │   ├── chat2api-launcher.sh    # Headless launcher
│   │   ├── chat2api.service         # Systemd service
│   │   └── install-linux.sh         # Installation script
│   └── docs/                  # Documentation (NEW!)
│       └── LINUX-INSTALL.md    # Linux installation guide
└── app/                       # Application files
    └── ...
```

## 🚀 Quick Start for Linux

### Method 1: Using Launcher (Recommended for Headless)
```bash
# The launcher is automatically installed to /usr/local/bin/
chat2api-launcher
```

### Method 2: Manual Virtual Display
```bash
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 &
/opt/Chat2API/chat2api
```

### Method 3: System Service
```bash
# During installation, you can choose to install as a service
sudo systemctl start chat2api
sudo systemctl status chat2api
```

## 📋 What's Included in This Release

### ✅ New Features
- **Headless Launcher Script**: Automatically sets up virtual display
- **Systemd Service**: Run Chat2API as a background service
- **Linux Installation Guide**: Comprehensive documentation
- **Headless Mode Flags**: Optimized for server environments

### 🔧 Technical Improvements
- Fixed GitHub Actions build scripts
- Added proper Linux packaging
- Improved dependency management
- Better error handling for headless environments

### 📚 Documentation
- Complete Linux installation guide
- Troubleshooting section
- Multiple deployment options
- Service configuration examples

## 🐧 Linux Distribution Support

This release supports the following Linux distributions:
- Ubuntu/Debian (apt)
- RHEL/CentOS (yum)
- Fedora (dnf)
- Arch Linux (pacman)

## 🔧 Installation Methods

### From .deb Package (Ubuntu/Debian)
```bash
sudo dpkg -i Chat2API-*.deb
# The launcher script is automatically installed
```

### From .tar.gz Archive
```bash
tar -xzf Chat2API-*.tar.gz
sudo cp -r Chat2API /opt/Chat2API
sudo /opt/Chat2API/resources/scripts/install-linux.sh
```

### From AppImage
```bash
chmod +x Chat2API-*.AppImage
./Chat2API-*.AppImage  # Will prompt for launcher installation
```

## 🎯 Headless Environment Support

This release includes special support for headless environments:

1. **Automatic Virtual Display**: The launcher script automatically sets up Xvfb
2. **Service Mode**: Run as a systemd service without user interaction
3. **Optimized Flags**: Pre-configured Electron flags for headless operation

## 📞 Support

For issues and support:
- Check the Linux installation guide: `docs/LINUX-INSTALL.md`
- Use the launcher script for automatic setup
- Check logs with: `sudo journalctl -u chat2api` (if using service)

---

**Version**: 1.0.3+  
**Release Date**: 2026-03-05  
**Compatibility**: Linux x64, ARM64
