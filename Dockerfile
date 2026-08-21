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

# FIX 1: "pip install --upgrade pip" hata diya —
# Koyeb ke cached layer me pip ka metadata corrupt tha (~ip prefix).
# pip 24 wheels build karne ke liye bilkul theek hai, upgrade zaroori nahi.
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt


# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM python:3.11-alpine

# Runtime libraries
# curl: health check | libxml2+libxslt: lxml | chromium: Playwright scraper
RUN apk add --no-cache \
        libxml2 \
        libxslt \
        curl \
        tzdata \
        chromium \
        nss \
        freetype \
        harfbuzz \
        ca-certificates \
        ttf-freefont \
        font-noto-emoji

# Non-root user banao
RUN addgroup -g 1001 appgroup \
 && adduser  -u 1001 -G appgroup -s /bin/sh -D appuser

WORKDIR /app

# Builder se pre-compiled wheels copy karo aur install karo
COPY --from=builder /wheels /wheels
COPY requirements.txt .

# FIX 2: rm -rf /wheels hata diya —
# Koyeb ka build filesystem bind-mounted dirs ko remove karne nahi deta (I/O error).
# Multi-stage build me /wheels final image me copy nahi hoti, size pe fark nahi.
RUN pip install --no-cache-dir --no-index --find-links /wheels -r requirements.txt

# Playwright: Alpine (musl) pe PyPI wheel nahi hota — pip se directly install karo
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 kyunki hum system chromium use karenge
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pip install --no-cache-dir playwright

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

# Playwright ko system Chromium use karwao (apna download na kare)
# Alpine me chromium binary /usr/bin/chromium pe hota hai
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# ── Port expose ───────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Docker HEALTHCHECK ────────────────────────────────────────────────────────
# Koyeb aur Docker dono is instruction ko use karte hain
# start-period=45s: Alpine + Python startup ko thoda zyada time
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# ── Start command ─────────────────────────────────────────────────────────────
CMD ["python", "run.py"]
