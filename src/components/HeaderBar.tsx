import React from 'react';
import { Worker, ThemeMode } from '../types';
import { Users, FastForward, Sun, Moon, Pause, Play, Settings2 } from 'lucide-react';

interface HeaderBarProps {
  workers: Worker[];
  simSpeed: number;
  onSimSpeedChange: (speed: number) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenShiftConfig: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  workers,
  simSpeed,
  onSimSpeedChange,
  isPaused,
  onTogglePause,
  theme,
  onToggleTheme,
  onOpenShiftConfig
}) => {
  const totalWorkers = workers.length;
  const freeCount = workers.filter(w => w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING').length;
  const inTransitCount = workers.filter(w => w.status === 'IN_TRANSIT').length;
  const workingCount = workers.filter(w => w.status === 'WORKING_ON_SITE').length;

  return (
    <header className="h-[54px] min-h-[54px] bg-[#070a0e] dark:bg-[#070a0e] bg-white border-b border-[#263345] dark:border-[#263345] border-slate-300 flex items-center justify-between px-5 text-sm select-none transition-colors">
      {/* 1. Logo & Title */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#121820] dark:bg-[#121820] bg-slate-100 border border-[#263345] dark:border-[#263345] border-slate-300 text-sky-400 font-bold text-lg">
          ✈️
        </div>
        <div>
          <h1 className="font-bold text-base md:text-lg tracking-wide text-gray-100 dark:text-gray-100 text-slate-900 uppercase flex items-center gap-2">
            АЭРОФЛОТ <span className="text-gray-500 dark:text-gray-500 text-slate-400 font-normal">|</span> <span className="text-sky-400">ЦУП ОТО</span> — Шереметьево
          </h1>
        </div>
      </div>

      {/* 2. Controls & Clickable Shift Status */}
      <div className="flex items-center space-x-3">
        {/* Pause / Resume Button */}
        <button
          onClick={onTogglePause}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border font-mono font-bold text-xs md:text-sm transition-colors cursor-pointer ${
            isPaused
              ? 'bg-amber-500/20 border-amber-500 text-amber-400 animate-pulse'
              : 'bg-[#121820] dark:bg-[#121820] bg-slate-100 border-[#263345] dark:border-[#263345] border-slate-300 text-gray-200 dark:text-gray-200 text-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
          title="Поставить симуляцию на паузу или возобновить"
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
              <span>▶️ Старт</span>
            </>
          ) : (
            <>
              <Pause className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>⏸️ Пауза</span>
            </>
          )}
        </button>

        {/* Speed Multiplier Selector */}
        <div className="flex items-center space-x-2 bg-[#121820] dark:bg-[#121820] bg-slate-100 px-3 py-1.5 rounded-lg border border-[#263345] dark:border-[#263345] border-slate-300">
          <FastForward className="w-4 h-4 text-amber-400" />
          <span className="text-gray-400 dark:text-gray-400 text-slate-600 font-mono text-xs hidden sm:inline">Скорость:</span>
          <div className="flex space-x-1 font-mono text-xs">
            {[1, 5, 10, 25].map(s => (
              <button
                key={s}
                onClick={() => onSimSpeedChange(s)}
                className={`px-2.5 py-0.5 rounded border font-semibold transition-colors cursor-pointer ${
                  simSpeed === s
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400 dark:text-amber-300 font-bold'
                    : 'bg-transparent border-transparent text-gray-400 dark:text-gray-400 text-slate-500 hover:text-white dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* INTERACTIVE CLICKABLE SHIFT BADGE */}
        <button
          onClick={onOpenShiftConfig}
          className="flex items-center space-x-2 bg-[#121820] dark:bg-[#121820] bg-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-emerald-500/60 text-xs md:text-sm transition-colors cursor-pointer group shadow-sm"
          title="Нажмите для настройки состава смены и пересчета инженеров"
        >
          <Users className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span className="text-gray-300 dark:text-gray-300 text-slate-700 font-medium flex items-center gap-1">
            Смена: <span className="font-mono font-bold text-emerald-400 text-sm">{totalWorkers} чел.</span>
            <Settings2 className="w-3.5 h-3.5 text-gray-400 ml-1 group-hover:text-emerald-400" />
          </span>
          <span className="font-mono text-xs text-gray-400 dark:text-gray-400 text-slate-500 hidden lg:inline border-l border-slate-300 dark:border-[#263345] pl-2">
            (🟢 <span className="text-emerald-400 font-bold">{freeCount}</span> | 🔵 <span className="text-sky-400 font-bold">{inTransitCount}</span> | 🔴 <span className="text-red-400 font-bold">{workingCount}</span>)
          </span>
        </button>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="flex items-center space-x-2 bg-[#121820] dark:bg-[#121820] bg-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-[#263345] dark:border-[#263345] border-slate-300 text-gray-200 dark:text-gray-200 text-slate-800 font-medium text-xs md:text-sm transition-colors cursor-pointer"
          title="Переключить тему оформления (Light/Dark)"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span>☀️ Светлая</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-sky-600" />
              <span>🌙 Тёмная</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
