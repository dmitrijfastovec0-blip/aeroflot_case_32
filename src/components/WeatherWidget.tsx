import React, { useState } from 'react';
import { WeatherMode, ThemeMode } from '../types/index';
import { Sun, Snowflake, ShieldAlert, Moon, ChevronDown } from 'lucide-react';

interface WeatherWidgetProps {
  weatherMode: WeatherMode;
  onWeatherChange: (mode: WeatherMode) => void;
  theme: ThemeMode;
}

const WEATHER_OPTIONS: { id: WeatherMode; label: string; title: string; icon: React.ReactNode }[] = [
  { id: 'CLEAR', label: '☀️ Ясно', title: 'Пешком 4.5 км/ч, Авто 20 км/ч (Штатный режим)', icon: <Sun className="w-3.5 h-3.5 text-amber-400" /> },
  { id: 'SNOW', label: '🌨️ Снегопад', title: 'Анимированный снег. Пешком 3.5 км/ч, Авто 12 км/ч', icon: <Snowflake className="w-3.5 h-3.5 text-sky-300" /> },
  { id: 'ICE', label: '🧊 Гололёд', title: 'Ограничения скорости перронного автотранспорта (10 км/ч)', icon: <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" /> },
  { id: 'NIGHT', label: '🌙 Ночь', title: 'Ночная смена: подсветка ВПП и рулёжных дорожек', icon: <Moon className="w-3.5 h-3.5 text-indigo-400" /> }
];

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  weatherMode,
  onWeatherChange,
  theme
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const currentOption = WEATHER_OPTIONS.find(w => w.id === weatherMode) || WEATHER_OPTIONS[0];

  return (
    <div className="relative font-mono text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1.5 bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#263345] text-slate-800 dark:text-gray-200 font-bold transition-all cursor-pointer shadow-sm"
        title="Переключить погодный режим симуляции"
      >
        {currentOption.icon}
        <span>{currentOption.label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-60 rounded-xl border bg-white dark:bg-[#121820] border-slate-300 dark:border-[#263345] shadow-2xl p-1.5 z-50 flex flex-col space-y-1">
          {WEATHER_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => {
                onWeatherChange(opt.id);
                setIsOpen(false);
              }}
              title={opt.title}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                weatherMode === opt.id
                  ? 'bg-sky-500/20 text-sky-400 font-bold border border-sky-500/40'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-gray-200'
              }`}
            >
              {opt.icon}
              <div className="flex flex-col">
                <span className="font-semibold text-xs">{opt.label}</span>
                <span className="text-[10px] text-gray-500 line-clamp-1">{opt.title}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default WeatherWidget;
