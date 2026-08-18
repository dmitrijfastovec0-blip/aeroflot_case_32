import React, { useState } from 'react';
import { Worker, ThemeMode } from '../types/index';
import { AIRCRAFT_DOWNTIME_COST_PER_MIN } from '../constants/index';
import {
  FastForward, Sun, Moon, Pause, Play, Settings2, Users,
  Wallet, TrendingDown, ShieldCheck, Rocket, ListChecks, Zap, Siren, AlertOctagon, Snowflake, RefreshCcw, ChevronDown
} from 'lucide-react';

interface HeaderProps {
  workers: Worker[];
  simSpeed: number;
  onSimSpeedChange: (speed: number) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenShiftConfig: () => void;
  roiMetrics: { completedCount: number; systemEtaSumMinutes: number; intuitiveEtaSumMinutes: number };
  onRunScenario: (scenarioId: string) => void;
}

const SCENARIOS = [
  { id: 'standard', label: '🟢 Стандартный день', icon: <Rocket className="w-3.5 h-3.5 text-emerald-400" /> },
  { id: 'series', label: '📋 Серия вызовов', icon: <ListChecks className="w-3.5 h-3.5 text-sky-400" /> },
  { id: 'peak', label: '💥 Час пик (10 бортов)', icon: <Zap className="w-3.5 h-3.5 text-amber-400" /> },
  { id: 'aog', label: '⚡ Срочный AOG-перехват', icon: <Siren className="w-3.5 h-3.5 text-rose-400" /> },
  { id: 'deficit', label: '⚠️ Кадровый дефицит', icon: <AlertOctagon className="w-3.5 h-3.5 text-orange-400" /> },
  { id: 'snow', label: '🌨️ Снегопад', icon: <Snowflake className="w-3.5 h-3.5 text-cyan-400" /> },
  { id: 'reset', label: '↺ Сброс смены', icon: <RefreshCcw className="w-3.5 h-3.5 text-red-400" /> }
];

export const Header: React.FC<HeaderProps> = ({
  workers,
  simSpeed,
  onSimSpeedChange,
  isPaused,
  onTogglePause,
  theme,
  onToggleTheme,
  onOpenShiftConfig,
  roiMetrics,
  onRunScenario
}) => {
  const [isScenarioOpen, setIsScenarioOpen] = useState(false);
  const [isRoiOpen, setIsRoiOpen] = useState(false);

  const totalWorkers = workers.length;
  const freeCount = workers.filter(w => w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING').length;
  const inTransitCount = workers.filter(w => w.status === 'IN_TRANSIT').length;
  const workingCount = workers.filter(w => w.status === 'WORKING_ON_SITE').length;

  const { completedCount, systemEtaSumMinutes, intuitiveEtaSumMinutes } = roiMetrics;
  const systemAvgMinutes = completedCount > 0 ? Math.round((systemEtaSumMinutes / completedCount) * 10) / 10 : 0;
  const manualAvgMinutes = completedCount > 0 ? Math.round((intuitiveEtaSumMinutes / completedCount) * 10) / 10 : 0;
  const savedMinutes = completedCount > 0 ? Math.max(0, Math.round((manualAvgMinutes - systemAvgMinutes) * completedCount * 10) / 10) : 0;
  const preventedLossRub = Math.round(savedMinutes * AIRCRAFT_DOWNTIME_COST_PER_MIN);

  const fmtRub = (n: number) => n.toLocaleString('ru-RU');
  const fmtMin = (n: number) => n.toFixed(1);

  return (
    <header className="h-14 min-h-[56px] px-4 flex items-center justify-between z-30 select-none transition-colors border-b backdrop-blur-md bg-opacity-90 dark:bg-[#070a0e]/95 bg-white/95 border-[#1e293b] dark:border-[#1e293b] border-slate-200">
      {/* 1. BRANDING & LOGO */}
      <div className="flex items-center space-x-3 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 font-black text-xl">
          ✈️
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white uppercase font-sans">
              Аэрофлот Техникс
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30">
              SVO ОТО
            </span>
          </div>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Ситуационный центр диспетчеризации (Бережливые технологии)
          </span>
        </div>
      </div>

      {/* 2. CENTER CONTROLS (SIM SPEED, PLAY/PAUSE, SCENARIOS) */}
      <div className="flex items-center space-x-2">
        {/* Play/Pause Button */}
        <button
          onClick={onTogglePause}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border font-mono font-bold text-xs transition-all cursor-pointer shadow-sm ${
            isPaused
              ? 'bg-amber-500/20 border-amber-500 text-amber-400 animate-pulse'
              : 'bg-slate-100 dark:bg-[#121820] border-slate-300 dark:border-[#263345] text-slate-800 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
              <span>▶ Старт</span>
            </>
          ) : (
            <>
              <Pause className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>⏸ Пауза</span>
            </>
          )}
        </button>

        {/* Speed Selector */}
        <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-[#121820] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#263345]">
          <FastForward className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="flex space-x-1 font-mono text-xs">
            {[1, 5, 10, 25].map(s => (
              <button
                key={s}
                onClick={() => onSimSpeedChange(s)}
                className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                  simSpeed === s
                    ? 'bg-amber-500/20 border border-amber-500 text-amber-400 font-bold'
                    : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Scenario Menu Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsScenarioOpen(!isScenarioOpen)}
            className="flex items-center space-x-1.5 bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#263345] text-xs font-mono font-bold text-slate-800 dark:text-gray-200 transition-colors cursor-pointer"
          >
            <Rocket className="w-3.5 h-3.5 text-sky-400" />
            <span>🎬 Сценарий</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          {isScenarioOpen && (
            <div className="absolute top-full left-0 mt-2 w-64 rounded-xl border bg-white dark:bg-[#121820] border-slate-300 dark:border-[#263345] shadow-2xl p-1.5 z-50 flex flex-col space-y-1 font-mono text-xs">
              {SCENARIOS.map(sc => (
                <button
                  key={sc.id}
                  onClick={() => {
                    onRunScenario(sc.id);
                    setIsScenarioOpen(false);
                  }}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 text-left transition-colors text-slate-800 dark:text-gray-200 cursor-pointer"
                >
                  {sc.icon}
                  <span className="font-semibold">{sc.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. RIGHT METRICS & SETTINGS */}
      <div className="flex items-center space-x-2.5">
        {/* ROI / Economic Summary Pill */}
        <div className="relative">
          <button
            onClick={() => setIsRoiOpen(!isRoiOpen)}
            className="flex items-center space-x-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition-all"
          >
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-bold text-emerald-400">{fmtRub(preventedLossRub)} ₽</span>
            <span className="text-gray-400 text-[10px] hidden lg:inline">(Экономия)</span>
          </button>
          {isRoiOpen && (
            <div className="absolute top-full right-0 mt-2 w-80 rounded-xl border bg-white dark:bg-[#121820] border-slate-300 dark:border-[#263345] shadow-2xl p-4 z-50 flex flex-col space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-[#263345]">
                <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-sky-400" /> Экономическая модель
                </span>
                <span className="text-sky-400 font-bold">SLA: 15 мин</span>
              </div>
              <div className="flex flex-col space-y-1.5 text-slate-600 dark:text-gray-300">
                <div className="flex justify-between">
                  <span>Закрыто вызовов:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{completedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ручной диспетчер (сред.):</span>
                  <span className="font-bold text-amber-400">{manualAvgMinutes > 0 ? `${fmtMin(manualAvgMinutes)} мин` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Система ОТО (сред.):</span>
                  <span className="font-bold text-emerald-400">{systemAvgMinutes > 0 ? `${fmtMin(systemAvgMinutes)} мин` : '—'}</span>
                </div>
                <div className="flex justify-between border-t pt-2 border-slate-200 dark:border-[#263345]">
                  <span>Сокращение простоя:</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5" /> -{fmtMin(savedMinutes)} мин
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Shift Personnel Button */}
        <button
          onClick={onOpenShiftConfig}
          className="flex items-center space-x-2 bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#263345] text-xs font-mono font-medium text-slate-800 dark:text-gray-200 transition-colors cursor-pointer"
        >
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span>Смена: <b className="text-emerald-400">{totalWorkers} чел</b></span>
          <Settings2 className="w-3 h-3 text-gray-400" />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-[#263345] text-slate-800 dark:text-gray-200 transition-colors cursor-pointer"
          title="Переключить тему (Light/Dark)"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-600" />}
        </button>
      </div>
    </header>
  );
};

export default Header;
