# 🛠️ Docker 部署故障排除指南

## 🔍 常见问题及解决方案

### 1. ❌ "docker-compose up" 失败

#### 问题：镜像构建失败
```
ERROR: failed to calculate checksum of ref:: "/out": not found
```

**解决方案**：
```bash
# 方法1：先构建应用
npm run build
docker-compose up

# 方法2：使用简化版配置
docker-compose -f docker-compose.fallback.yml up

# 方法3：手动构建
docker build -t narrator-z/chat2api:latest .
docker-compose up
```

#### 问题：端口冲突
```
ERROR: for chat2api  Cannot start service: port is already allocated
```

**解决方案**：
```bash
# 查看端口占用
netstat -tlnp | grep 58080
lsof -i :58080

# 修改 docker-compose.yml 中的端口
ports:
  - "58123:58080"  # 使用不同端口
```

#### 问题：权限错误
```
ERROR: permission denied while trying to connect to Docker daemon socket
```

**解决方案**：
```bash
# 添加用户到 docker 组
sudo usermod -aG docker $USER
newgrp docker

# 或使用 sudo 运行
sudo docker-compose up
```

### 2. 🐳 Docker 镜像问题

#### 问题：镜像拉取失败
```
ERROR: Service 'chat2api' failed to build: Pull access denied
```

**解决方案**：
```bash
# 检查 Docker Hub 连接
docker info

# 使用代理（如果需要）
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
docker-compose up

# 或使用国内镜像源
sudo systemctl edit docker
# 添加：
{
  "registry-mirrors": ["https://docker.mirrors.ustc.edu.cn"]
}
```

### 3. 📦 应用启动问题

#### 问题：应用无法启动
```
ERROR: Container exited with code 1
```

**解决方案**：
```bash
# 查看容器日志
docker-compose logs chat2api

# 进入容器调试
docker-compose exec chat2api bash

# 检查应用状态
docker-compose ps
```

### 4. 🔧 分步部署方案

#### 方案1：使用预构建镜像（推荐）
```bash
# 1. 拉取基础镜像
docker pull node:18-bullseye-slim

# 2. 使用简化配置启动
docker-compose -f docker-compose.fallback.yml up
```

#### 方案2：本地构建
```bash
# 1. 构建应用
npm run build

# 2. 构建镜像
docker build -t chat2api-local .

# 3. 启动
docker run -d \
  --name chat2api-local \
  -p 58080:58080 \
  -v $(pwd)/docker-data:/app/data \
  chat2api-local
```

#### 方案3：一键脚本
```bash
# 使用快速启动脚本
./quick-start.sh

# 或使用故障排除脚本
./troubleshoot.sh
```

### 5. 🌐 网络问题

#### 问题：无法访问 Web 界面
```
curl: (7) Failed to connect to localhost port 58080
```

**解决方案**：
```bash
# 检查容器状态
docker-compose ps

# 检查端口映射
docker-compose port chat2api

# 检查防火墙
sudo ufw status
sudo firewall-cmd --list-all

# 重启网络服务
sudo systemctl restart docker
```

### 6. 📊 系统资源问题

#### 问题：内存不足
```
ERROR: Container killed due to memory limit
```

**解决方案**：
```bash
# 增加 swap 空间
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo swapon /swapfile

# 限制容器资源
# 在 docker-compose.yml 中添加
deploy:
  resources:
    limits:
      memory: 1G
      cpus: '0.5'
```

### 7. 🔄 更新和维护

#### 更新应用
```bash
# 拉取最新代码
git pull origin main

# 重新构建
npm run build
docker-compose up --build
```

#### 清理资源
```bash
# 清理未使用的镜像
docker image prune -f

# 清理未使用的容器
docker container prune -f

# 清理系统缓存
docker system prune -f
```

### 8. 📞 获取帮助

如果以上解决方案都无法解决问题：

1. **查看详细日志**
   ```bash
   docker-compose logs --tail=100 chat2api
   ```

2. **检查系统环境**
   ```bash
   # Docker 版本
   docker --version
   
   # 系统信息
   uname -a
   
   # 磁盘空间
   df -h
   ```

3. **社区支持**
   - [GitHub Issues](https://github.com/narrator-z/Chat2API/issues)
   - [Discord/Telegram](https://discord.gg/...)
   - [文档](https://github.com/narrator-z/Chat2API/wiki)

4. **重新部署**
   ```bash
   # 完全清理
   docker-compose down -v
   docker system prune -f
   
   # 重新开始
   git clone https://github.com/narrator-z/Chat2API.git
   cd Chat2API
   ./quick-start.sh
   ```

---

**记住**：大多数问题都与构建、端口、权限或网络配置有关。按步骤检查通常能找到问题所在！
