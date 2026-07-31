import React, { useState } from 'react';
import { OtoTask, Worker, ThemeMode } from '../types';
import { Terminal, Layers, Database, Download, FileText, Trash2 } from 'lucide-react';

interface BottomConsolePanelProps {
  tasks: OtoTask[];
  workers: Worker[];
  onCancelTask: (taskId: string) => void;
  onSelectTask: (task: OtoTask) => void;
  theme: ThemeMode;
}

export const BottomConsolePanel: React.FC<BottomConsolePanelProps> = ({
  tasks,
  workers,
  onCancelTask,
  onSelectTask,
  theme
}) => {
  const [activeTab, setActiveTab] = useState<'TASKS' | 'REGISTRY' | 'EXPORT'>('TASKS');

  const handleExportCSV = () => {
    if (tasks.length === 0) {
      alert('Нет активных задач для экспорта');
      return;
    }
    const headers = ['ID_Задачи', 'Стоянка', 'Борт', 'Бригада_Чел', 'Прибыло_Спецов', 'Макс_ETA_Мин', 'Лимит_SLA_Мин', 'SLA_Статус', 'Время_Создания'];
    const rows = tasks.map(t => [
      t.id,
      `"${t.standLabel}"`,
      `"${t.aircraftType}"`,
      t.crew.length,
      `${t.arrivedCount}/${t.crew.length}`,
      t.maxEtaMinutes,
      t.slaLimitMinutes,
      t.withinSla ? 'В рамках SLA' : 'Превышение SLA',
      t.createdAt
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SVO_OTO_Active_Tasks_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({ activeTasks: tasks, shiftWorkers: workers }, null, 2));
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
          <button
            onClick={() => setActiveTab('TASKS')}
            className={`flex items-center space-x-2 px-3 py-1 font-mono text-xs md:text-sm font-bold rounded-t border-t border-x transition-colors ${
              activeTab === 'TASKS'
                ? theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-sky-400' : 'bg-white border-slate-300 text-sky-600'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>📋 АКТИВНЫЕ ЗАДАЧИ ПЕРРОНА ({tasks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('REGISTRY')}
            className={`flex items-center space-x-2 px-3 py-1 font-mono text-xs md:text-sm font-bold rounded-t border-t border-x transition-colors ${
              activeTab === 'REGISTRY'
                ? theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-emerald-400' : 'bg-white border-slate-300 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>📊 ДИСЛОКАЦИЯ СМЕНЫ ({workers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('EXPORT')}
            className={`flex items-center space-x-2 px-3 py-1 font-mono text-xs md:text-sm font-bold rounded-t border-t border-x transition-colors ${
              activeTab === 'EXPORT'
                ? theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-amber-400' : 'bg-white border-slate-300 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>💾 Экспорт отчетов</span>
          </button>
        </div>

        <div className="text-xs text-gray-500 hidden md:block">
          СИТУАЦИОННЫЙ ЦЕНТР ОТО — ДИСПЕТЧЕРИЗАЦИЯ SVO
        </div>
      </div>

      {/* Tab Content */}
      <div className={`flex-1 overflow-y-auto p-2.5 ${theme === 'dark' ? 'bg-[#070a0e]' : 'bg-white'}`}>
        {/* Tab 1: Active Tasks Table */}
        {activeTab === 'TASKS' && (
          tasks.length > 0 ? (
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead className={`sticky top-0 border-b ${
                theme === 'dark' ? 'bg-[#121820] text-gray-400 border-[#263345]' : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}>
                <tr>
                  <th className="py-1.5 px-3">№ Задачи</th>
                  <th className="py-1.5 px-3">Стоянка / Борт</th>
                  <th className="py-1.5 px-3">Состав бригады</th>
                  <th className="py-1.5 px-3">Прибытие спецов</th>
                  <th className="py-1.5 px-3">Время сбора (ETA)</th>
                  <th className="py-1.5 px-3">Статус SLA</th>
                  <th className="py-1.5 px-3 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#263345]/60">
                {tasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onSelectTask(t)}
                    className="hover:bg-slate-100 dark:hover:bg-[#121820] cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 text-sky-400 font-bold">{t.id}</td>
                    <td className="py-2 px-3 font-bold">
                      {t.standLabel} <span className="text-gray-400 text-xs font-normal">({t.aircraftType})</span>
                    </td>
                    <td className="py-2 px-3 text-purple-400 dark:text-purple-300 font-bold">
                      {t.crew.length} чел. <span className="text-gray-400 text-xs font-normal">({t.crew.map(c => c.categoryCode).join(', ')})</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`font-bold ${t.arrivedCount === t.crew.length ? 'text-red-400' : 'text-emerald-500'}`}>
                        {t.arrivedCount} / {t.crew.length} {t.arrivedCount === t.crew.length ? '🔴 На ТО' : '🔵 В пути'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-bold">{t.maxEtaMinutes} мин</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        t.withinSla ? 'bg-[#238636]/20 text-emerald-400 border border-[#238636]/60' : 'bg-[#da3633]/20 text-red-400 border border-[#da3633]/60'
                      }`}>
                        {t.withinSla ? `🟢 ДО ${t.slaLimitMinutes.toFixed(0)} МИН` : '🔴 ПРЕВЫШЕНИЕ SLA'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelTask(t.id);
                        }}
                        className="px-3 py-1 bg-red-500/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg border border-red-500 transition-colors text-xs font-bold flex items-center space-x-1.5 ml-auto cursor-pointer"
                        title="Отменить задачу и вернуть инженеров на базы"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>🗑️ Отменить задачу</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              Активных задач нет. Выберите стоянку на карте и воспользуйтесь быстрой комплектацией бригады.
            </div>
          )
        )}

        {/* Tab 2: Registry */}
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

        {/* Tab 3: Export */}
        {activeTab === 'EXPORT' && (
          <div className="h-full flex items-center justify-center space-x-6 p-4">
            <button
              onClick={handleExportCSV}
              className={`flex items-center space-x-2 font-bold px-6 py-3 rounded-xl border transition-colors ${
                theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-emerald-400 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-emerald-700 border-slate-300'
              }`}
            >
              <Download className="w-5 h-5" />
              <span>📥 Скачать журнал задач CSV</span>
            </button>

            <button
              onClick={handleExportJSON}
              className={`flex items-center space-x-2 font-bold px-6 py-3 rounded-xl border transition-colors ${
                theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-sky-400 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-sky-700 border-slate-300'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span>📄 Экспортировать JSON данные</span>
            </button>
          </div>
        )}
      </div>
    </footer>
  );
};
