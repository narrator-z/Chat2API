# Chat2API Fork 同步和分支管理

## 🌲 分支概览

### 主分支
- **`origin/main`** - 原始仓库的主分支，包含最新的功能开发

### 我们的分支
1. **`docker-linux-minimal`** ⭐ **推荐立即使用**
   - 只包含构建和部署相关的安全改动
   - 不会影响核心应用功能
   - 包含 Linux headless 支持
   - PR: https://github.com/narrator-z/Chat2API/pull/new/docker-linux-minimal

2. **`docker-linux-safe`** - 包含一些额外改动的分支
   - 包含更多改动，需要仔细审查
   - 不推荐立即合并

3. **`docker-linux-fixes`** - 包含所有改动的完整分支
   - 包含大量源代码改动
   - 需要与主分支手动合并解决冲突
   - 包含 Docker 相关的所有修复

## 📦 各分支的改动内容

### `docker-linux-minimal` (安全改动)
```
✅ package.json - Linux headless 支持
✅ scripts/ - Linux 启动器和服务脚本
✅ docs/ - Linux 安装文档
✅ build/postinst.sh - Debian 安装后脚本
✅ build/prerm.sh - Debian 卸载前脚本
✅ .gitignore - 构建脚本忽略规则
```

### `docker-linux-safe` (额外改动)
```
⚠️ 包含 minimal 分支的所有改动
⚠️ 额外的源代码改动 (需要审查)
⚠️ 可能与主分支功能冲突
```

### `docker-linux-fixes` (完整改动)
```
⚠️ 包含所有 Docker 和 Linux 相关改动
⚠️ 大量源代码修改
⚠️ 需要仔细合并和测试
```

## 🎯 推荐的处理流程

### 第一步：立即合并安全分支
1. 审查 `docker-linux-minimal` 分支
2. 创建 PR 并合并到主分支
3. 测试 release action

### 第二步：处理完整分支
1. 等待安全分支合并后
2. 手动合并 `docker-linux-fixes` 分支
3. 解决源代码冲突
4. 全面测试所有功能

## 🚀 Release 包改进

### 新增功能
- ✅ Linux headless 环境支持
- ✅ 自动虚拟显示设置
- ✅ systemd 服务支持
- ✅ 完整的安装文档
- ✅ 启动器脚本

### 修复的问题
- ✅ GitHub Actions 构建失败
- ✅ 缺少 postinst.sh 和 prerm.sh
- ✅ Linux 部署的 X11 显示问题
- ✅ 头less 环境的 segmentation fault

## 📋 测试清单

### 构建测试
- [ ] GitHub Actions 成功构建
- [ ] 所有平台包生成正确
- [ ] Linux 包包含启动器脚本

### 功能测试
- [ ] 核心代理功能正常
- [ ] UI 界面无变化
- [ ] API 兼容性保持
- [ ] 配置文件格式不变

### 部署测试
- [ ] Linux headless 环境运行
- [ ] Docker 容器正常启动
- [ ] systemd 服务工作
- [ ] 虚拟显示自动设置

## 🔗 相关链接

- **安全分支 PR**: https://github.com/narrator-z/Chat2API/pull/new/docker-linux-minimal
- **测试标签**: v1.0.4-minimal
- **Linux 安装指南**: docs/LINUX-INSTALL.md
- **发布说明**: RELEASE-NOTES.md

---

**状态**: ✅ 安全分支已准备就绪，可以立即合并
**下一步**: 等待 PR 审查和合并
