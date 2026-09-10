#!/usr/bin/env bash
# ==============================================================================
# Скрипт локального запуска среды разработки (Dev Server)
# Проект: «Воздухан» — SVO OTO Aeroflot (Оперативное ТО ВС)
#
# Использование:
#   ./dev.sh                # Обычный запуск на порту 5173
#   ./dev.sh --open         # Запуск с автоматическим открытием в браузере
#   ./dev.sh --host         # Доступ по локальной сети (0.0.0.0)
#   ./dev.sh --port 3000    # Запуск на выбранном порту
#   ./dev.sh --test         # Запуск unit-тестов перед стартом сервера
#   ./dev.sh --install      # Принудительная установка/обновление зависимостей
#   ./dev.sh --help         # Показать справку по параметрам
# ==============================================================================

set -euo pipefail
cd "$(dirname "$0")"

# Цветовая палитра для терминала
CLR_RESET="\033[0m"
CLR_BOLD="\033[1m"
CLR_GREEN="\033[1;32m"
CLR_BLUE="\033[1;34m"
CLR_CYAN="\033[1;36m"
CLR_YELLOW="\033[1;33m"
CLR_RED="\033[1;31m"
CLR_GRAY="\033[0;90m"

# Значения по умолчанию
PORT=5173
HOST_FLAG=""
OPEN_FLAG=""
RUN_TESTS=false
FORCE_INSTALL=false
RUN_BUILD_CHECK=false

print_banner() {
  echo -e "${CLR_CYAN}${CLR_BOLD}"
  echo "======================================================================"
  echo "  ✈️  ВОЗДУХАН | SVO OTO AEROFLOT — Среда локальной разработки"
  echo "  Система умной диспетчеризации оперативного техобслуживания ВС"
  echo "======================================================================"
  echo -e "${CLR_RESET}"
}

print_help() {
  print_banner
  echo -e "${CLR_BOLD}Использование:${CLR_RESET}"
  echo "  ./dev.sh [ОПЦИИ]"
  echo ""
  echo -e "${CLR_BOLD}Опции:${CLR_RESET}"
  echo "  -p, --port <порт>    Задать локальный порт сервера (по умолчанию: 5173)"
  echo "  -H, --host           Открыть доступ по локальной сети (0.0.0.0)"
  echo "  -o, --open           Автоматически открыть приложение в браузере"
  echo "  -t, --test           Запустить vitest тесты перед стартом сервера"
  echo "  -b, --build          Проверить TypeScript и production сборку перед стартом"
  echo "  -i, --install        Принудительно выполнить npm install перед запуском"
  echo "  -c, --clean          Очистить кэш сборки (директорию dist/ и кэш vite)"
  echo "  -h, --help           Показать эту справку и выйти"
  echo ""
  echo -e "${CLR_BOLD}Примеры:${CLR_RESET}"
  echo "  ./dev.sh --open"
  echo "  ./dev.sh --port 8080 --host"
  echo "  ./dev.sh --test --open"
  echo ""
  exit 0
}

# Парсинг аргументов
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--port)
      if [[ -n "${2:-}" && ! "$2" =~ ^- ]]; then
        PORT="$2"
        shift 2
      else
        echo -e "${CLR_RED}❌ Ошибка: параметр --port требует числового значения порта!${CLR_RESET}" >&2
        exit 1
      fi
      ;;
    -H|--host)
      HOST_FLAG="--host"
      shift
      ;;
    -o|--open)
      OPEN_FLAG="--open"
      shift
      ;;
    -t|--test)
      RUN_TESTS=true
      shift
      ;;
    -b|--build)
      RUN_BUILD_CHECK=true
      shift
      ;;
    -i|--install)
      FORCE_INSTALL=true
      shift
      ;;
    -c|--clean)
      echo -e "${CLR_YELLOW}🧹 Очистка кэша сборки...${CLR_RESET}"
      rm -rf dist node_modules/.vite
      echo -e "${CLR_GREEN}✅ Кэш очищен.${CLR_RESET}"
      shift
      ;;
    -h|--help)
      print_help
      ;;
    *)
      echo -e "${CLR_RED}❌ Неизвестный параметр: $1${CLR_RESET}" >&2
      echo "Используйте ./dev.sh --help для просмотра списка параметров." >&2
      exit 1
      ;;
  esac
done

print_banner

# 1. Проверка системного окружения
echo -e "${CLR_BLUE}🔍 [1/4] Проверка системного окружения...${CLR_RESET}"

if ! command -v node &> /dev/null; then
  echo -e "${CLR_RED}❌ Ошибка: Node.js не найден в системе! Установите Node.js версии 18 или новее.${CLR_RESET}" >&2
  exit 1
fi

NODE_VER=$(node -v)
echo -e "   • Node.js:  ${CLR_GREEN}${NODE_VER}${CLR_RESET}"

if ! command -v npm &> /dev/null; then
  echo -e "${CLR_RED}❌ Ошибка: npm не найден в системе!${CLR_RESET}" >&2
  exit 1
fi

NPM_VER=$(npm -v)
echo -e "   • npm:      ${CLR_GREEN}v${NPM_VER}${CLR_RESET}"

# 2. Проверка и установка зависимостей
echo -e "\n${CLR_BLUE}📦 [2/4] Проверка зависимостей проекта...${CLR_RESET}"

if [ "$FORCE_INSTALL" = true ]; then
  echo -e "${CLR_YELLOW}⚡ Выполняется принудительная установка зависимостей (npm install)...${CLR_RESET}"
  npm install
elif [ ! -d "node_modules" ]; then
  echo -e "${CLR_YELLOW}⚠️  Папка node_modules не обнаружена. Запускаем npm install...${CLR_RESET}"
  npm install
  echo -e "${CLR_GREEN}✅ Зависимости успешно установлены.${CLR_RESET}"
else
  echo -e "   • Зависимости: ${CLR_GREEN}node_modules готовы${CLR_RESET}"
fi

# 3. Дополнительные проверки (тесты и сборка)
if [ "$RUN_TESTS" = true ]; then
  echo -e "\n${CLR_BLUE}🧪 [3/4] Запуск автоматических тестов (vitest)...${CLR_RESET}"
  npm test
  echo -e "${CLR_GREEN}✅ Все тесты успешно пройдены!${CLR_RESET}"
elif [ "$RUN_BUILD_CHECK" = true ]; then
  echo -e "\n${CLR_BLUE}⚙️  [3/4] Проверка сборки TypeScript и Vite...${CLR_RESET}"
  npm run build
  echo -e "${CLR_GREEN}✅ Сборка успешно завершена!${CLR_RESET}"
else
  echo -e "\n${CLR_GRAY}⏩ [3/4] Пропуск предварительных тестов (используйте --test для проверки)${CLR_RESET}"
fi

# 4. Запуск сервера разработки
echo -e "\n${CLR_BLUE}🚀 [4/4] Запуск локального Vite сервера разработки...${CLR_RESET}"
echo -e "   • Порт:     ${CLR_CYAN}${PORT}${CLR_RESET}"
if [ -n "$HOST_FLAG" ]; then
  echo -e "   • Доступ:   ${CLR_CYAN}0.0.0.0 (вся локальная сеть)${CLR_RESET}"
else
  echo -e "   • Доступ:   ${CLR_CYAN}localhost (только этот компьютер)${CLR_RESET}"
fi
echo -e "   • Остановка: ${CLR_YELLOW}Нажмите Ctrl + C для завершения${CLR_RESET}"
echo -e "${CLR_GRAY}----------------------------------------------------------------------${CLR_RESET}\n"

# Обработка корректного завершения
cleanup() {
  echo -e "\n\n${CLR_YELLOW}🛑 Сервер разработки остановлен.${CLR_RESET}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# Запуск Vite с переданными аргументами
# shellcheck disable=SC2086
exec npx vite --port "$PORT" $HOST_FLAG $OPEN_FLAG
