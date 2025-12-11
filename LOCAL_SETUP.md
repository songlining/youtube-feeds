# Local Development Setup

This guide shows you how to run the YouTube Feeds app locally using **MinIO** (S3-compatible storage) and **Neo4j** instead of AWS and cloud services.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ installed
- Git

## Quick Start

### 1. Run the Setup Script

This script will start MinIO and Neo4j, create the required bucket, and configure Neo4j constraints:

```bash
./setup-local.sh
```

This will:
- Start MinIO on ports 9000 (API) and 9001 (Console)
- Start Neo4j on ports 7474 (HTTP) and 7687 (Bolt)
- Create the `yt-rss` bucket in MinIO
- Set public read permissions on the bucket
- Create Neo4j database constraints

### 2. Start the App

**Option A: Run locally (recommended for development)**
```bash
npm install
npm start
```

**Option B: Run in Docker**
```bash
docker-compose up youtube-feeds
```

### 3. Access the Services

- **YouTube Feeds App**: http://localhost:6003
- **MinIO Console**: http://localhost:9001 (login: minioadmin/minioadmin)
- **Neo4j Browser**: http://localhost:7474 (login: neo4j/testpassword)

## What is MinIO?

MinIO is a high-performance, S3-compatible object storage system. It's:
- 100% compatible with AWS S3 API
- Perfect for local development and testing
- Open source and free
- Runs in a lightweight Docker container

### Why MinIO for Local Development?

✅ No AWS account needed
✅ No cloud costs
✅ Fast local storage
✅ Same S3 API as AWS
✅ Easy to reset/clean data

## Manual Setup (Alternative)

If you prefer to set things up manually:

### Start Services

```bash
docker-compose up -d minio neo4j
```

### Create MinIO Bucket

```bash
# Install MinIO client
brew install minio/stable/mc  # macOS
# or download from https://min.io/docs/minio/linux/reference/minio-mc.html

# Configure MinIO client
mc alias set local http://localhost:9000 minioadmin minioadmin

# Create bucket
mc mb local/yt-rss

# Set public read policy
mc anonymous set download local/yt-rss
```

### Configure Neo4j

Access Neo4j Browser at http://localhost:7474 and run:

```cypher
CREATE CONSTRAINT ON (f:Feed)
ASSERT (f.id) IS NODE KEY;

CREATE CONSTRAINT ON (f:Feeds)
ASSERT (f.user_id) IS NODE KEY;

CREATE CONSTRAINT ON (e:Episode)
ASSERT (e.id) IS NODE KEY;
```

## Configuration Files

### For Running App Locally
`controller/env.json` - Uses `localhost` for MinIO and Neo4j

```json
{
    "object_storage": {
        "accessKeyId": "minioadmin",
        "secretAccessKey": "minioadmin",
        "endpoint": "http://localhost:9000",
        "bucket_url": "http://localhost:9000/yt-rss/"
    },
    "neo4j": {
        "url": "http://localhost:7474/db/data/transaction/commit",
        "username": "neo4j",
        "password": "testpassword"
    }
}
```

### For Running in Docker
Update env.json to use Docker service names (`minio`, `neo4j`) instead of `localhost`

## Testing the App

### 1. Add a Playlist

```bash
# Get a YouTube playlist ID, for example: PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M
curl -X GET http://localhost:6003/api/playlist/PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M
```

### 2. Get the RSS Feed

```bash
curl -X GET http://localhost:6003/api/feed/PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M
```

### 3. View in Browser

Open http://localhost:6003 and use the web interface

### 4. Check MinIO Storage

1. Go to http://localhost:9001
2. Login with `minioadmin` / `minioadmin`
3. Click on "Buckets" → "yt-rss" to see uploaded audio files

### 5. Check Neo4j Data

1. Go to http://localhost:7474
2. Login with `neo4j` / `testpassword`
3. Run queries like:
   ```cypher
   MATCH (f:Feed) RETURN f;
   MATCH (e:Episode) RETURN e LIMIT 10;
   ```

## Useful Commands

### Stop Services
```bash
docker-compose down
```

### Stop and Remove Data
```bash
docker-compose down -v
```

### View Logs
```bash
# MinIO logs
docker-compose logs -f minio

# Neo4j logs
docker-compose logs -f neo4j

# App logs
docker-compose logs -f youtube-feeds
```

### Reset Everything
```bash
# Stop and remove all data
docker-compose down -v

# Run setup again
./setup-local.sh
```

## Troubleshooting

### MinIO Connection Issues

If you see errors like "Could not connect to MinIO":

1. Check MinIO is running:
   ```bash
   docker-compose ps minio
   ```

2. Check MinIO is accessible:
   ```bash
   curl http://localhost:9000/minio/health/live
   ```

3. Verify bucket exists:
   ```bash
   mc ls local/
   ```

### Neo4j Connection Issues

1. Check Neo4j is running:
   ```bash
   docker-compose ps neo4j
   ```

2. Check Neo4j is accessible:
   ```bash
   curl http://localhost:7474
   ```

3. Verify credentials in env.json match Neo4j settings

### Port Conflicts

If ports 9000, 9001, 7474, or 6003 are already in use, edit `docker-compose.yml` to use different ports.

## Switching to AWS S3 Later

When you're ready to deploy to production with AWS S3, just update `env.json`:

```json
{
    "object_storage": {
        "accessKeyId": "YOUR_AWS_ACCESS_KEY",
        "secretAccessKey": "YOUR_AWS_SECRET_KEY",
        "endpoint": "s3.us-east-1.amazonaws.com",
        "bucket_url": "https://s3.us-east-1.amazonaws.com/your-bucket/"
    },
    "neo4j": {
        "url": "http://your-neo4j-host:7474/db/data/transaction/commit",
        "username": "neo4j",
        "password": "your-password"
    }
}
```

The code works identically with both MinIO and AWS S3 since they use the same API!

## Additional Resources

- [MinIO Documentation](https://min.io/docs/minio/linux/index.html)
- [Neo4j Documentation](https://neo4j.com/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
