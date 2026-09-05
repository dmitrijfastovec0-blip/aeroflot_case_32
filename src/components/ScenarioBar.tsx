import React from 'react';
import { ThemeMode } from '../types/index';
import { Rocket, AlertOctagon, RefreshCcw, Zap, Siren, ListChecks } from 'lucide-react';

interface ScenarioBarProps {
  onRunScenario: (scenarioId: string) => void;
  theme: ThemeMode;
}

const SCENARIOS: { id: string; label: string; title: string; icon: React.ReactNode }[] = [
  { id: 'standard', label: 'Базовый день', title: 'Смена на базах + вызов ATA 72 на стоянку D18', icon: <Rocket className="w-4 h-4 text-emerald-400" /> },
  { id: 'series', label: 'Серия вызовов', title: '4 плановых вызова подряд с интервалом', icon: <ListChecks className="w-4 h-4 text-sky-400" /> },
  { id: 'peak', label: 'Пиковая нагрузка', title: 'Задача на каждую стоянку и минимум 10 вызовов — проверка приоритетной очереди', icon: <Zap className="w-4 h-4 text-amber-400" /> },
  { id: 'hellish', label: '🔥 Стресс-тест (все стоянки)', title: 'Массовые вызовы на все стоянки с последующим поддержанием нагрузки', icon: <Zap className="w-4 h-4 text-rose-500 animate-pulse" /> },
  { id: 'aog', label: 'AOG Перехват', title: 'Рутинный вызов + срочные AOG сверху (перехват персонала)', icon: <Siren className="w-4 h-4 text-rose-400" /> },
  { id: 'deficit', label: 'Кадровый дефицит', title: '4 инженера на 8 вызовов — работа в дефиците ресурсов', icon: <AlertOctagon className="w-4 h-4 text-orange-400" /> },
  { id: 'reset', label: 'Смена ПТО', title: 'Все инженеры на базах, вызовы очищены', icon: <RefreshCcw className="w-4 h-4 text-red-400" /> }
];

export const ScenarioBar: React.FC<ScenarioBarProps> = ({ onRunScenario, theme }) => {
  return (
    <div className={`flex items-center gap-2 px-4 h-[42px] min-h-[42px] border-b overflow-x-auto font-mono text-sm ${
      theme === 'dark' ? 'bg-[#0a0f15] border-[#1e2a3a]' : 'bg-slate-50 border-slate-300'
    }`}>
      <span className={`font-bold uppercase tracking-wider mr-1.5 shrink-0 ${theme === 'dark' ? 'text-gray-500' : 'text-slate-500'}`}>
        Сценарии:
      </span>
      {SCENARIOS.map(sc => {
        const isReset = sc.id === 'reset';
        return (
          <button
            key={sc.id}
            onClick={() => onRunScenario(sc.id)}
            title={sc.title}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-bold transition-all cursor-pointer whitespace-nowrap ${
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
