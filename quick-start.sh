#!/bin/bash

# Chat2API Quick Start Script
# This script helps users get Chat2API running quickly with Docker

set -e

echo "🚀 Chat2API Quick Start"
echo "======================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first:"
    echo "   https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Build and start the application
echo "🔨 Building Docker image..."
docker-compose build

echo ""
echo "🚀 Starting Chat2API..."
docker-compose up -d

echo ""
echo "⏳ Waiting for Chat2API to start..."
sleep 15

# Check if container is running
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo "✅ Chat2API is running successfully!"
    echo ""
    echo "📋 Access Information:"
    echo "   🌐 Web Management: http://localhost:58080"
    echo "   🔍 Health Check: http://localhost:58080/health"
    echo "   📊 API Endpoint: http://localhost:58080/v1/chat/completions"
    echo ""
    echo "🔧 Management Commands:"
    echo "   📋 View logs: docker-compose logs -f chat2api"
    echo "   🛑 Stop: docker-compose down"
    echo "   🔄 Restart: docker-compose restart"
    echo "   📊 Status: docker-compose ps"
    echo ""
    echo "📁 Data Persistence:"
    echo "   📂 Config files: ./docker-data/config/"
    echo "   📂 Log files: ./docker-data/logs/"
    echo ""
    echo "💡 First-time setup:"
    echo "   1. Open http://localhost:58080 in your browser"
    echo "   2. Configure your AI providers in the desktop app"
    echo "   3. Generate API keys for your applications"
    echo "   4. Start using the OpenAI-compatible API!"
    echo ""
    echo "📖 For more information, see:"
    echo "   📚 README: https://github.com/narrator-z/Chat2API"
    echo "   🐳 Docker Guide: ./docker/README.md"
    echo ""
    echo "🎉 Happy AI coding with Chat2API!"
else
    echo ""
    echo "❌ Chat2API failed to start. Checking logs..."
    docker-compose logs chat2api
    exit 1
fi
