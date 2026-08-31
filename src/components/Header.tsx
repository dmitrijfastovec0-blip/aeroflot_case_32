import React, { useState } from 'react';
import { Worker, ThemeMode, WeatherMode, AirfieldMode } from '../types/index';
import { AIRCRAFT_DOWNTIME_COST_PER_MIN } from '../constants/index';
import { WeatherWidget } from './WeatherWidget';
import {
  FastForward, Sun, Moon, Pause, Play, Settings2, Users,
  Wallet, TrendingDown, ShieldCheck, Rocket, ListChecks, Zap, Siren, AlertOctagon, Snowflake, RefreshCcw, ChevronDown, BarChart3, Clock, MapPin, Sliders
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
  onOpenLocationBuilder?: () => void;
  airfieldMode?: AirfieldMode;
  onToggleAirfieldMode?: () => void;
  roiMetrics: { completedCount: number; systemEtaSumMinutes: number; intuitiveEtaSumMinutes: number };
  onRunScenario: (scenarioId: string) => void;
  weatherMode: WeatherMode;
  onWeatherChange: (mode: WeatherMode) => void;
  onOpenAnalytics: () => void;
  onOpenTimeline?: () => void;
}

const SCENARIOS = [
  { id: 'standard', label: 'Базовый день', icon: <Rocket className="w-4 h-4 text-emerald-400" /> },
  { id: 'series', label: 'Серия вызовов', icon: <ListChecks className="w-4 h-4 text-sky-400" /> },
  { id: 'peak', label: 'Пиковая нагрузка', icon: <Zap className="w-4 h-4 text-amber-400" /> },
  { id: 'hellish', label: '🔥 Адский пик (66 вызовов)', icon: <Zap className="w-4 h-4 text-rose-500 animate-pulse" /> },
  { id: 'aog', label: 'AOG Перехват', icon: <Siren className="w-4 h-4 text-rose-400" /> },
  { id: 'deficit', label: 'Кадровый дефицит', icon: <AlertOctagon className="w-4 h-4 text-orange-400" /> },
  { id: 'reset', label: 'Смена ПТО', icon: <RefreshCcw className="w-4 h-4 text-red-400" /> }
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
  onOpenLocationBuilder,
  airfieldMode = 'SVO',
  onToggleAirfieldMode,
  roiMetrics,
  onRunScenario,
  weatherMode,
  onWeatherChange,
  onOpenAnalytics,
  onOpenTimeline
}) => {
  const [isScenarioOpen, setIsScenarioOpen] = useState(false);
  const [isRoiOpen, setIsRoiOpen] = useState(false);

  const { completedCount, systemEtaSumMinutes, intuitiveEtaSumMinutes } = roiMetrics;
  const systemAvgMinutes = completedCount > 0 ? Math.round((systemEtaSumMinutes / completedCount) * 10) / 10 : 0;
  const manualAvgMinutes = completedCount > 0 ? Math.round((intuitiveEtaSumMinutes / completedCount) * 10) / 10 : 0;
  const savedMinutes = completedCount > 0 ? Math.max(0, Math.round((manualAvgMinutes - systemAvgMinutes) * completedCount * 10) / 10) : 0;
  const preventedLossRub = Math.round(savedMinutes * AIRCRAFT_DOWNTIME_COST_PER_MIN);

  const fmtRub = (n: number) => n.toLocaleString('ru-RU');
  const fmtMin = (n: number) => n.toFixed(1);

  return (
    <header className="h-14 min-h-[56px] max-h-[56px] px-4 flex items-center justify-between z-30 select-none transition-colors border-b backdrop-blur-md bg-opacity-90 dark:bg-[#070a0e]/95 bg-white/95 border-[#1e293b] dark:border-[#1e293b] border-slate-200 shrink-0 overflow-hidden">
      <div className="flex items-center space-x-3 shrink-0 font-mono">
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-xl border border-slate-300 dark:border-[#263345] bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-slate-800 text-amber-500 dark:text-sky-400 transition-all cursor-pointer shadow-sm"
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-600" />}
        </button>

        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 font-black text-base">
            ✈️
          </div>
          <span className="font-extrabold text-sm tracking-wider text-slate-900 dark:text-white uppercase whitespace-nowrap">
            АЭРОФЛОТ
          </span>
        </div>

        {onToggleAirfieldMode && (
          <button
            onClick={onToggleAirfieldMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              airfieldMode === 'CUSTOM'
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md'
                : 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
            }`}
            title="Переключить между базовым SVO и испытательным полигоном"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{airfieldMode === 'CUSTOM' ? 'Полигон' : '📍 SVO'}</span>
          </button>
        )}
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        <button
          onClick={onTogglePause}
          className={`p-2 rounded-lg border transition-all cursor-pointer shadow-sm ${
            isPaused
              ? 'bg-amber-500/20 border-amber-500 text-amber-400'
              : 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
          }`}
          title={isPaused ? 'Возобновить симуляцию' : 'Пауза симуляции'}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        </button>

        <div className="flex items-center bg-slate-100 dark:bg-[#121820] p-1 rounded-lg border border-slate-300 dark:border-[#263345]">
          {[1, 10, 50].map(speed => (
            <button
              key={speed}
              onClick={() => onSimSpeedChange(speed)}
              className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                simSpeed === speed
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            onClick={() => setIsScenarioOpen(!isScenarioOpen)}
            className="flex items-center space-x-1.5 bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#263345] text-sm font-mono font-bold text-slate-800 dark:text-gray-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Rocket className="w-4 h-4 text-sky-400" />
            <span>Сценарии</span>
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

      <div className="flex items-center space-x-2">
        <div className="relative">
          <button
            onClick={() => setIsRoiOpen(!isRoiOpen)}
            className="flex items-center space-x-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-sm font-mono cursor-pointer transition-all"
          >
            <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold text-emerald-400 tabular-nums">{fmtRub(preventedLossRub)} ₽</span>
            <span className="text-gray-400 text-xs hidden lg:inline">(Экономия)</span>
          </button>
          {isRoiOpen && (
            <div className="absolute top-full right-0 mt-2 w-80 rounded-xl border bg-white dark:bg-[#121820] border-slate-300 dark:border-[#263345] shadow-2xl p-4 z-50 flex flex-col space-y-3 font-mono text-sm">
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
                    <TrendingDown className="w-4 h-4" /> -{fmtMin(savedMinutes)} мин
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <WeatherWidget
          weatherMode={weatherMode}
          onWeatherChange={onWeatherChange}
          theme={theme}
        />

        {onOpenTimeline && (
          <button
            onClick={onOpenTimeline}
            className="p-2 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 transition-all cursor-pointer shadow-sm"
            title="План-график вызовов ОТО (Гант)"
          >
            <Clock className="w-4 h-4 text-sky-400" />
          </button>
        )}

        <button
          onClick={onOpenAnalytics}
          className="p-2 rounded-lg border border-sky-500/40 bg-gradient-to-r from-sky-500/20 to-blue-600/20 hover:from-sky-500/30 hover:to-blue-600/30 text-sky-400 transition-all cursor-pointer shadow-sm"
          title="Сравнительная аналитика эффективности"
        >
          <BarChart3 className="w-4 h-4 text-sky-400" />
        </button>

        {onOpenLocationBuilder && (
          <button
            onClick={onOpenLocationBuilder}
            className="flex items-center space-x-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 px-3 py-1.5 rounded-lg text-sm font-mono font-bold text-amber-300 transition-all cursor-pointer shadow-sm"
            title="Открыть конструктор испытательного полигона"
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>Полигон</span>
          </button>
        )}

        <button
          onClick={onOpenShiftConfig}
          className="flex items-center space-x-1.5 bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#263345] text-sm font-mono font-bold text-slate-800 dark:text-gray-200 transition-colors cursor-pointer"
          title="Настроить состав смены инженеров"
        >
          <Users className="w-4 h-4 text-emerald-400" />
          <span>Смена</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
