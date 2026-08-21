# ─────────────────────────────────────────────────────────────────────────────
# Multipurpose Tool — Production Dockerfile (Debian slim-bookworm based)
#
# NOTE: Alpine (musl libc) chhod diya — Playwright PyPI pe sirf manylinux
# (glibc) wheels publish karta hai, musllinux ke liye koi wheel exist nahi
# karta. Isiliye Debian slim use kar rahe hain.
#
# NOTE 2: "slim-bookworm" (Debian 12) pin kiya, "slim" (jo ab Debian 13/trixie
# resolve karta hai) nahi — trixie ke overlayfs pe dpkg doc-trim ek known
# "cross-device link" bug deta hai jo build fail kar deta hai.
#
# Build: docker build -t multipurpose-tool .
# Run:   docker run -p 8000:8000 --env-file .env multipurpose-tool
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM python:3.11-slim-bookworm AS builder

# Build tools — lxml compile karne ke liye
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libxml2-dev \
        libxslt1-dev \
        zlib1g-dev \
        libffi-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Requirements pehle copy karo (Docker layer cache optimize hoga)
COPY requirements.txt .

# FIX 1: "pip install --upgrade pip" nahi — pip jo bhi version aaye theek hai,
# upgrade karne ki zaroorat nahi (purane Alpine issue ka legacy fix, yahan bhi
# safe rehta hai).
# playwright yahan bhi wheel ban jaayega — Debian glibc pe manylinux wheel
# available hai, isliye normal flow me hi build ho jaayega.
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt


# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM python:3.11-slim-bookworm

# Runtime libraries
# curl: health check | libxml2+libxslt: lxml runtime
# chromium + deps: Playwright scraper (assamese_scraper.py)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxml2 \
        libxslt1.1 \
        curl \
        tzdata \
        chromium \
        ca-certificates \
        fonts-liberation \
        fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Non-root user banao (Debian syntax — Alpine ka addgroup/adduser nahi)
RUN groupadd -g 1001 appgroup \
 && useradd  -u 1001 -g appgroup -s /bin/sh -m appuser

WORKDIR /app

# Builder se pre-compiled wheels copy karo aur install karo
COPY --from=builder /wheels /wheels
COPY requirements.txt .

# FIX 2: rm -rf /wheels nahi karte — kuch build environments (Koyeb) bind-mounted
# dirs ko remove karne nahi dete (I/O error). Multi-stage build me /wheels agle
# layer me carry nahi hoti, image size pe koi fark nahi padta.
RUN pip install --no-cache-dir --no-index --find-links /wheels -r requirements.txt

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

# Playwright ko system Chromium use karwao — apna download na kare
# Debian me chromium binary /usr/bin/chromium pe hota hai
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# ── Port expose ───────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Docker HEALTHCHECK ────────────────────────────────────────────────────────
# start-period=60s: Chromium + Python dono ka startup thoda slow ho sakta hai
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# ── Start command ─────────────────────────────────────────────────────────────
CMD ["python", "run.py"]
