import React, { useState, useEffect } from 'react';
import { OtoTask, Worker, ThemeMode } from '../types/index';
import { DispatchStat, ControlTestResult } from '../hooks/useSimulationEngine';
import { AIRCRAFT_DOWNTIME_COST_PER_MIN } from '../constants/index';
import { Terminal, Layers, Database, Download, FileText, Trash2, Clock, Flame, BarChart3, FlaskConical } from 'lucide-react';

// Animated column bar that grows smoothly from 0 to its target height
function AnimatedBar({ height, gradient }: { height: number; gradient: string }) {
  const [h, setH] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setH(height));
    return () => cancelAnimationFrame(raf);
  }, [height]);
  return (
    <div
      className={`w-full rounded-t-md bg-gradient-to-t ${gradient}`}
      style={{ height: `${h}px`, transition: 'height 650ms cubic-bezier(0.22, 1, 0.36, 1)' }}
    />
  );
}

// Smooth animated donut (SLA compliance)
function Donut({ pct, trackColor }: { pct: number; trackColor: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  const R = 40;
  const C = 2 * Math.PI * R;
  const dash = (C * shown) / 100;
  return (
    <div className="flex items-center gap-4">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90 shrink-0">
        <circle cx="48" cy="48" r={R} fill="none" stroke={trackColor} strokeWidth="12" />
        <circle
          cx="48"
          cy="48"
          r={R}
          fill="none"
          stroke="#10b981"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C - dash}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div>
        <div className="text-3xl font-black text-emerald-400">{pct}%</div>
        <div className="text-[11px] text-gray-500 leading-tight">вызовов в регламенте<br />≤ 15 мин</div>
      </div>
    </div>
  );
}

interface BottomConsoleProps {
  tasks: OtoTask[];
  queuedTasks: OtoTask[];
  workers: Worker[];
  onCancelTask: (taskId: string) => void;
  onPromoteToAog: (taskId: string) => void;
  onSelectTask: (task: OtoTask) => void;
  dispatchStats: DispatchStat[];
  onRunControlTests: () => ControlTestResult[];
  theme: ThemeMode;
}

export const BottomConsole: React.FC<BottomConsoleProps> = ({
  tasks,
  queuedTasks,
  workers,
  onCancelTask,
  onPromoteToAog,
  onSelectTask,
  dispatchStats,
  onRunControlTests,
  theme
}) => {
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'QUEUED' | 'REGISTRY' | 'EXPORT' | 'ANALYTICS'>('ACTIVE');
  const [testResults, setTestResults] = useState<ControlTestResult[] | null>(null);

  const activeTasks = tasks.filter(t => t.status === 'DISPATCHED' || t.status === 'WORKING');

  // Economics from dispatch analytics
  const totalSaved = dispatchStats.reduce((s, st) => s + st.savedMinutes, 0);
  const totalMoney = totalSaved * AIRCRAFT_DOWNTIME_COST_PER_MIN;
  const within15Count = dispatchStats.filter(st => st.within15).length;
  const within15Pct = dispatchStats.length ? Math.round((within15Count / dispatchStats.length) * 100) : 0;

  const handleRunTests = () => {
    setTestResults(onRunControlTests());
  };

  const handleExportCSV = () => {
    if (tasks.length === 0) {
      alert('Нет задач для экспорта');
      return;
    }
    const headers = ['ID_Задачи', 'Стоянка', 'Борт', 'Приоритет', 'Статус', 'Бригада_Чел', 'Прибыло_Спецов', 'Макс_ETA_Мин', 'SLA_Статус'];
    const rows = tasks.map(t => [
      t.id,
      `"${t.standLabel}"`,
      `"${t.aircraftType}"`,
      t.priority,
      t.status,
      t.crew.length,
      `${t.arrivedCount}/${t.crew.length}`,
      t.maxEtaMinutes,
      t.withinSla ? 'В рамках SLA' : 'Превышение SLA'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SVO_OTO_Tasks_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({ tasks, workers }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `SVO_OTO_Dispatch_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

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

          {/* Export Tab */}
          <button
            onClick={() => setActiveTab('EXPORT')}
            className={`flex items-center space-x-2 px-3 py-1 font-mono text-xs md:text-sm font-bold rounded-t border-t border-x transition-colors cursor-pointer ${
              activeTab === 'EXPORT'
                ? theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-purple-400' : 'bg-white border-slate-300 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>💾 Экспорт отчетов</span>
          </button>

          {/* Analytics Tab */}
          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`flex items-center space-x-2 px-3 py-1 font-mono text-xs md:text-sm font-bold rounded-t border-t border-x transition-colors cursor-pointer ${
              activeTab === 'ANALYTICS'
                ? theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-emerald-400' : 'bg-white border-slate-300 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>📈 Аналитика / Экономика</span>
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

        {/* Tab 2: QUEUED TASKS TAB WITH AOG PROMOTIONAL BUTTON */}
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
                  <th className="py-1.5 px-3 text-right">Диспетчерское управление</th>
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
                      <td className="py-2 px-3 text-right flex items-center justify-end space-x-2">
                        {t.priority !== 'AOG' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPromoteToAog(t.id);
                            }}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs flex items-center space-x-1 transition-colors cursor-pointer"
                            title="Поднять задачу в самое начало очереди (Приоритет AOG)"
                          >
                            <Flame className="w-3.5 h-3.5" />
                            <span>⚡ Повысить до AOG</span>
                          </button>
                        )}

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

        {/* Tab 4: Export */}
        {activeTab === 'EXPORT' && (
          <div className="h-full flex items-center justify-center space-x-6 p-4">
            <button
              onClick={handleExportCSV}
              className={`flex items-center space-x-2 font-bold px-6 py-3 rounded-xl border transition-colors cursor-pointer ${
                theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-emerald-400 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-emerald-700 border-slate-300'
              }`}
            >
              <Download className="w-5 h-5" />
              <span>📥 Скачать журнал задач CSV</span>
            </button>

            <button
              onClick={handleExportJSON}
              className={`flex items-center space-x-2 font-bold px-6 py-3 rounded-xl border transition-colors cursor-pointer ${
                theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-sky-400 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-sky-700 border-slate-300'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span>📄 Экспортировать JSON данные</span>
            </button>
          </div>
        )}

        {/* Tab 5: Analytics / Economics */}
        {activeTab === 'ANALYTICS' && (
          <div className="h-full overflow-y-auto p-3 space-y-3">
            {/* Economics summary */}
            <div className="grid grid-cols-4 gap-3">
              <div className={`rounded-xl border p-3 ${
                theme === 'dark' ? 'bg-[#0c1620] border-[#263345]' : 'bg-emerald-50 border-emerald-200'
              }`}>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Диспетчерских решений</div>
                <div className="text-2xl font-black text-emerald-400">{dispatchStats.length}</div>
              </div>
              <div className={`rounded-xl border p-3 ${
                theme === 'dark' ? 'bg-[#0c1620] border-[#263345]' : 'bg-sky-50 border-sky-200'
              }`}>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Сэкономлено времени (мин)</div>
                <div className="text-2xl font-black text-sky-400">{Math.round(totalSaved * 10) / 10}</div>
              </div>
              <div className={`rounded-xl border p-3 ${
                theme === 'dark' ? 'bg-[#0c1620] border-[#263345]' : 'bg-purple-50 border-purple-200'
              }`}>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">В регламенте ≤ 15 мин</div>
                <div className="text-2xl font-black text-purple-400">{within15Pct}%</div>
                <div className="text-[10px] text-gray-500">{within15Count} из {dispatchStats.length}</div>
              </div>
              <div className={`rounded-xl border p-3 ${
                theme === 'dark' ? 'bg-[#0c1620] border-[#263345]' : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Эффект от сокращения простоя</div>
                <div className="text-xl font-black text-amber-400">{Math.round(totalMoney).toLocaleString('ru-RU')} ₽</div>
                <div className="text-[10px] text-gray-500">при ставке {AIRCRAFT_DOWNTIME_COST_PER_MIN.toLocaleString('ru-RU')} ₽/мин простоя ВС</div>
              </div>
            </div>

            {/* Charts: economy per call + SLA donut */}
            <div className="grid grid-cols-5 gap-3">
              <div className={`col-span-3 rounded-xl border p-3 ${
                theme === 'dark' ? 'bg-[#0c1620] border-[#263345]' : 'bg-white border-slate-200'
              }`}>
                <div className="font-bold text-xs text-gray-400 uppercase tracking-wider mb-2">
                  ⏱️ Экономия времени по последним вызовам (мин)
                </div>
                {dispatchStats.length > 0 ? (
                  <div className="flex items-end justify-between gap-1.5 h-28">
                    {[...dispatchStats].slice(0, 10).reverse().map((st, i) => {
                      const value = Math.max(0, Math.min(76, st.savedMinutes * 8));
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full">
                          <div className="w-full flex-1 flex items-end justify-center">
                            <AnimatedBar height={Math.max(4, value)} gradient={st.savedMinutes > 0 ? 'from-sky-500 to-cyan-400' : 'from-slate-600 to-slate-500'} />
                          </div>
                          <span className="text-[9px] text-gray-500 truncate w-full text-center">{st.standLabel.replace('Стоянка ', '')}</span>
                          <span className={`text-[9px] font-bold ${st.savedMinutes > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                            {st.savedMinutes > 0 ? `−${st.savedMinutes}` : '0'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-28 flex items-center justify-center text-gray-500 text-xs">
                    Запустите любой сценарий — график построится автоматически
                  </div>
                )}
              </div>

              <div className={`col-span-2 rounded-xl border p-3 ${
                theme === 'dark' ? 'bg-[#0c1620] border-[#263345]' : 'bg-white border-slate-200'
              }`}>
                <div className="font-bold text-xs text-gray-400 uppercase tracking-wider mb-2">
                  🎯 Соблюдение регламента
                </div>
                <Donut pct={within15Pct} trackColor={theme === 'dark' ? '#1e293b' : '#e2e8f0'} />
              </div>
            </div>

            {/* Control tests */}
            <div className={`rounded-xl border p-3 ${
              theme === 'dark' ? 'bg-[#0c1620] border-[#263345]' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-xs text-gray-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <FlaskConical className="w-3.5 h-3.5 text-emerald-400" /> Контрольные тесты (6 сценариев, {'<'} 10 с)
                </div>
                <button
                  onClick={handleRunTests}
                  className={`px-3 py-1 rounded-lg border font-bold text-xs transition-colors cursor-pointer ${
                    theme === 'dark' ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 hover:bg-emerald-500/30' : 'bg-emerald-100 border-emerald-500 text-emerald-700 hover:bg-emerald-200'
                  }`}
                >
                  ▶ Запустить тесты
                </button>
              </div>

              {testResults ? (
                <div className="space-y-1">
                  {testResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded border ${
                      r.pass
                        ? theme === 'dark' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-red-500/15 border-red-500/60 text-red-400'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0">{r.pass ? '✅' : '❌'}</span>
                        <span className="font-bold whitespace-nowrap">{r.name}</span>
                        <span className="text-gray-400 truncate">{r.details}</span>
                      </div>
                      <span className="shrink-0 font-mono text-gray-500">{r.ms} мс</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-gray-500">
                  Проверка гипотезы: система назначает ближайшего свободного сотрудника нужной квалификации (по дорожному графу), никогда не «проигрывая» интуитивному выбору по прямой.
                </div>
              )}
            </div>

            {/* Dispatch log */}
            {dispatchStats.length > 0 && (
              <div className={`rounded-xl border p-3 ${
                theme === 'dark' ? 'bg-[#0c1620] border-[#263345]' : 'bg-white border-slate-200'
              }`}>
                <div className="font-bold text-xs text-gray-400 uppercase tracking-wider mb-2">
                  📋 Журнал решений диспетчера (система vs интуиция)
                </div>
                <table className="w-full text-left text-[11px]">
                  <thead className="text-gray-500 border-b border-slate-300 dark:border-[#263345]">
                    <tr>
                      <th className="py-1 pr-2">Задача</th>
                      <th className="py-1 pr-2">Стоянка</th>
                      <th className="py-1 pr-2">Кат.</th>
                      <th className="py-1 pr-2">Интуитивно, мин</th>
                      <th className="py-1 pr-2">Система, мин</th>
                      <th className="py-1 pr-2">Экономия</th>
                      <th className="py-1 pr-2">≤ 15 мин</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#263345]/50">
                    {dispatchStats.map((st, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-2 text-sky-400 font-bold">{st.taskId}</td>
                        <td className="py-1 pr-2 font-bold">{st.standLabel}</td>
                        <td className="py-1 pr-2">{st.categoryCode}</td>
                        <td className="py-1 pr-2 font-mono">{st.intuitiveEtaMinutes}</td>
                        <td className="py-1 pr-2 font-mono font-bold text-emerald-400">{st.systemEtaMinutes}</td>
                        <td className={`py-1 pr-2 font-mono font-bold ${st.savedMinutes > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                          {st.savedMinutes > 0 ? `−${st.savedMinutes}` : '0'}
                        </td>
                        <td className="py-1 pr-2">{st.within15 ? '🟢' : '🟡'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </footer>
  );
};
