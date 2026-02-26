#!/bin/bash
set -e

echo "--- [QA] INICIANDO VALIDAÇÃO DO MOTOR FIX ---"

# 0. Sanidade de dependências (antes de qualquer build)
if [ -f "/usr/include/librdkafka/rdkafkacpp.h" ]; then
    echo "✅ [SYS] Header librdkafka++ encontrado (/usr/include/librdkafka/rdkafkacpp.h)"
else
    echo "❌ [SYS] ERRO: Header librdkafka++ não encontrado (/usr/include/librdkafka/rdkafkacpp.h)" && exit 1
fi

if [ -f "/opt/onixs/include/OnixS/FIXEngine.h" ]; then
    echo "✅ [SDK] Header principal encontrado (/opt/onixs/include/OnixS/FIXEngine.h)"
else
    echo "❌ [SDK] ERRO: Header principal não encontrado (/opt/onixs/include/OnixS/FIXEngine.h)" && exit 1
fi

# 1. Verificar Headers da OnixS
if [ -f "/opt/onixs/include/OnixS/FIXEngine.h" ] || [ -d "/opt/onixs/include/OnixS/FIXEngine" ]; then
    echo "✅ [SDK] Headers encontrados em /opt/onixs/include"
else
    echo "❌ [SDK] ERRO: Headers não encontrados!" && exit 1
fi

# 2. Verificar Binários (.so)
if [ -f "/opt/onixs/lib/libonixs-fix-engine.so" ]; then
    echo "✅ [SDK] Biblioteca compartilhada .so encontrada"
else
    echo "❌ [SDK] ERRO: Biblioteca .so faltando!" && exit 1
fi

# 2.5 Garantir que o binário foi compilado
if [ ! -f "/app/build/fix-wrapper-cpp" ]; then
    echo "--- [QA] BINÁRIO AUSENTE: COMPILANDO /app/build/fix-wrapper-cpp ---"
    mkdir -p /app/build
    (cd /app/build && cmake .. && cmake --build . -j)
fi

# 3. Testar Linkagem Dinâmica (O Diamante)
echo "--- [QA] TESTANDO LINKAGEM DE DEPENDÊNCIAS ---"
LD_CHECK=$(ldd /app/build/fix-wrapper-cpp | grep "onixs" || true)
if [[ $LD_CHECK == *"not found"* ]] || [ -z "$LD_CHECK" ]; then
    echo "❌ [LINKER] ERRO: O binário não consegue encontrar a libonixs-fix-engine.so"
    exit 1
else
    echo "✅ [LINKER] Linkagem dinâmica resolvida com sucesso"
fi

# 4. Verificar Processo
if pgrep -f "fix-wrapper-cpp" > /dev/null; then
    echo "✅ [RUNTIME] Processo fix-wrapper-cpp está em execução"
else
    echo "❌ [RUNTIME] ERRO: Processo não encontrado!" && exit 1
fi

echo "--- [QA] MOTOR FIX VALIDADO COM SUCESSO ---"
