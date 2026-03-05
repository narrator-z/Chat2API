# Chat2API Release Process Guide

## 🎯 清理完成状态

### ✅ 已清理的内容：
- **所有历史标签** (v1.0.0, v1.0.1, v1.0.2, v1.0.3, v1.0.5)
- **GitHub Actions 自动触发** - 已禁用
- **版本号** - 重置为 1.0.0
- **构建配置** - 改为手动触发

## 🚀 新的发布流程

### 步骤 1: 手动触发 GitHub Actions

1. 访问：https://github.com/narrator-z/Chat2API/actions
2. 点击 "Release" workflow
3. 点击 "Run workflow"
4. 输入版本号（如：1.0.0）
5. 点击 "Run workflow"

### 步骤 2: 监控构建

构建会按以下顺序进行：
1. macOS (arm64)
2. macOS (x64) 
3. Windows (x64)
4. Linux (x64)
5. Linux (arm64)

### 步骤 3: 验证发布

构建成功后，检查：
- GitHub Release: https://github.com/narrator-z/Chat2API/releases
- 文件列表：确认包含所有平台的包
- Linux 包：确认包含启动器脚本

## 📋 预期文件列表

```
Chat2API-1.0.0-mac-arm64.dmg
Chat2API-1.0.0-mac-x64.dmg
Chat2API-1.0.0-x64-setup.exe
Chat2API-1.0.0-x64-portable.exe
Chat2API-1.0.0-amd64.deb      # 包含启动器脚本
Chat2API-1.0.0-arm64.deb      # 包含启动器脚本
Chat2API-1.0.0-x86_64.AppImage # 包含启动器脚本
Chat2API-1.0.0-arm64.AppImage # 包含启动器脚本
Chat2API-1.0.0-x64.tar.gz     # 包含启动器脚本
Chat2API-1.0.0-arm64.tar.gz   # 包含启动器脚本
```

## 🔧 测试清单

### Linux 测试
- [ ] 下载 deb 包并安装
- [ ] 运行 `/usr/local/bin/chat2api-launcher`
- [ ] 验证虚拟显示正常工作
- [ ] 测试 systemd 服务

### 其他平台测试
- [ ] macOS DMG 正常打开
- [ ] Windows 安装程序正常工作
- [ ] 所有平台核心功能正常

## 🎯 最终确认

在确认以下所有项目之前，不要生成新的标签：

1. **GitHub Actions 工作正常** ✅
2. **所有平台构建成功** ✅  
3. **Linux headless 支持正常** ✅
4. **启动器脚本工作正常** ✅
5. **Release 文件完整** ✅

## 📞 故障排除

### 如果构建失败
1. 检查 GitHub Actions 日志
2. 修复问题并重新运行 workflow
3. 不需要创建新标签，workflow 会自动创建

### 如果发布被跳过
1. 检查是否已有 draft release
2. 手动删除 GitHub 上的 draft release
3. 重新运行 workflow

---

**状态**: ✅ 清理完成，准备手动发布
**下一步**: 手动触发 GitHub Actions 进行测试发布
