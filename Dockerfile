# ============================================================
# Dockerfile — ApnaGreenBasket Backend Only
# Target: linux/arm64 (AWS Graviton EC2)
# 
# Runs: FastAPI + Uvicorn
# DB:   External AWS RDS PostgreSQL
# ============================================================

FROM python:3.11-slim

# System deps for asyncpg, Pillow (qrcode), argon2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY pyproject.toml ./
COPY seed.py ./

# Create uploads directory
RUN mkdir -p /app/uploads

# Startup script
COPY <<'EOF' /app/start.sh
#!/bin/bash
set -e

echo "━━━ Running Alembic migrations ━━━"
alembic upgrade head

echo "━━━ Starting FastAPI on :8000 ━━━"
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers ${UVICORN_WORKERS:-2}
EOF

RUN chmod +x /app/start.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

ENV APP_ENV=production
ENV DEBUG=false

CMD ["/app/start.sh"]
