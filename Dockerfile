# ─────────────────────────────────────────────────────────────────────────────
# Multipurpose Tool — Production Dockerfile
# Build: docker build -t multipurpose-tool .
# Run:   docker run -p 8000:8000 --env-file .env multipurpose-tool
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

# Build dependencies (lxml ke liye gcc chahiye)
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libxml2-dev \
        libxslt1-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Requirements pehle copy karo (layer cache ke liye)
COPY requirements.txt .

# Wheels build karo aur /wheels me save karo
RUN pip install --upgrade pip \
 && pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt


# ── Stage 2: Production image ────────────────────────────────────────────────
FROM python:3.11-slim

# Runtime dependencies (lxml ke liye)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxml2 \
        libxslt1.1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user banao (security best practice)
RUN groupadd --gid 1001 appgroup \
 && useradd  --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

WORKDIR /app

# Builder se pre-built wheels install karo
COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links /wheels -r requirements.txt \
 && rm -rf /wheels requirements.txt

# Application code copy karo
COPY --chown=appuser:appgroup . .

# Non-root user switch
USER appuser

# ── Environment defaults ──────────────────────────────────────────────────────
# In sab ko Koyeb dashboard me override karo
ENV HOST=0.0.0.0 \
    PORT=8000 \
    DEBUG=false \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

# ── Port expose ───────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Health check (Docker + Koyeb dono ke liye) ───────────────────────────────
# 30s start period: app ko startup ka time deta hai
# 30s interval: har 30 second me check
# 10s timeout: agar 10s me response nahi to fail
# 3 retries: 3 baar fail ho to unhealthy mark karo
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# ── Startup command ───────────────────────────────────────────────────────────
# run.py use karo jo .env bhi load karta hai
CMD ["python", "run.py"]
