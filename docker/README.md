# Chat2API Docker 部署指南

## 🐳 Docker 容器化部署

Chat2API 支持 Docker 容器化部署，提供更好的隔离性和可移植性。

## 📋 系统要求

- Docker 20.10+
- Docker Compose 2.0+
- 至少 512MB 可用内存
- 至少 1GB 可用磁盘空间

## 🚀 快速开始

### 1. 生产环境部署

```bash
# 克隆项目
git clone https://github.com/xiaoY233/Chat2API.git
cd Chat2API

# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f chat2api

# 停止服务
docker-compose down
```

### 2. 开发环境部署

```bash
# 使用开发配置
docker-compose -f docker-compose.dev.yml up -d

# 进入容器调试
docker-compose -f docker-compose.dev.yml exec chat2api bash
```

## 🔧 配置选项

### 端口配置

默认端口是 58080，如需修改：

```yaml
# docker-compose.yml
services:
  chat2api:
    ports:
      - "58123:58080"  # 将主机端口 58123 映射到容器端口 58080
```

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NODE_ENV` | `production` | 运行环境 |
| `ELECTRON_IS_DEV` | `0` | Electron 开发模式 |
| `TZ` | `Asia/Shanghai` | 时区设置 |
| `DEBUG` | - | 调试日志级别 |

### 数据持久化

```yaml
volumes:
  # 配置文件持久化
  - ./data/config:/app/config
  # 日志文件持久化
  - ./data/logs:/app/logs
  # 自定义配置文件
  - ./config.json:/app/config/config.json:ro
```

## 📁 目录结构

```
Chat2API/
├── docker-compose.yml          # 生产环境配置
├── docker-compose.dev.yml      # 开发环境配置
├── Dockerfile                   # Docker 镜像定义
├── .dockerignore               # Docker 忽略文件
├── docker/                     # Docker 相关文件
│   └── README.md              # 本文档
├── data/                       # 持久化数据目录
│   ├── config/                # 配置文件
│   └── logs/                  # 日志文件
└── nginx/                      # Nginx 配置（可选）
    ├── nginx.conf
    └── ssl/
```

## 🌐 访问服务

### Web 管理界面

启动后访问：
- **默认地址**: http://localhost:58080
- **健康检查**: http://localhost:58080/health

### API 端点

- **聊天完成**: `POST http://localhost:58080/v1/chat/completions`
- **模型列表**: `GET http://localhost:58080/v1/models`
- **统计信息**: `GET http://localhost:58080/stats`

## 🔍 监控和日志

### 查看容器状态

```bash
# 查看容器状态
docker-compose ps

# 查看资源使用
docker stats chat2api

# 查看健康检查状态
docker inspect chat2api | grep Health -A 10
```

### 日志管理

```bash
# 实时查看日志
docker-compose logs -f chat2api

# 查看最近的日志
docker-compose logs --tail=100 chat2api

# 查看特定时间的日志
docker-compose logs --since="2024-01-01" chat2api
```

## 🛠️ 高级配置

### 自定义 Dockerfile

如需自定义镜像：

```dockerfile
FROM chat2api:latest

# 添加自定义配置
COPY custom-config.json /app/config/config.json

# 安装额外依赖
RUN npm install some-package
```

### 多实例部署

```yaml
# docker-compose.multi.yml
version: '3.8'
services:
  chat2api-1:
    image: chat2api:latest
    ports:
      - "58080:58080"
    environment:
      - INSTANCE_ID=1
  
  chat2api-2:
    image: chat2api:latest
    ports:
      - "58081:58080"
    environment:
      - INSTANCE_ID=2
```

### 负载均衡

使用 Nginx 进行负载均衡：

```nginx
# nginx/nginx.conf
upstream chat2api_backend {
    server chat2api:58080;
    # 添加更多实例
    # server chat2api-2:58080;
}

server {
    listen 80;
    location / {
        proxy_pass http://chat2api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔒 安全配置

### 网络隔离

```yaml
networks:
  chat2api-network:
    driver: bridge
    internal: true  # 内部网络，无法访问外网
```

### 资源限制

```yaml
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '0.5'
    reservations:
      memory: 256M
      cpus: '0.25'
```

### 安全选项

```yaml
security_opt:
  - no-new-privileges:true
user: "1000:1000"
read_only: true
tmpfs:
  - /tmp:noexec,nosuid,size=100m
```

## 🔄 更新和维护

### 更新应用

```bash
# 拉取最新代码
git pull

# 重新构建镜像
docker-compose build --no-cache

# 重启服务
docker-compose up -d
```

### 备份数据

```bash
# 备份配置和日志
tar -czf chat2api-backup-$(date +%Y%m%d).tar.gz data/

# 恢复数据
tar -xzf chat2api-backup-20240101.tar.gz
```

### 清理资源

```bash
# 清理停止的容器
docker-compose down --remove-orphans

# 清理未使用的镜像
docker image prune -f

# 清理未使用的卷
docker volume prune -f
```

## 🐛 故障排除

### 常见问题

1. **端口冲突**
   ```bash
   # 检查端口占用
   netstat -tlnp | grep 58080
   # 修改 docker-compose.yml 中的端口映射
   ```

2. **权限问题**
   ```bash
   # 确保数据目录权限正确
   sudo chown -R 1000:1000 data/
   ```

3. **内存不足**
   ```bash
   # 增加内存限制或使用 swap
   docker-compose up -d --scale chat2api=0
   # 修改资源限制后重新启动
   ```

### 调试模式

```bash
# 启用调试模式
docker-compose -f docker-compose.dev.yml up

# 进入容器调试
docker-compose exec chat2api bash
```

## 📚 更多资源

- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Chat2API 项目主页](https://github.com/xiaoY233/Chat2API)
