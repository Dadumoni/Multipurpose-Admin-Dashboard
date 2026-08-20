# ─────────────────────────────────────────────────────────────────────────────
# Multipurpose Tool — Production Dockerfile (Alpine-based)
# Alpine use kar rahe hain kyunki Koyeb ke build environment me
# python:slim (Debian 13) ka /usr/share/doc cross-device link error deta hai.
#
# Build: docker build -t multipurpose-tool .
# Run:   docker run -p 8000:8000 --env-file .env multipurpose-tool
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM python:3.11-alpine AS builder

# Alpine me build tools — lxml compile karne ke liye
RUN apk add --no-cache \
        gcc \
        musl-dev \
        libxml2-dev \
        libxslt-dev \
        zlib-dev \
        libffi-dev \
        openssl-dev

WORKDIR /build

# Requirements pehle copy karo (Docker layer cache optimize hoga)
COPY requirements.txt .

# Saare packages ke wheels build karo
RUN pip install --upgrade pip \
 && pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt


# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM python:3.11-alpine

# Sirf runtime libraries — build tools nahi (image choti rahegi)
# curl: health check ke liye
# libxml2 + libxslt: lxml runtime ke liye
RUN apk add --no-cache \
        libxml2 \
        libxslt \
        curl \
        tzdata

# Non-root user banao
RUN addgroup -g 1001 appgroup \
 && adduser  -u 1001 -G appgroup -s /bin/sh -D appuser

WORKDIR /app

# Builder se pre-compiled wheels copy karo aur install karo
COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links /wheels -r requirements.txt \
 && rm -rf /wheels requirements.txt

# Application code copy karo (non-root ownership)
COPY --chown=appuser:appgroup . .

# Non-root user switch karo
USER appuser

# ── Environment defaults (Koyeb dashboard me override karo) ──────────────────
ENV HOST=0.0.0.0 \
    PORT=8000 \
    DEBUG=false \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    TZ=Asia/Kolkata

# ── Port expose ───────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Docker HEALTHCHECK ────────────────────────────────────────────────────────
# Koyeb aur Docker dono is instruction ko use karte hain
# start-period=45s: Alpine + Python startup ko thoda zyada time
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# ── Start command ─────────────────────────────────────────────────────────────
CMD ["python", "run.py"]
