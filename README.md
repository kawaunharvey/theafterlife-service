# the-afterlife-service

## Local Redis

Run Redis locally with Docker:

```bash
docker compose up -d redis
```

Local defaults (development):

- REDIS_HOST=127.0.0.1
- REDIS_PORT=6379
- REDIS_PASSWORD is optional

Production (Upstash):

- UPSTASH_REDIS_HOST
- UPSTASH_REDIS_PORT
- UPSTASH_REDIS_PASSWORD
