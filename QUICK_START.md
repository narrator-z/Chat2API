# 🚀 Chat2API Quick Start Guide

## 📋 Prerequisites

- [Docker](https://docs.docker.com/get-docker/) 20.10+
- [Docker Compose](https://docs.docker.com/compose/install/) 2.0+

## ⚡ One-Command Start

```bash
# Clone and start in one command
git clone https://github.com/narrator-z/Chat2API.git && cd Chat2API && ./quick-start.sh
```

## 🐳 Manual Start

```bash
# 1. Clone the repository
git clone https://github.com/narrator-z/Chat2API.git
cd Chat2API

# 2. Start with Docker Compose
docker-compose up -d

# 3. Check status
docker-compose ps

# 4. View logs
docker-compose logs -f chat2api
```

## 🌐 Access Chat2API

Once running, access:

- **Web Management**: http://localhost:58080
- **API Endpoint**: http://localhost:58080/v1/chat/completions
- **Health Check**: http://localhost:58080/health

## 🎯 First Time Setup

1. **Open Web Interface**
   ```
   http://localhost:58080
   ```

2. **Configure AI Providers**
   - Add your API keys for DeepSeek, GLM, Kimi, etc.
   - Test connections to ensure they work

3. **Generate API Keys**
   - Create keys for your applications
   - Set usage limits and restrictions

4. **Start Using**
   - Use any OpenAI-compatible client
   - Point to `http://localhost:58080`

## 🔧 Common Commands

```bash
# View logs
docker-compose logs -f chat2api

# Restart service
docker-compose restart chat2api

# Stop service
docker-compose down

# Update and rebuild
git pull
docker-compose build --no-cache
docker-compose up -d

# Access container shell
docker-compose exec chat2api bash

# Check resource usage
docker stats chat2api
```

## 📁 Data Persistence

Your data is stored in:
- **Config**: `./docker-data/config/`
- **Logs**: `./docker-data/logs/`

These directories are automatically created and persist across container restarts.

## 🔒 Security

- Default port: 58080 (auto-detects conflicts)
- Web management password protection (optional)
- API key authentication
- Container runs as non-root user

## 🆘 Troubleshooting

### Port Already in Use
Chat2API automatically detects port conflicts and uses an available port. Check the logs for the actual port.

```bash
docker-compose logs chat2api | grep "port"
```

### Container Won't Start
```bash
# Check logs
docker-compose logs chat2api

# Check system resources
docker system df
docker system prune
```

### Can't Access Web Interface
```bash
# Check if container is running
docker-compose ps

# Check port mapping
docker-compose port chat2api 58080
```

## 📚 More Information

- **Full Documentation**: [README.md](README.md)
- **Docker Guide**: [docker/README.md](docker/README.md)
- **Original Project**: [xiaoY233/Chat2API](https://github.com/xiaoY233/Chat2API)
- **Enhanced by**: [narrator-z](https://github.com/narrator-z)

## 🤝 Contributing

This is an enhanced version of the original Chat2API project. Contributions are welcome!

---

**Original Author**: [xiaoY233](https://github.com/xiaoY233)  
**Enhanced by**: [narrator-z](https://github.com/narrator-z)  
**License**: GPL-3.0
