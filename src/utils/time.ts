/**
 * ============================================================================
 * УТИЛИТЫ ФОРМАТИРОВАНИЯ ВРЕМЕНИ СИМУЛЯЦИИ (TIME UTILS)
 * ----------------------------------------------------------------------------
 * Преобразует виртуальные секунды симуляции перрона в человекочитаемый вид:
 * - formatSimClock: формат электронных часов (HH:MM:SS)
 * - formatSimMin: форматирование минут с десятыми долями (например, "12.4 мин")
 * ============================================================================
 */

/**
 * Форматирует секунды виртуальных часов симуляции в вид HH:MM:SS.
 * 
 * @param sec Время в секундах
 * @returns Строка в формате HH:MM:SS (например, "02:15:40")
 */
export const formatSimClock = (sec: number): string => {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * Преобразует секунды в минуты с округлением до одного десятичного знака.
 * 
 * @param sec Длительность в секундах
 * @returns Строка вида "12.5 мин"
 */
export const formatSimMin = (sec: number): string => {
  const minutes = Math.max(0, sec) / 60;
  return `${(Math.round(minutes * 10) / 10).toFixed(1)} мин`;
};
