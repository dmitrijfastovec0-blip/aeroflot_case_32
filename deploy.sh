#!/usr/bin/env bash
# ==============================================================================
# Единый скрипт развертывания (Deploy) SVO OTO Aeroflot (vozduhan) на боевой сервер
# Использование:
#   ./deploy.sh                # Обычный деплой (сборка npm run build + rsync в /var/www/aeroflot_case)
#   ./deploy.sh --no-build     # Деплой готовой папки dist без пересборки
# ==============================================================================
set -euo pipefail
cd "$(dirname "$0")"

SERVER="${SERVER:-root@82.22.53.39}"
TARGET_DIR="/var/www/aeroflot_case"

DO_BUILD=true

# Парсинг аргументов
for arg in "$@"; do
    case "$arg" in
        --no-build)
            DO_BUILD=false
            ;;
        root@*|*.*.*.*)
            SERVER="$arg"
            ;;
    esac
done

echo "=========================================================="
echo "🚀 Деплой SVO OTO Aeroflot на $SERVER"
echo "Целевая директория: $TARGET_DIR"
echo "Режим сборки: $( [ "$DO_BUILD" = true ] && echo "Автоматическая сборка (npm run build)" || echo "Пропуск сборки (--no-build)" )"
echo "=========================================================="

# Настройка SSH multiplexing (пароль/ключ запрашивается ровно один раз)
SSH_SOCKET="/tmp/vozduhan_deploy_ssh_mux.$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_SOCKET} -o ControlPersist=600"
export RSYNC_RSH="ssh $SSH_OPTS"

cleanup_ssh() {
    ssh -O exit -o ControlPath="${SSH_SOCKET}" "$SERVER" 2>/dev/null || true
    rm -f "${SSH_SOCKET}" 2>/dev/null || true
}
trap cleanup_ssh EXIT INT TERM

# 1. Сборка проекта (Vite + TS)
if [ "$DO_BUILD" = true ]; then
    echo "⚙️ Сборка фронтенда (npm run build)..."
    npm run build
else
    echo "⏩ Пропуск сборки фронтенда (--no-build)"
fi

if [ ! -d "dist" ]; then
    echo "❌ Ошибка: Директория dist/ не найдена! Выполните сборку." >&2
    exit 1
fi

# 2. Подготовка директорий на сервере
echo "📁 Проверка структуры каталогов на сервере..."
ssh $SSH_OPTS "$SERVER" "mkdir -p $TARGET_DIR"

# 3. Выгрузка фронтенда (dist/)
echo "🌐 Выгрузка файлов из dist/..."
rsync -avc --delete \
    dist/ \
    "${SERVER}:${TARGET_DIR}/"

# 4. Права доступа
echo "🔒 Настройка прав доступа на сервере..."
ssh $SSH_OPTS "$SERVER" "chown -R www-data:www-data $TARGET_DIR && chmod -R 755 $TARGET_DIR"

echo "=========================================================="
echo "✅ Деплой SVO OTO Aeroflot успешно завершен!"
echo "🌐 Приложение развернуто в $TARGET_DIR на $SERVER"
echo "=========================================================="
