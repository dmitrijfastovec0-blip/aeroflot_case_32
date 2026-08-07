import React, { useState } from 'react';
import { OtoTask, Worker, ThemeMode } from '../types/index';
import { Terminal, Layers, Clock, Trash2 } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'QUEUED' | 'REGISTRY'>('ACTIVE');

  const activeTasks = tasks.filter(t => t.status === 'DISPATCHED' || t.status === 'WORKING');

  return (
    <footer className={`h-[160px] min-h-[160px] border-t flex flex-col overflow-hidden text-xs md:text-sm select-none font-mono transition-colors ${
      theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-gray-200' : 'bg-white border-slate-300 text-slate-800 shadow-inner'
    }`}>
      {/* Header Tabs */}
      <div className={`h-9 border-b flex items-center justify-between px-4 ${
        theme === 'dark' ? 'bg-[#121820] border-[#263345]' : 'bg-slate-100 border-slate-300'
      }`}>
        <div className="flex space-x-2">
          {/* Active Tasks Tab */}
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`flex items-center space-x-2 px-3 py-1 font-mono text-xs md:text-sm font-bold rounded-t border-t border-x transition-colors cursor-pointer ${
              activeTab === 'ACTIVE'
                ? theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-sky-400' : 'bg-white border-slate-300 text-sky-600'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>📜 Активные задачи ({activeTasks.length})</span>
          </button>

          {/* QUEUED TASKS TAB (Highlighted amber if M > 0) */}
          <button
            onClick={() => setActiveTab('QUEUED')}
            className={`flex items-center space-x-2 px-3 py-1 font-mono text-xs md:text-sm font-bold rounded-t border-t border-x transition-colors cursor-pointer ${
              queuedTasks.length > 0 ? 'bg-amber-500/20 text-amber-400 border-amber-500 animate-pulse' : ''
            } ${
              activeTab === 'QUEUED'
                ? theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-amber-400' : 'bg-white border-slate-300 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>⏳ Очередь ожидания ({queuedTasks.length})</span>
          </button>

          {/* Registry Tab */}
          <button
            onClick={() => setActiveTab('REGISTRY')}
            className={`flex items-center space-x-2 px-3 py-1 font-mono text-xs md:text-sm font-bold rounded-t border-t border-x transition-colors cursor-pointer ${
              activeTab === 'REGISTRY'
                ? theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-emerald-400' : 'bg-white border-slate-300 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>📊 Реестр смены ({workers.length})</span>
          </button>
        </div>

        <div className="text-xs text-gray-500 hidden md:block">
          СИТУАЦИОННЫЙ ЦЕНТР ОТО — ДИСПЕТЧЕРИЗАЦИЯ SVO
        </div>
      </div>

      {/* Tab Content */}
      <div className={`flex-1 overflow-y-auto p-2.5 ${theme === 'dark' ? 'bg-[#070a0e]' : 'bg-white'}`}>
        {/* Tab 1: Active Dispatched Tasks */}
        {activeTab === 'ACTIVE' && (
          activeTasks.length > 0 ? (
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead className={`sticky top-0 border-b ${
                theme === 'dark' ? 'bg-[#121820] text-gray-400 border-[#263345]' : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}>
                <tr>
                  <th className="py-1.5 px-3">№ Задачи</th>
                  <th className="py-1.5 px-3">Стоянка / Борт</th>
                  <th className="py-1.5 px-3">Приоритет</th>
                  <th className="py-1.5 px-3">Состав бригады</th>
                  <th className="py-1.5 px-3">Прибытие спецов</th>
                  <th className="py-1.5 px-3">Время сбора (ETA)</th>
                  <th className="py-1.5 px-3 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#263345]/60">
                {activeTasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onSelectTask(t)}
                    className="hover:bg-slate-100 dark:hover:bg-[#121820] cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 text-sky-400 font-bold">{t.id}</td>
                    <td className="py-2 px-3 font-bold">
                      {t.standLabel} <span className="text-gray-400 text-xs font-normal">({t.aircraftType})</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        t.priority === 'AOG' ? 'bg-red-500/20 text-red-400 border border-red-500' :
                        t.priority === 'URGENT' ? 'bg-amber-500/20 text-amber-400 border border-amber-500' :
                        'bg-sky-500/20 text-sky-400 border border-sky-500'
                      }`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-purple-400 dark:text-purple-300 font-bold">
                      {t.crew.length} чел. <span className="text-gray-400 text-xs font-normal">({t.crew.map(c => c.categoryCode).join(', ')})</span>
                    </td>
                    <td className="py-2 px-3 font-bold">
                      <span className={t.arrivedCount === t.crew.length ? 'text-red-400' : 'text-emerald-500'}>
                        {t.arrivedCount} / {t.crew.length} {t.arrivedCount === t.crew.length ? '🔴 На ТО' : '🔵 В пути'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-bold">{t.maxEtaMinutes} мин</td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelTask(t.id);
                        }}
                        className="px-3 py-1 bg-red-500/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg border border-red-500 transition-colors text-xs font-bold flex items-center space-x-1.5 ml-auto cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>🗑️ Отменить</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              Активных вызовных задач нет.
            </div>
          )
        )}

        {/* Tab 2: QUEUED TASKS */}
        {activeTab === 'QUEUED' && (
          queuedTasks.length > 0 ? (
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead className={`sticky top-0 border-b ${
                theme === 'dark' ? 'bg-[#121820] text-gray-400 border-[#263345]' : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}>
                <tr>
                  <th className="py-1.5 px-3">№ Задачи</th>
                  <th className="py-1.5 px-3">Стоянка / Борт</th>
                  <th className="py-1.5 px-3">Приоритет</th>
                  <th className="py-1.5 px-3">Необходимая квалификация</th>
                  <th className="py-1.5 px-3">Время в очереди</th>
                  <th className="py-1.5 px-3 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#263345]/60">
                {queuedTasks.map((t) => {
                  const waitSec = Math.floor(t.elapsedQueueSec || 0);
                  const waitMinStr = `${String(Math.floor(waitSec / 60)).padStart(2, '0')}:${String(waitSec % 60).padStart(2, '0')}`;

                  return (
                    <tr
                      key={t.id}
                      onClick={() => onSelectTask(t)}
                      className="hover:bg-amber-500/10 cursor-pointer transition-colors"
                    >
                      <td className="py-2 px-3 text-amber-400 font-bold">{t.id}</td>
                      <td className="py-2 px-3 font-bold">
                        {t.standLabel} <span className="text-gray-400 text-xs font-normal">({t.aircraftType})</span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          t.priority === 'AOG' ? 'bg-red-500/25 text-red-400 border border-red-500' :
                          t.priority === 'URGENT' ? 'bg-amber-500/25 text-amber-400 border border-amber-500' :
                          'bg-sky-500/25 text-sky-400 border border-sky-500'
                        }`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-purple-300 font-bold">
                        Требуется Cat {t.categoryCode}
                        {t.reservedWorkerId && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/60 text-sky-300 text-[10px] font-bold whitespace-nowrap">
                            ⏳ Резерв инженера (почти свободен)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-amber-400 font-bold">
                        ⏳ {waitMinStr}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelTask(t.id);
                          }}
                          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-bold text-xs transition-colors cursor-pointer"
                        >
                          Отмена
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              🟢 Очередь ожидания пуста. Все вызовы успешно укомплектованы инженерами.
            </div>
          )
        )}

        {/* Tab 3: Registry */}
        {activeTab === 'REGISTRY' && (
          <table className="w-full text-left border-collapse text-xs md:text-sm">
            <thead className={`sticky top-0 border-b ${
              theme === 'dark' ? 'bg-[#121820] text-gray-400 border-[#263345]' : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}>
              <tr>
                <th className="py-1.5 px-3">ID</th>
                <th className="py-1.5 px-3">ФИО инженера</th>
                <th className="py-1.5 px-3">Квалификация</th>
                <th className="py-1.5 px-3">Динамический статус</th>
                <th className="py-1.5 px-3">Транспорт</th>
                <th className="py-1.5 px-3">Координаты</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#263345]/60">
              {workers.map((w) => (
                <tr key={w.id} className="hover:bg-slate-100 dark:hover:bg-[#121820] transition-colors">
                  <td className="py-1.5 px-3 text-sky-400 font-bold">{w.id}</td>
                  <td className="py-1.5 px-3 font-semibold">{w.name}</td>
                  <td className="py-1.5 px-3">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-900/40 text-purple-300 border border-purple-700">
                      Категория {w.categoryCode}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 font-bold">
                    {w.status === 'FREE_STATIONARY' && <span className="text-emerald-400">🟢 Дежурит на базе</span>}
                    {w.status === 'FREE_PATROLLING' && <span className="text-emerald-300">🟢 Патрулирует перрон</span>}
                    {w.status === 'IN_TRANSIT' && <span className="text-sky-400">🔵 В пути на вызов</span>}
                    {w.status === 'WORKING_ON_SITE' && <span className="text-red-400">🔴 Работает на борту</span>}
                    {w.status === 'RETURNING_TO_BASE' && <span className="text-amber-400">🟡 Возврат на базу</span>}
                  </td>
                  <td className="py-1.5 px-3 text-gray-400">
                    {w.vehicle === 'APRON_VEHICLE' ? '🚘 Спецавтомобиль' : '🚶 Пешком'}
                  </td>
                  <td className="py-1.5 px-3 text-gray-400">X:{w.x.toFixed(1)}% Y:{w.y.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </footer>
  );
};
