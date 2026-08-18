// Форматирование сим-часов симуляции (HH:MM:SS) для счетчиков задач.
export const formatSimClock = (sec: number): string => {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const formatSimMin = (sec: number): string => {
  const minutes = (Math.max(0, sec)) / 60;
  return `${(Math.round(minutes * 10) / 10).toFixed(1)} мин`;
};
