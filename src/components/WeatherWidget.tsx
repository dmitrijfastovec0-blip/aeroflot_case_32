/**
 * ============================================================================
 * ВИДЖЕТ ПОГОДНЫХ УСЛОВИЙ НА ПЕРРОНЕ (WEATHER WIDGET)
 * ----------------------------------------------------------------------------
 * Компонент оперативного переключения погодных условий:
 * - Ясно (CLEAR): штатные скорости (100%)
 * - Осадки / Ливень (RAIN): снижение скоростей движения (-20%)
 * - Метель / Снегопад (BLIZZARD): критическое замедление техники и пешеходов (-50%)
 * - Ночная смена (NIGHT): ночной режим видимости
 * ============================================================================
 */

import React, { useState } from 'react';
import { WeatherMode, ThemeMode } from '../types';
import { Sun, CloudRain, Wind, Moon, ChevronDown } from 'lucide-react';

/** Свойства виджета погоды */
interface WeatherWidgetProps {

  weatherMode: WeatherMode;
  onWeatherChange: (mode: WeatherMode) => void;
  theme: ThemeMode;
}

const WEATHER_OPTIONS: { id: WeatherMode; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'CLEAR', label: 'Ясно', desc: 'Стандартная скорость (100%)', icon: <Sun className="w-4 h-4 text-amber-400" /> },
  { id: 'RAIN', label: 'Осадки / Ливень', desc: 'Снижение скорости на 20% (+20% к ETA)', icon: <CloudRain className="w-4 h-4 text-sky-400" /> },
  { id: 'BLIZZARD', label: 'Метель / Снегопад', desc: 'Снижение скорости на 50% (+50% к ETA)', icon: <Wind className="w-4 h-4 text-blue-200" /> },
  { id: 'NIGHT', label: 'Ночная смена', desc: 'Стандартная скорость, ночной режим', icon: <Moon className="w-4 h-4 text-purple-300" /> }
];

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  weatherMode,
  onWeatherChange
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const currentOption = WEATHER_OPTIONS.find(w => w.id === weatherMode) || WEATHER_OPTIONS[0];

  return (
    <div className="relative font-mono text-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1.5 bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#263345] text-slate-800 dark:text-gray-200 transition-all cursor-pointer shadow-sm"
        title={`Погода: ${currentOption.label} (${currentOption.desc})`}
      >
        {currentOption.icon}
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-64 rounded-xl border bg-white dark:bg-[#121820] border-slate-300 dark:border-[#263345] shadow-2xl p-1.5 z-50 flex flex-col space-y-1">
          <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-slate-200 dark:border-[#263345] mb-1">
            Погодные условия
          </div>
          {WEATHER_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => {
                onWeatherChange(opt.id);
                setIsOpen(false);
              }}
              className={`flex items-start space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                weatherMode === opt.id
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-gray-200'
              }`}
            >
              <div className="mt-0.5 shrink-0">{opt.icon}</div>
              <div className="flex flex-col">
                <span className="text-xs font-bold leading-tight">{opt.label}</span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{opt.desc}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default WeatherWidget;
