FROM ubuntu:24.04

WORKDIR /app

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    cmake \
    pkg-config \
    ca-certificates \
    xz-utils \
    librdkafka-dev \
    libhiredis-dev \
    libcivetweb-dev \
  && rm -rf /var/lib/apt/lists/*

COPY CMakeLists.txt ./
COPY src ./src
COPY scripts ./scripts

RUN chmod +x /app/scripts/check-fix-engine.sh

ENV ONIXS_SDK_TAR=/tmp/onixs-sdk.tar.xz
ENV ONIXS_PREFIX=/opt/onixs
ENV LD_LIBRARY_PATH=/opt/onixs/lib

CMD ["/bin/bash", "-lc", "set -euo pipefail; \
  echo '[fix-wrapper-cpp] boot'; \
  echo \"[fix-wrapper-cpp] sdk tar: $ONIXS_SDK_TAR\"; \
  if [ ! -f \"$ONIXS_SDK_TAR\" ]; then \
    echo \"[fix-wrapper-cpp] Missing SDK tar at $ONIXS_SDK_TAR (mount volume)\"; \
    ls -la /tmp || true; \
    sleep 3600; \
  fi; \
  if [ ! -d \"$ONIXS_PREFIX/include\" ] || [ ! -d \"$ONIXS_PREFIX/lib\" ]; then \
    echo '[fix-wrapper-cpp] Extracting OnixS SDK to /opt/onixs'; \
    rm -rf \"$ONIXS_PREFIX\"; \
    mkdir -p \"$ONIXS_PREFIX\"; \
    tar -xJf \"$ONIXS_SDK_TAR\" -C \"$ONIXS_PREFIX\" --strip-components=1 || { echo '[fix-wrapper-cpp] tar extract failed'; sleep 3600; }; \
  fi; \
  echo '[fix-wrapper-cpp] OnixS SDK layout:'; \
  ls -la \"$ONIXS_PREFIX\" || true; \
  ls -la \"$ONIXS_PREFIX/lib\" || true; \
  ls -la \"$ONIXS_PREFIX/include\" || true; \
  if [ ! -f \"$ONIXS_PREFIX/lib/libonixs-fix-engine.so\" ]; then \
    echo '[fix-wrapper-cpp] Missing libonixs-fix-engine.so after extract'; \
    sleep 3600; \
  fi; \
  if [ ! -f /app/build/fix-wrapper-cpp ]; then \
    echo '[fix-wrapper-cpp] Configuring & building...'; \
    rm -rf /app/build; \
    mkdir -p /app/build; \
    cd /app/build; \
    cmake .. || { echo '[fix-wrapper-cpp] cmake configure failed'; find . -maxdepth 3 -type f -name 'CMakeError.log' -o -name 'CMakeOutput.log' | xargs -r -n 1 sh -lc 'echo \"--- $1\"; sed -n \"1,200p\" \"$1\"' sh; sleep 3600; }; \
    cmake --build . -j || { echo '[fix-wrapper-cpp] build failed'; sleep 3600; }; \
  fi; \
  echo '[fix-wrapper-cpp] ldd:'; \
  ldd /app/build/fix-wrapper-cpp || true; \
  exec /app/build/fix-wrapper-cpp; \
"]
