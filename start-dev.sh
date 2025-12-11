#!/bin/bash

# Quick start script for local development

echo "🎬 Starting YouTube Feeds Development Environment"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if services are already running
MINIO_RUNNING=$(docker-compose ps -q minio 2>/dev/null)
NEO4J_RUNNING=$(docker-compose ps -q neo4j 2>/dev/null)

if [ -z "$MINIO_RUNNING" ] || [ -z "$NEO4J_RUNNING" ]; then
    echo "📦 Services not running. Running setup..."
    ./setup-local.sh
else
    echo "✅ Services already running"
    echo "  MinIO Console: http://localhost:9001"
    echo "  Neo4j Browser: http://localhost:7474"
fi

echo ""
echo "🚀 Starting YouTube Feeds app on http://localhost:6003"
echo ""

npm start
