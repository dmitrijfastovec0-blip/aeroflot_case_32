import React from 'react';
import { ThemeMode } from '../types/index';
import { Rocket, AlertOctagon, Snowflake, RefreshCcw, Zap, Siren, ListChecks } from 'lucide-react';

interface ScenarioBarProps {
  onRunScenario: (scenarioId: string) => void;
  theme: ThemeMode;
}

const SCENARIOS: { id: string; label: string; title: string; icon: React.ReactNode }[] = [
  { id: 'standard', label: '🟢 Стандартный день', title: 'Смена на базах + вызов ATA 72 на стоянку D18', icon: <Rocket className="w-3.5 h-3.5" /> },
  { id: 'series', label: '📋 Серия вызовов', title: '4 плановых вызова подряд с интервалом', icon: <ListChecks className="w-3.5 h-3.5" /> },
  { id: 'peak', label: '💥 Час пик (10 бортов)', title: '10 одновременных вызовов — проверка приоритетной очереди', icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'aog', label: '⚡ Срочный AOG-перехват', title: 'Рутинный вызов + срочные AOG сверху (перехват персонала)', icon: <Siren className="w-3.5 h-3.5" /> },
  { id: 'deficit', label: '⚠️ Кадровый дефицит', title: '4 инженера на 8 вызовов — работа в дефиците ресурсов', icon: <AlertOctagon className="w-3.5 h-3.5" /> },
  { id: 'snow', label: '🌨️ Снегопад', title: 'Погодный фактор: пешком 3.5 км/ч, авто 12 км/ч', icon: <Snowflake className="w-3.5 h-3.5" /> },
  { id: 'reset', label: '↺ Сброс', title: 'Все инженеры на базах, вызовы очищены', icon: <RefreshCcw className="w-3.5 h-3.5" /> }
];

export const ScenarioBar: React.FC<ScenarioBarProps> = ({ onRunScenario, theme }) => {
  return (
    <div className={`flex items-center gap-1.5 px-4 h-[38px] min-h-[38px] border-b overflow-x-auto font-mono text-[11px] ${
      theme === 'dark' ? 'bg-[#0a0f15] border-[#1e2a3a]' : 'bg-slate-50 border-slate-300'
    }`}>
      <span className={`font-bold uppercase tracking-wider mr-1.5 shrink-0 ${theme === 'dark' ? 'text-gray-500' : 'text-slate-500'}`}>
        🎬 Сценарий:
      </span>
      {SCENARIOS.map(sc => {
        const isReset = sc.id === 'reset';
        return (
          <button
            key={sc.id}
            onClick={() => onRunScenario(sc.id)}
            title={sc.title}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer whitespace-nowrap ${
              isReset
                ? theme === 'dark'
                  ? 'border-red-500/70 bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : 'border-red-400 bg-red-50 text-red-600 hover:bg-red-100'
                : theme === 'dark'
                  ? 'border-sky-500/60 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
                  : 'border-sky-400 bg-sky-50 text-sky-700 hover:bg-sky-100'
            }`}
          >
            {sc.icon}
            <span>{sc.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ScenarioBar;
