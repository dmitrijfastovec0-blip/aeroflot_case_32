import React, { useState } from 'react';
import { OtoTask, Worker, ThemeMode } from '../types/index';
import { Terminal, Layers, Clock, Trash2, ChevronUp, ChevronDown, Activity, CheckCircle2 } from 'lucide-react';

interface BottomConsoleProps {
  tasks: OtoTask[];
  queuedTasks: OtoTask[];
  workers: Worker[];
  onCancelTask: (taskId: string) => void;
  onSelectTask: (task: OtoTask) => void;
  theme: ThemeMode;
}

export const BottomConsole: React.FC<BottomConsoleProps> = ({
  tasks,
  queuedTasks,
  workers,
  onCancelTask,
  onSelectTask,
  theme
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'QUEUED' | 'COMPLETED' | 'REGISTRY'>('ACTIVE');

  const activeTasks = tasks.filter(t => t.status === 'DISPATCHED' || t.status === 'WORKING');
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED');

  const barStyle = theme === 'dark'
    ? 'bg-[#070a0e]/95 border-[#1e2a3a] text-gray-200 backdrop-blur-md shadow-2xl'
    : 'bg-white/95 border-slate-200 text-slate-900 backdrop-blur-md shadow-xl';

  return (
    <footer className={`absolute bottom-3 left-4 right-4 z-20 flex flex-col rounded-2xl border transition-all overflow-hidden ${barStyle} ${
      isExpanded ? 'h-72' : 'h-11 min-h-[44px]'
    }`}>
      {/* 1. COLLAPSED COMPACT STATUS BAR HEADER */}
      <div className="h-11 px-4 flex items-center justify-between border-b border-slate-200 dark:border-[#1e2a3a] font-mono text-xs cursor-pointer select-none">
        {/* Left Live Indicators */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5" onClick={() => { setIsExpanded(true); setActiveTab('ACTIVE'); }}>
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-700 dark:text-gray-300">Активные:</span>
            <span className="font-extrabold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10">
              {activeTasks.length}
            </span>
          </div>

          <div className="flex items-center space-x-1.5" onClick={() => { setIsExpanded(true); setActiveTab('QUEUED'); }}>
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-slate-700 dark:text-gray-300">Очередь:</span>
            <span className={`font-extrabold px-1.5 py-0.5 rounded ${
              queuedTasks.length > 0 ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-slate-200 dark:bg-slate-800 text-gray-400'
            }`}>
              {queuedTasks.length}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 hidden md:flex" onClick={() => { setIsExpanded(true); setActiveTab('COMPLETED'); }}>
            <CheckCircle2 className="w-4 h-4 text-sky-400" />
            <span className="font-bold text-slate-700 dark:text-gray-300">Завершено:</span>
            <span className="font-bold text-sky-400">{completedTasks.length}</span>
          </div>

          <div className="flex items-center space-x-1.5 hidden lg:flex" onClick={() => { setIsExpanded(true); setActiveTab('REGISTRY'); }}>
            <Layers className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-700 dark:text-gray-300">Смена:</span>
            <span className="font-bold text-emerald-400">{workers.length} чел.</span>
          </div>
        </div>

        {/* Right Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-[#263345] text-slate-800 dark:text-gray-200 font-bold transition-all cursor-pointer"
        >
          <span>{isExpanded ? '🔽 Свернуть' : '📜 Журнал задач и лог'}</span>
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* 2. EXPANDED CONTENT AREA */}
      {isExpanded && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub-tabs */}
          <div className="h-9 px-4 border-b flex items-center space-x-2 bg-slate-100/50 dark:bg-[#121820]/50 border-slate-200 dark:border-[#1e2a3a]">
            <button
              onClick={() => setActiveTab('ACTIVE')}
              className={`flex items-center space-x-1.5 px-3 py-1 font-mono text-xs font-bold rounded-t border-t border-x transition-colors cursor-pointer ${
                activeTab === 'ACTIVE'
                  ? 'bg-slate-200 dark:bg-[#070a0e] border-slate-300 dark:border-[#263345] text-sky-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>📜 В работе ({activeTasks.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('QUEUED')}
              className={`flex items-center space-x-1.5 px-3 py-1 font-mono text-xs font-bold rounded-t border-t border-x transition-colors cursor-pointer ${
                activeTab === 'QUEUED'
                  ? 'bg-slate-200 dark:bg-[#070a0e] border-slate-300 dark:border-[#263345] text-amber-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>⏳ Очередь ({queuedTasks.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('COMPLETED')}
              className={`flex items-center space-x-1.5 px-3 py-1 font-mono text-xs font-bold rounded-t border-t border-x transition-colors cursor-pointer ${
                activeTab === 'COMPLETED'
                  ? 'bg-slate-200 dark:bg-[#070a0e] border-slate-300 dark:border-[#263345] text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>✅ Завершённые ({completedTasks.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('REGISTRY')}
              className={`flex items-center space-x-1.5 px-3 py-1 font-mono text-xs font-bold rounded-t border-t border-x transition-colors cursor-pointer ${
                activeTab === 'REGISTRY'
                  ? 'bg-slate-200 dark:bg-[#070a0e] border-slate-300 dark:border-[#263345] text-sky-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>📊 Смена ({workers.length})</span>
            </button>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
            {activeTab === 'ACTIVE' && (
              activeTasks.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="border-b border-slate-200 dark:border-[#263345] text-gray-400">
                    <tr>
                      <th className="py-1 px-2">№ Задачи</th>
                      <th className="py-1 px-2">Стоянка</th>
                      <th className="py-1 px-2">Статус</th>
                      <th className="py-1 px-2">Прогресс ТО</th>
                      <th className="py-1 px-2">Состав бригады</th>
                      <th className="py-1 px-2 text-right">Отмена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTasks.map(t => {
                      const pct = Math.min(100, Math.round(((t.elapsedWorkSec || 0) / (t.targetWorkSec || 120)) * 100));
                      return (
                        <tr key={t.id} className="border-b border-slate-100 dark:border-[#1e2a3a]/50 hover:bg-slate-100 dark:hover:bg-[#121820]">
                          <td className="py-1.5 px-2 font-bold text-sky-400 cursor-pointer" onClick={() => onSelectTask(t)}>
                            {t.id}
                          </td>
                          <td className="py-1.5 px-2 font-bold">{t.standLabel}</td>
                          <td className="py-1.5 px-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.status === 'WORKING' ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-sky-500/20 text-sky-400'
                            }`}>
                              {t.status === 'WORKING' ? '🔧 Проведение ТО' : '🔵 В пути'}
                            </span>
                          </td>
                          <td className="py-1.5 px-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-24 bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div className="bg-emerald-400 h-full transition-all duration-300" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="font-bold text-emerald-400 text-[10px]">{pct}%</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-gray-400">
                            {t.crew.map(c => `${c.workerName} (${c.categoryCode})`).join(', ')}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <button
                              onClick={() => onCancelTask(t.id)}
                              className="p-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
                              title="Отменить задачу"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="p-4 text-center text-gray-500">Нет активных задач на стоянках</div>
              )
            )}

            {activeTab === 'QUEUED' && (
              queuedTasks.length > 0 ? (
                <div className="space-y-2">
                  {queuedTasks.map(t => (
                    <div key={t.id} className="p-2.5 rounded-xl border bg-amber-500/10 border-amber-500/30 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-amber-400 mr-2">{t.id}</span>
                        <span className="font-bold mr-2">{t.standLabel}</span>
                        <span className="text-gray-400">({t.defectLabel || t.categoryLabel})</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-gray-400">{t.waitingReason || 'Ожидание свободного инженера'}</span>
                        <button
                          onClick={() => onCancelTask(t.id)}
                          className="p-1 text-red-400 hover:bg-red-500/20 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500">Очередь вызовов пуста</div>
              )
            )}

            {activeTab === 'COMPLETED' && (
              completedTasks.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="border-b border-slate-200 dark:border-[#263345] text-gray-400">
                    <tr>
                      <th className="py-1 px-2">№ Задачи</th>
                      <th className="py-1 px-2">Стоянка / Борт</th>
                      <th className="py-1 px-2">Дефект / Неисправность</th>
                      <th className="py-1 px-2">Состав бригады</th>
                      <th className="py-1 px-2 text-right">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedTasks.map(t => (
                      <tr key={t.id} className="border-b border-slate-100 dark:border-[#1e2a3a]/50">
                        <td className="py-1.5 px-2 font-bold text-emerald-400">{t.id}</td>
                        <td className="py-1.5 px-2 font-bold">{t.standLabel}</td>
                        <td className="py-1.5 px-2 text-gray-300">{t.defectLabel || t.categoryLabel}</td>
                        <td className="py-1.5 px-2 text-gray-400">
                          {t.crew.map(c => `${c.workerName} (${c.categoryCode})`).join(', ')}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                            ✅ ТО Завершено
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-4 text-center text-gray-500">Завершённых задач пока нет</div>
              )
            )}

            {activeTab === 'REGISTRY' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {workers.map(w => (
                  <div key={w.id} className="p-2 rounded-lg border bg-slate-50 dark:bg-[#121820] border-slate-200 dark:border-[#263345] text-[11px] flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-gray-200">{w.name} ({w.categoryCode})</div>
                      <div className="text-[10px] text-gray-500">{w.status}</div>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${
                      w.status === 'WORKING_ON_SITE' ? 'bg-red-400 animate-pulse' :
                      w.status === 'IN_TRANSIT' ? 'bg-sky-400' : 'bg-emerald-400'
                    }`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </footer>
  );
};

export default BottomConsole;
