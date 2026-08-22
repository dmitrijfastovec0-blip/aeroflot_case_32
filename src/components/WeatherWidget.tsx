import React, { useState } from 'react';
import { WeatherMode, ThemeMode } from '../types/index';
import { Sun, CloudRain, Wind, Moon, ChevronDown } from 'lucide-react';

interface WeatherWidgetProps {
  weatherMode: WeatherMode;
  onWeatherChange: (mode: WeatherMode) => void;
  theme: ThemeMode;
}

const WEATHER_OPTIONS: { id: WeatherMode; label: string; icon: React.ReactNode }[] = [
  { id: 'CLEAR', label: 'Ясно', icon: <Sun className="w-4 h-4 text-amber-400" /> },
  { id: 'RAIN', label: 'Осадки / Ливень', icon: <CloudRain className="w-4 h-4 text-sky-400" /> },
  { id: 'BLIZZARD', label: 'Метель SVO', icon: <Wind className="w-4 h-4 text-blue-200" /> },
  { id: 'NIGHT', label: 'Ночная смена', icon: <Moon className="w-4 h-4 text-purple-300" /> }
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
        className="flex items-center space-x-2 bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#263345] text-slate-800 dark:text-gray-200 font-bold transition-all cursor-pointer shadow-sm"
      >
        {currentOption.icon}
        <span>{currentOption.label}</span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-48 rounded-xl border bg-white dark:bg-[#121820] border-slate-300 dark:border-[#263345] shadow-2xl p-1 z-50 flex flex-col space-y-1">
          {WEATHER_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => {
                onWeatherChange(opt.id);
                setIsOpen(false);
              }}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer text-sm font-bold ${
                weatherMode === opt.id
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-gray-200'
              }`}
            >
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default WeatherWidget;
