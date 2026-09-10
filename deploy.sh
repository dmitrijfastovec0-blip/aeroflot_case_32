#!/usr/bin/env bash
# ==============================================================================
# Единый скрипт развертывания (Deploy) LineOps SVO на боевой сервер
# Использование:
#   ./deploy.sh                # Обычный деплой (сборка npm run build + rsync в /var/www/lineops)
#   ./deploy.sh --no-build     # Деплой готовой папки dist без пересборки
# ==============================================================================
set -euo pipefail
cd "$(dirname "$0")"

SERVER="${SERVER:-}"
TARGET_DIR="${TARGET_DIR:-/var/www/lineops}"

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

if [ -z "$SERVER" ]; then
    echo "Ошибка: задайте SERVER, например SERVER=root@example.com ./deploy.sh" >&2
    exit 1
fi

echo "=========================================================="
echo "🚀 Деплой SVO OTO Aeroflot на $SERVER"
echo "Целевая директория: $TARGET_DIR"
echo "Режим сборки: $( [ "$DO_BUILD" = true ] && echo "Автоматическая сборка (npm run build)" || echo "Пропуск сборки (--no-build)" )"
echo "=========================================================="

# Настройка SSH multiplexing (пароль/ключ запрашивается ровно один раз)
SSH_SOCKET="/tmp/lineops_deploy_ssh_mux.$$"
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
ssh $SSH_OPTS "$SERVER" "mkdir -p $TARGET_DIR /var/www/aeroflot_case"

# 3. Выгрузка фронтенда (dist/)
echo "🌐 Выгрузка файлов из dist/..."
rsync -avc --delete \
    dist/ \
    "${SERVER}:${TARGET_DIR}/"

# Зеркалирование для обратной совместимости старых ссылок
rsync -avc --delete \
    dist/ \
    "${SERVER}:/var/www/aeroflot_case/"

# 4. Права доступа
echo "🔒 Настройка прав доступа на сервере..."
ssh $SSH_OPTS "$SERVER" "chown -R www-data:www-data $TARGET_DIR /var/www/aeroflot_case && chmod -R 755 $TARGET_DIR /var/www/aeroflot_case"

echo "=========================================================="
echo "✅ Деплой LineOps SVO успешно завершен!"
echo "🌐 Приложение доступно: https://charg3d.ru/lineops/"
echo "=========================================================="
