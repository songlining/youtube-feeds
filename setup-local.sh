#!/bin/bash

echo "🚀 Setting up YouTube Feeds local development environment..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Start services
echo -e "${BLUE}Starting MinIO and Neo4j...${NC}"
docker-compose up -d minio neo4j

# Wait for MinIO to be ready
echo -e "${BLUE}Waiting for MinIO to be ready...${NC}"
until curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; do
    echo "Waiting for MinIO..."
    sleep 2
done
echo -e "${GREEN}✓ MinIO is ready${NC}"

# Create bucket in MinIO
echo -e "${BLUE}Creating 'yt-rss' bucket in MinIO...${NC}"
docker run --rm --network youtube-feeds_default \
    -e MC_HOST_minio=http://minioadmin:minioadmin@minio:9000 \
    minio/mc mb minio/yt-rss --ignore-existing

# Set bucket policy to public read
echo -e "${BLUE}Setting bucket policy to public read...${NC}"
docker run --rm --network youtube-feeds_default \
    -e MC_HOST_minio=http://minioadmin:minioadmin@minio:9000 \
    minio/mc anonymous set download minio/yt-rss

echo -e "${GREEN}✓ MinIO bucket configured${NC}"

# Wait for Neo4j to be ready
echo -e "${BLUE}Waiting for Neo4j to be ready...${NC}"
until curl -sf http://localhost:7474 > /dev/null 2>&1; do
    echo "Waiting for Neo4j..."
    sleep 2
done
sleep 5  # Additional wait for Neo4j to fully initialize
echo -e "${GREEN}✓ Neo4j is ready${NC}"

# Create Neo4j constraints
echo -e "${BLUE}Creating Neo4j constraints...${NC}"
docker exec youtube-feeds-neo4j cypher-shell -u neo4j -p testpassword \
    "CREATE CONSTRAINT ON (f:Feed) ASSERT (f.id) IS NODE KEY;" 2>/dev/null || true

docker exec youtube-feeds-neo4j cypher-shell -u neo4j -p testpassword \
    "CREATE CONSTRAINT ON (f:Feeds) ASSERT (f.user_id) IS NODE KEY;" 2>/dev/null || true

docker exec youtube-feeds-neo4j cypher-shell -u neo4j -p testpassword \
    "CREATE CONSTRAINT ON (e:Episode) ASSERT (e.id) IS NODE KEY;" 2>/dev/null || true

echo -e "${GREEN}✓ Neo4j constraints created${NC}"

echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo "Access your services:"
echo "  📦 MinIO Console: http://localhost:9001 (minioadmin/minioadmin)"
echo "  🗄️  Neo4j Browser: http://localhost:7474 (neo4j/testpassword)"
echo ""
echo "To start the YouTube Feeds app:"
echo "  Option 1 (Docker):    docker-compose up youtube-feeds"
echo "  Option 2 (Local):     npm start"
echo ""
