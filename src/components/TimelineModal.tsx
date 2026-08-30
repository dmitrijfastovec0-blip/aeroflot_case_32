import React, { useMemo, useRef } from 'react';
import { OtoTask, Worker, ThemeMode } from '../types/index';
import { SVO_NODES } from '../constants/index';
import { X, Table, MapPin } from 'lucide-react';

interface TimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: OtoTask[];
  archivedTasks?: OtoTask[];
  workers: Worker[];
  theme: ThemeMode;
  simClockSec?: number;
}

export const TimelineModal: React.FC<TimelineModalProps> = ({
  isOpen,
  onClose,
  tasks,
  archivedTasks = [],
  theme,
  simClockSec = 0
}) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const currentSimMin = Math.floor(simClockSec / 60);

  // Permanent Rows: All Stand Stations in Sheremetyevo Airport
  const standNodes = useMemo(() => {
    return SVO_NODES.filter(n => n.type === 'STAND');
  }, []);

  // Combine ALL active and archived historical tasks into one master registry
  const allTasks = useMemo(() => {
    const map = new Map<string, OtoTask>();
    tasks.forEach(t => map.set(t.id, t));
    archivedTasks.forEach(t => {
      if (!map.has(t.id)) map.set(t.id, t);
    });
    return Array.from(map.values());
  }, [tasks, archivedTasks]);

  // Dynamically compute max timeline minutes (minimum 60m baseline, gradually expanding by 15m steps)
  const maxTimelineMinutes = useMemo(() => {
    let maxTaskEndMin = 60;
    allTasks.forEach(t => {
      const startSec = t.startedAtSimSec ?? t.createdAtSimSec ?? 0;
      const workSec = t.targetWorkSec || 120;
      const endSec = t.completedAtSimSec ?? (startSec + (t.maxEtaMinutes || 5) * 60 + workSec);
      const endMin = Math.ceil(endSec / 60);
      if (endMin > maxTaskEndMin) maxTaskEndMin = endMin;
    });

    const highestNeeded = Math.max(60, currentSimMin + 15, maxTaskEndMin + 5);
    return Math.ceil(highestNeeded / 15) * 15;
  }, [allTasks, currentSimMin]);

  // Generate minute columns dynamically from 0 to maxTimelineMinutes
  const minuteColumns = useMemo(() => {
    const cols = [];
    for (let m = 0; m < maxTimelineMinutes; m++) {
      cols.push({
        minuteIndex: m,
        label: `${m.toString().padStart(2, '0')}м`
      });
    }
    return cols;
  }, [maxTimelineMinutes]);

  // Calculate timeline state for a stand at minute m
  const getStandMinuteState = (standId: string, minuteIdx: number) => {
    const standTasks = allTasks.filter(t => t.standId === standId);
    if (standTasks.length === 0) return null;

    for (const t of standTasks) {
      const startSec = t.startedAtSimSec ?? t.createdAtSimSec ?? 0;
      const startMin = Math.floor(startSec / 60);

      const transitMin = Math.max(1, Math.round(t.maxEtaMinutes || 5));
      const arrivalMin = startMin + transitMin;

      const workMin = Math.max(1, Math.round((t.targetWorkSec || 120) / 60));
      const completionMin = t.completedAtSimSec
        ? Math.floor(t.completedAtSimSec / 60)
        : arrivalMin + workMin;

      if (minuteIdx >= startMin && minuteIdx < arrivalMin) {
        return { phase: 'TRANSIT', task: t };
      }
      if (minuteIdx >= arrivalMin && minuteIdx < completionMin) {
        return { phase: 'WORKING', task: t };
      }
      if (minuteIdx >= completionMin && minuteIdx < completionMin + 2) {
        if (t.status === 'COMPLETED') {
          return { phase: 'COMPLETED', task: t };
        }
      }
    }

    return null;
  };

  // Convert standard vertical mouse wheel scroll into horizontal scroll!
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (tableContainerRef.current && e.deltaY !== 0) {
      tableContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-fadeIn font-mono">
      <div className={`w-full max-w-7xl max-h-[94vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
        theme === 'dark' ? 'bg-[#06090e] border-[#1e2a3a] text-gray-100' : 'bg-white border-slate-300 text-slate-900'
      }`}>
        {/* Header */}
        <div className="p-3.5 border-b flex items-center justify-between border-slate-200 dark:border-[#1e2a3a] bg-slate-100/70 dark:bg-[#0c121b]/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Table className="w-6 h-6" />
            </div>
            <h2 className="font-extrabold text-base uppercase tracking-wider text-slate-900 dark:text-white">
              📊 ГАНТ-МАТРИЦА СТОЯНОК SVO
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* ONE Large Continuous Horizontal Scroll Container (Wheel-scrollable) */}
        <div
          ref={tableContainerRef}
          onWheel={handleWheel}
          className="flex-1 overflow-x-auto overflow-y-auto p-3 select-none"
          style={{ scrollbarWidth: 'thin' }}
        >
          <div className="border rounded-xl border-slate-300 dark:border-[#1e2a3a]">
            <table className="w-full text-left border-collapse min-w-[2800px]">
              {/* Header Columns */}
              <thead>
                <tr className="bg-slate-200 dark:bg-[#101724] border-b border-slate-300 dark:border-[#1e2a3a] text-xs font-bold text-gray-400">
                  <th className="p-3 w-48 sticky left-0 z-20 bg-slate-200 dark:bg-[#101724] border-r border-slate-300 dark:border-[#1e2a3a] uppercase">
                    <div className="flex items-center gap-1.5 text-slate-800 dark:text-gray-200 font-extrabold text-sm">
                      <MapPin className="w-4 h-4 text-sky-400" /> Стоянки
                    </div>
                  </th>
                  {minuteColumns.map(col => {
                    const isNow = col.minuteIndex === currentSimMin;
                    return (
                      <th
                        key={col.minuteIndex}
                        className={`p-1.5 min-w-[42px] text-center border-r text-xs font-mono transition-colors ${
                          isNow
                            ? 'bg-sky-500/30 text-sky-300 border-sky-400 font-extrabold text-sm'
                            : 'border-slate-300/60 dark:border-[#1a2433]'
                        }`}
                      >
                        {col.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Rows: Fixed Stand Stations (No "Стоянка" prefix, no aircraft types) */}
              <tbody className="divide-y divide-slate-200 dark:divide-[#16202e] text-sm font-mono">
                {standNodes.map(stand => {
                  const standTasks = allTasks.filter(t => t.standId === stand.id);
                  const hasActive = standTasks.some(t => t.status === 'DISPATCHED' || t.status === 'WORKING');

                  return (
                    <tr
                      key={stand.id}
                      className={`hover:bg-slate-100/80 dark:hover:bg-[#0e1623] transition-colors ${
                        hasActive ? 'bg-sky-950/20' : ''
                      }`}
                    >
                      {/* Sticky Stand Header Column */}
                      <td className="p-2.5 sticky left-0 z-10 bg-slate-50 dark:bg-[#090e15] border-r border-slate-300 dark:border-[#1e2a3a] font-bold">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                            {stand.label}
                          </span>
                          {standTasks.length > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                              {standTasks.length}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Minute Cells Across Timeline */}
                      {minuteColumns.map(col => {
                        const cellState = getStandMinuteState(stand.id, col.minuteIndex);
                        const isNowCol = col.minuteIndex === currentSimMin;

                        let cellStyle = isNowCol
                          ? 'bg-sky-500/10 border-r border-sky-500/40 text-slate-400'
                          : 'bg-transparent text-slate-600 dark:text-[#162232] border-r border-slate-200 dark:border-[#151f2c]';
                        let content = '·';
                        let title = `${stand.label} (${col.label}): свободно`;

                        if (cellState) {
                          const { phase, task } = cellState;
                          title = `${stand.label} (${col.label}): ${task.id} (${task.defectLabel || task.categoryLabel}) — ${phase}`;

                          if (phase === 'TRANSIT') {
                            cellStyle = 'bg-sky-500/80 border-r border-sky-400 text-white font-bold shadow-sm shadow-sky-500/40';
                            content = '🚘';
                          } else if (phase === 'WORKING') {
                            cellStyle = 'bg-emerald-500/80 border-r border-emerald-400 text-white font-bold shadow-sm shadow-emerald-500/40';
                            content = '🔧';
                          } else if (phase === 'COMPLETED') {
                            cellStyle = 'bg-emerald-700/80 border-r border-emerald-600 text-white font-bold shadow-sm';
                            content = '✓';
                          }
                        }

                        return (
                          <td
                            key={col.minuteIndex}
                            className={`p-1 text-center text-xs transition-all ${cellStyle}`}
                            title={title}
                          >
                            <div className="h-7 flex items-center justify-center font-bold text-sm">
                              {content}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Legend */}
        <div className="p-3 border-t flex justify-between items-center border-slate-200 dark:border-[#1e2a3a] bg-slate-100/70 dark:bg-[#0c121b]/90 text-sm shrink-0 font-mono">
          <div className="flex items-center space-x-5">
            <span className="flex items-center gap-1.5 text-sky-400 font-bold">
              <span className="w-4 h-4 rounded bg-sky-500 flex items-center justify-center text-xs text-white">🚘</span> Путь
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="w-4 h-4 rounded bg-emerald-500 flex items-center justify-center text-xs text-white">🔧</span> Ремонт
            </span>
            <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
              <span className="w-4 h-4 rounded bg-emerald-700 flex items-center justify-center text-xs text-white">✓</span> Выполнено
            </span>
            <span className="flex items-center gap-1.5 text-gray-400 font-bold">
              <span className="w-4 h-4 rounded bg-[#162232] flex items-center justify-center text-xs text-gray-400">·</span> Свободна
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition-all cursor-pointer shadow-md text-sm"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimelineModal;
