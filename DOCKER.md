# Docker 部署指南

Chat2API 支持 Docker 容器化部署，提供 OpenAI 兼容的 API 代理服务和 Web 管理界面。

## 快速开始

### 使用 Docker Compose（推荐）

1. 克隆仓库并进入项目目录：
```bash
git clone https://github.com/chat2api/Chat2API.git
cd Chat2API
```

2. 启动服务：
```bash
docker-compose up -d
```

3. 访问服务：
- Web 管理界面：http://localhost:3001
- API 代理服务：http://localhost:8088

### 使用 Docker 命令

1. 构建镜像：
```bash
docker build -t chat2api:latest .
```

2. 运行容器：
```bash
docker run -d \
  --name chat2api-manager \
  -p 8088:8088 \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  chat2api:latest
```

## 配置

### 环境变量

可以通过环境变量配置应用行为：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DATA_DIR` | `/app/data` | 数据存储目录 |
| `API_PORT` | `8088` | API 代理端口 |
| `WEB_PORT` | `3001` | Web 界面端口 |
| `API_HOST` | `0.0.0.0` | API 监听地址 |
| `WEB_HOST` | `0.0.0.0` | Web 界面监听地址 |
| `ENABLE_API_KEY` | `false` | 是否启用 API 密钥验证 |
| `MANAGEMENT_API_SECRET` | - | 管理 API 密钥 |

### Docker Compose 配置示例

在 `docker-compose.yml` 中添加环境变量：

```yaml
services:
  chat2api:
    environment:
      - ENABLE_API_KEY=true
      - MANAGEMENT_API_SECRET=your-secret-key
      - API_PORT=8088
      - WEB_PORT=3001
```

## 数据持久化

容器使用卷挂载来持久化数据：

```yaml
volumes:
  - ./data:/app/data
```

数据目录结构：
```
data/
├── data.json          # 主配置文件
├── request-logs/      # 请求日志
└── logs/              # 应用日志
```

## 端口说明

- **8088**: OpenAI 兼容 API 代理端口
  - `POST /v1/chat/completions` - 聊天完成接口
  - `GET /v1/models` - 模型列表
  - `GET /health` - 健康检查

- **3001**: Web 管理界面端口
  - 提供可视化的管理界面
  - 配置提供商和账户
  - 查看日志和统计

## 健康检查

容器包含健康检查，每 30 秒检查一次服务状态：

```bash
docker ps
```

查看健康状态。

## 日志

查看容器日志：
```bash
docker logs chat2api-manager
```

实时查看日志：
```bash
docker logs -f chat2api-manager
```

## 停止和清理

停止服务：
```bash
docker-compose down
```

停止并删除数据卷：
```bash
docker-compose down -v
```

## 故障排查

### 容器无法启动

1. 检查端口是否被占用：
```bash
netstat -tulpn | grep 8088
netstat -tulpn | grep 3001
```

2. 查看容器日志：
```bash
docker logs chat2api-manager
```

### 数据目录权限问题

确保数据目录有正确的权限：
```bash
chmod -R 755 ./data
```

### 重新构建镜像

如果代码有更新，重新构建镜像：
```bash
docker-compose build
docker-compose up -d
```

## 生产环境建议

1. **使用反向代理**：建议使用 Nginx 或 Traefik 作为反向代理
2. **启用 HTTPS**：配置 SSL 证书保护数据传输
3. **设置资源限制**：在 docker-compose.yml 中添加资源限制
4. **定期备份**：定期备份 data 目录
5. **监控日志**：配置日志收集和监控

### 资源限制示例

```yaml
services:
  chat2api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## API 使用示例

### 聊天完成

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### 健康检查

```bash
curl http://localhost:8088/health
```

## 注意事项

1. Docker 部署版本不包含 Electron 桌面功能
2. 数据存储在挂载的卷中，删除容器不会丢失数据
3. 首次启动会自动创建数据目录
4. 建议定期备份数据目录
