import React from 'react';
import { ThemeMode } from '../types/index';
import { Rocket, AlertOctagon, Snowflake, RefreshCcw, TrafficCone } from 'lucide-react';

interface ScenarioBarProps {
  onRunPreset: (presetId: string) => void;
  theme: ThemeMode;
}

const PRESETS: { id: string; label: string; title: string }[] = [
  { id: 'standard', label: '1. Стандартный', title: 'Смена на базах + вызов ATA 72 на стоянку D18' },
  { id: 'rushhour', label: '2. Час-Пик SVO', title: '5 одновременных ATA-вызовов по Северу (B/C) и Югу (D/F)' },
  { id: 'snow', label: '3. Снегопад', title: 'Погодный фактор: пешком 3.5 км/ч, авто 12 км/ч' },
  { id: 'slaBreach', label: '4. Нарушение SLA', title: 'B2-вызов на D24, ближайший B2 на Севере (АК-4) → CRITICAL_SLA_ALERT' },
  { id: 'reset', label: '5. Сброс', title: 'Все инженеры FREE_STATIONARY на базах (ПТО-1, ПТО-2, АК-1, АК-4)' }
];

const PRESET_ICONS: Record<string, React.ReactNode> = {
  standard: <Rocket className="w-3.5 h-3.5" />,
  rushhour: <TrafficCone className="w-3.5 h-3.5" />,
  snow: <Snowflake className="w-3.5 h-3.5" />,
  slaBreach: <AlertOctagon className="w-3.5 h-3.5" />,
  reset: <RefreshCcw className="w-3.5 h-3.5" />
};

export const ScenarioBar: React.FC<ScenarioBarProps> = ({ onRunPreset, theme }) => {
  return (
    <div className={`flex items-center gap-1.5 px-4 h-[38px] min-h-[38px] border-b overflow-x-auto font-mono text-[11px] ${
      theme === 'dark' ? 'bg-[#0a0f15] border-[#1e2a3a]' : 'bg-slate-50 border-slate-300'
    }`}>
      <span className={`font-bold uppercase tracking-wider mr-1.5 shrink-0 ${theme === 'dark' ? 'text-gray-500' : 'text-slate-500'}`}>
        ⚡ Быстрые пресеты:
      </span>
      {PRESETS.map(p => {
        const active = p.id === 'reset';
        return (
          <button
            key={p.id}
            onClick={() => onRunPreset(p.id)}
            title={p.title}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer whitespace-nowrap ${
              active
                ? theme === 'dark'
                  ? 'border-red-500/70 bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : 'border-red-400 bg-red-50 text-red-600 hover:bg-red-100'
                : theme === 'dark'
                  ? 'border-sky-500/60 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
                  : 'border-sky-400 bg-sky-50 text-sky-700 hover:bg-sky-100'
            }`}
          >
            {PRESET_ICONS[p.id]}
            <span>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ScenarioBar;
