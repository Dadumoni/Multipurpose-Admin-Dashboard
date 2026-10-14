#!/bin/bash
set -e

# 1. Check if Node.js is already available in PATH
if command -v node >/dev/null 2>&1; then
  echo "[Launcher] Found system Node.js: $(node -v)"
  if command -v npm >/dev/null 2>&1; then
    exec npm start
  else
    exec node server.ts
  fi
fi

# 2. If running inside a pure Python buildpack environment without Node.js,
# automatically download and install portable Node.js v20 into /tmp/node
NODE_TARGET_DIR="/tmp/node-v20"
export PATH="$NODE_TARGET_DIR/bin:$HOME/.heroku/node/bin:$HOME/node_modules/.bin:$PATH"

if [ ! -f "$NODE_TARGET_DIR/bin/node" ]; then
  echo "[Launcher] Node.js not detected in buildpack image. Installing standalone Node.js LTS..."
  mkdir -p "$NODE_TARGET_DIR"
  ARCH="x64"
  if [ "$(uname -m)" = "aarch64" ]; then
    ARCH="arm64"
  fi
  NODE_URL="https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-${ARCH}.tar.gz"
  
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$NODE_URL" | tar -xz -C "$NODE_TARGET_DIR" --strip-components=1
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$NODE_URL" | tar -xz -C "$NODE_TARGET_DIR" --strip-components=1
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "
import urllib.request, tarfile, io
url = '$NODE_URL'
print('Downloading Node.js via Python...')
resp = urllib.request.urlopen(url)
with tarfile.open(fileobj=io.BytesIO(resp.read()), mode='r:gz') as tar:
    for member in tar.getmembers():
        parts = member.name.split('/', 1)
        if len(parts) > 1 and parts[1]:
            member.name = parts[1]
            tar.extract(member, path='$NODE_TARGET_DIR')
"
  fi
fi

if [ -f "$NODE_TARGET_DIR/bin/node" ]; then
  export PATH="$NODE_TARGET_DIR/bin:$PATH"
  echo "[Launcher] Successfully initialized Node.js: $($NODE_TARGET_DIR/bin/node -v)"
  
  # Ensure dependencies are available
  if [ ! -d "node_modules" ]; then
    echo "[Launcher] Installing npm dependencies..."
    "$NODE_TARGET_DIR/bin/npm" install --legacy-peer-deps
  fi

  # Build frontend if dist/ does not exist
  if [ ! -d "dist" ]; then
    echo "[Launcher] Building frontend dist..."
    "$NODE_TARGET_DIR/bin/npm" run build
  fi

  exec "$NODE_TARGET_DIR/bin/npm" start
fi

echo "Error: Failed to initialize Node.js runtime."
exit 1
