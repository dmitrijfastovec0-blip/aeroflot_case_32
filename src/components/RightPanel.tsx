/**
 * ============================================================================
 * ПРАВАЯ ОПЕРАТИВНАЯ ПАНЕЛЬ ДИСПЕТЧЕРА (RIGHT PANEL)
 * ----------------------------------------------------------------------------
 * Основная интерактивная рабочая панель:
 * - Монитор активного сценария: карточки текущих задач, статус движения бригады,
 *   индикатор физического прогресса пути (0-100%), таймеры SLA.
 * - Ручное переназначение (Manual Override): возможность вручную закрепить
 *   специалиста за дефектом в обход автоматического алгоритма.
 * - Создание новой заявки: выбор стоянки, дефекта по главе ATA, приоритета.
 * - Архив выполненных задач: история обслуженных бортов с расчетом времени.
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { OtoTask, TaskCrewMember, Worker, ThemeMode, Stand, AirportElement, AirportConnection } from '../types';
import { SVO_STANDS, DEFECT_TYPES, CrewRequirement } from '../constants';
import { findNearestFreeWorkerOfExactCategory, findNearestFreeCustomWorker } from '../services';
import { calculateTaskTransitProgressPct, formatCompletedTaskDuration } from '../utils';
import { Wrench, Rocket, MapPin, Users, ChevronRight, ChevronLeft, Zap, Target, CheckCircle2, ChevronDown, Activity, Clock, Archive, UserRoundCheck } from 'lucide-react';

/** Свойства правой оперативной панели */
interface RightPanelProps {

  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  workers: Worker[];
  tasks: OtoTask[];
  onLaunchTask: (task: OtoTask) => void;
  onManualAssign?: (taskId: string, workerId: string) => void;
  onTriggerSlaAlert: (task: OtoTask) => void;
  onNotify: (msg: string) => void;
  activeTaskForStand?: OtoTask | null;
  theme: ThemeMode;
  trackedWorkerId?: string | null;
  onTrackWorker?: (workerId: string) => void;
  activeScenarioName?: string;
  archivedTasks?: OtoTask[];
  stands?: Stand[];
  customElements?: AirportElement[];
  customConnections?: AirportConnection[];
}

const SLA_LIMIT = 15.0;

export const RightPanel = React.memo<RightPanelProps>(({
  selectedStandId,
  onSelectStand,
  workers,
  tasks,
  onLaunchTask,
  onManualAssign,
  onTriggerSlaAlert,
  onNotify,
  activeTaskForStand,
  theme,
  trackedWorkerId,
  onTrackWorker,
  activeScenarioName = 'Оперативный план',
  archivedTasks = [],
  stands,
  customElements = [],
  customConnections = []
}) => {
  const isCustomMode = customElements.length > 0;
  const availableStands = useMemo(() => (stands && stands.length > 0) ? stands : SVO_STANDS, [stands]);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [panelMode, setPanelMode] = useState<'SCENARIO_MONITOR' | 'ARCHIVE' | 'CREATE'>('SCENARIO_MONITOR');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [manualWorkerByTask, setManualWorkerByTask] = useState<Record<string, string>>({});

  // Auto-open panel when a scenario is launched or tasks are active
  useEffect(() => {
    if (tasks.length > 0 || (activeScenarioName && activeScenarioName !== 'Оперативный план')) {
      setIsCollapsed(false);
    }
  }, [tasks.length, activeScenarioName]);

  const [standId, setStandId] = useState<string>(selectedStandId || availableStands[0]?.id || SVO_STANDS[0].id);
  const [defectId, setDefectId] = useState<string>('');

  const selectedDefect = DEFECT_TYPES.find(d => d.id === defectId);
  const currentStand = availableStands.find(s => s.id === standId) || availableStands[0] || SVO_STANDS[0];

  // Sync selected stand
  useEffect(() => {
    if (selectedStandId) {
      setStandId(selectedStandId);
    }
  }, [selectedStandId]);

  // When tasks update or a stand is clicked, update expanded task
  useEffect(() => {
    if (tasks.length > 0) {
      if (activeTaskForStand) {
        setExpandedTaskId(activeTaskForStand.id);
        if (panelMode !== 'ARCHIVE') setPanelMode('SCENARIO_MONITOR');
      } else if (!expandedTaskId || !tasks.some(t => t.id === expandedTaskId)) {
        setExpandedTaskId(tasks[0].id);
        if (panelMode !== 'ARCHIVE') setPanelMode('SCENARIO_MONITOR');
      }
    } else if (archivedTasks.length === 0) {
      setPanelMode('CREATE');
    }
  }, [tasks, activeTaskForStand, archivedTasks.length]);

  const autoCrew: TaskCrewMember[] = useMemo(() => {
    if (!selectedDefect) return [];
    const used = new Set<string>();
    const members: TaskCrewMember[] = [];
    for (const req of selectedDefect.requiredCrew as CrewRequirement[]) {
      for (let i = 0; i < req.count; i++) {
        const m = isCustomMode
          ? findNearestFreeCustomWorker(
              req.categoryCode, currentStand, workers, used,
              customElements, customConnections
            )
          : findNearestFreeWorkerOfExactCategory(
              req.categoryCode, currentStand, workers, used
            );
        if (!m) break;
        used.add(m.workerId);
        members.push(m);
      }
    }
    return members;
  }, [selectedDefect, currentStand, workers, isCustomMode, customElements, customConnections]);

  const crew: TaskCrewMember[] = autoCrew;
  const maxEtaMinutes = crew.length ? Math.max(...crew.map(m => m.etaMinutes)) : 0;
  const withinSla = crew.length > 0 && maxEtaMinutes <= SLA_LIMIT;

  const handleLaunch = () => {
    if (!selectedDefect) {
      onNotify('⚠️ Выберите тип неисправности.');
      return;
    }
    const newTask: OtoTask = {
      id: `TASK-${Date.now().toString().slice(-5)}`,
      standId: currentStand.id,
      standLabel: `Стоянка ${currentStand.label}`,
      aircraftType: currentStand.aircraftType,
      categoryCode: selectedDefect.categoryCode,
      categoryLabel: selectedDefect.ataLabel,
      defectLabel: selectedDefect.name,
      priority: selectedDefect.id === 'ATA72' || selectedDefect.id === 'ATA49' ? 'AOG' : 'URGENT',
      status: 'QUEUED',
      requiredCrew: selectedDefect.requiredCrew as CrewRequirement[],
      crew: crew,
      arrivedCount: 0,
      maxEtaMinutes: maxEtaMinutes,
      withinSla: withinSla,
      slaLimitMinutes: SLA_LIMIT,
      createdAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      elapsedWorkSec: 0,
      targetWorkSec: 40
    };

    if (!withinSla) {
      onTriggerSlaAlert(newTask);
    } else {
      onLaunchTask(newTask);
      setExpandedTaskId(newTask.id);
      setPanelMode('SCENARIO_MONITOR');
      onNotify(`🚀 Вызов на стоянку ${currentStand.label}`);
    }
  };

  const cardStyle = theme === 'dark'
    ? 'bg-[#0b1017]/95 border-[#1e2a3a] text-gray-200 backdrop-blur-md shadow-2xl'
    : 'bg-white/95 border-slate-200 text-slate-900 backdrop-blur-md shadow-xl';

  if (isCollapsed) {
    return (
      <div className="absolute right-4 top-4 z-20 flex flex-col items-center">
        <button
          onClick={() => setIsCollapsed(false)}
          className={`p-3 rounded-2xl border font-mono text-xs font-bold transition-all shadow-xl flex items-center space-x-2 cursor-pointer ${
            theme === 'dark'
              ? 'bg-[#121820]/90 hover:bg-[#1a2330] border-[#263345] text-sky-400'
              : 'bg-white hover:bg-slate-100 border-slate-300 text-sky-600'
          }`}
          title="Развернуть панель сценариев"
        >
          <ChevronLeft className="w-4 h-4" />
          <Wrench className="w-4 h-4" />
          <span className="font-bold">ЦУП ОТО</span>
        </button>
      </div>
    );
  }

  // Helper for timestamps
  const getTaskTimestamps = (t: OtoTask) => {
    const startTime = t.createdAt || '14:00';
    const etaText = `${t.maxEtaMinutes || 12} мин`;
    
    let endTimeText = 'В процессе';
    if (t.status === 'COMPLETED') {
      endTimeText = `Завершено за ${formatCompletedTaskDuration(t)}`;
    } else {
      const parts = startTime.split(':');
      if (parts.length >= 2) {
        const startMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        const endTotalMin = startMin + Math.ceil(t.maxEtaMinutes || 12) + 2;
        const endH = Math.floor(endTotalMin / 60) % 24;
        const endM = endTotalMin % 60;
        endTimeText = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
      }
    }

    return { startTime, etaText, endTimeText };
  };

  return (
    <div className={`absolute right-4 top-3 bottom-20 max-h-[calc(100vh-7rem)] w-96 z-30 flex flex-col rounded-2xl border transition-all overflow-hidden font-mono ${cardStyle}`}>
      {/* Panel Header */}
      <div className="p-3 border-b flex items-center justify-between border-slate-200 dark:border-[#1e2a3a] bg-slate-100/50 dark:bg-[#121820]/50 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
            <Wrench className="w-4 h-4" />
          </div>
          <span className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white">
            ЦУП ОТО · SVO
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Switcher Tabs (3 Tabs: Сценарий, Архив, Новое) */}
      <div className="flex border-b border-slate-200 dark:border-[#1e2a3a] bg-slate-50 dark:bg-[#0c1219] p-1 gap-1 text-xs font-bold shrink-0">
        <button
          onClick={() => setPanelMode('SCENARIO_MONITOR')}
          className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center space-x-1 ${
            panelMode === 'SCENARIO_MONITOR'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Сценарий ({tasks.length})</span>
        </button>

        <button
          onClick={() => setPanelMode('ARCHIVE')}
          className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center space-x-1 ${
            panelMode === 'ARCHIVE'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Архив ({archivedTasks.length})</span>
        </button>

        <button
          onClick={() => setPanelMode('CREATE')}
          className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center space-x-1 ${
            panelMode === 'CREATE'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Rocket className="w-3.5 h-3.5" />
          <span>➕ Новое</span>
        </button>
      </div>

      {/* Panel Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 text-xs">
        {panelMode === 'SCENARIO_MONITOR' && (
          /* SCENARIO TASK MONITOR WITH MINIMAL SMOOTH PROGRESS BARS & GREEN COMPLETED CARDS */
          tasks.length === 0 ? (
            <div className="text-center py-10 text-gray-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/60" />
              <p className="font-bold">Нет активных вызовов в сценарии</p>
              <p className="text-[10px] text-gray-500">Запустите сценарий или перейдите в Архив</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {/* Active Scenario Card Header */}
              <div className="p-3 rounded-xl bg-gradient-to-br from-sky-900/40 to-blue-900/30 border border-sky-500/40 text-sky-200 space-y-1 shadow-md">
                <div className="flex justify-between items-center text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                  <span>🎬 Активный сценарий</span>
                  <span>{tasks.length} Задач</span>
                </div>
                <div className="font-extrabold text-sm text-white flex items-center gap-1.5">
                  <span>{activeScenarioName}</span>
                </div>
              </div>

              {/* UNIFIED LIST OF ALL TASKS IN THIS SCENARIO */}
              <div className="space-y-2">
                {tasks.map((task) => {
                  const isExpanded = expandedTaskId === task.id;
                   const isAog = task.priority === 'AOG';
                   const isCompleted = task.status === 'COMPLETED';
                   const slaRemaining = Math.round((SLA_LIMIT - (task.elapsedQueueSec || 0) / 60 - (task.maxEtaMinutes || 0)) * 10) / 10;
                   const slaState = slaRemaining <= 0 ? 'breach' : slaRemaining <= 5 ? 'warning' : 'ok';
                   const manualCandidates = task.status === 'QUEUED' && (task.requiredCrew?.reduce((sum, r) => sum + r.count, 0) || 1) === 1
                     ? workers.filter(w => (w.categoryCode === task.categoryCode || task.categoryCode === 'A') && (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING'))
                     : [];

                  // 1. Smooth Physical Transit Progress (Путь)
                  const transitPct = calculateTaskTransitProgressPct(task, workers);

                  // 2. Smooth Repair Progress (Ремонт)
                  const elapsedWork = task.elapsedWorkSec || 0;
                  const targetWork = task.targetWorkSec || 40;
                  const repairPct = task.status === 'WORKING'
                    ? Math.min(99, Math.floor((elapsedWork / targetWork) * 100))
                    : isCompleted ? 100 : 0;

                  // Card styling depending on state
                   let cardBgClass = 'bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-[#1a2330] border-slate-300 dark:border-[#263345]';
                   if (isCompleted) {
                     cardBgClass = 'bg-emerald-600/90 hover:bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/20';
                   } else if (slaState === 'breach') {
                     cardBgClass = 'bg-red-950/55 hover:bg-red-950/70 border-red-500/80 ring-1 ring-red-500/40 shadow-lg shadow-red-500/15';
                   } else if (isExpanded) {
                    cardBgClass = isAog
                      ? 'bg-red-950/40 border-red-500/60 ring-1 ring-red-500/30 shadow-lg'
                      : 'bg-sky-950/40 border-sky-500/60 ring-1 ring-sky-500/30 shadow-lg';
                  }

                  return (
                    <div
                      key={task.id}
                      className={`rounded-xl border transition-all overflow-hidden ${cardBgClass}`}
                    >
                      {/* Task Header Bar (Click to Expand / Collapse) */}
                      <button
                        onClick={() => {
                          setExpandedTaskId(prev => prev === task.id ? null : task.id);
                          onSelectStand(task.standId);
                        }}
                        className="w-full p-2.5 text-left flex flex-col space-y-2 cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className={`text-base font-extrabold tracking-wide ${isCompleted ? 'text-white' : 'text-sky-400'}`}>
                              {task.standLabel.replace(/^Стоянка\s*/i, '')}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              isCompleted
                                ? 'bg-white/20 text-white'
                                : isAog || slaState === 'breach' ? 'bg-red-500 text-white animate-pulse' : 'bg-sky-600 text-white'
                            }`}>
                              {isCompleted ? 'ГОТОВО' : task.priority}
                            </span>
                            <ChevronDown className={`w-4 h-4 ${isCompleted ? 'text-white' : 'text-gray-400'} transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </div>

                         <div className={`text-[11px] font-semibold line-clamp-1 ${isCompleted ? 'text-emerald-100' : 'text-slate-600 dark:text-gray-300'}`}>
                           🔧 {task.defectLabel || task.categoryLabel}
                         </div>

                         {!isCompleted && (
                           <div className={`flex items-center justify-between text-[10px] font-bold ${slaState === 'breach' ? 'text-red-400' : slaState === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
                             <span>SLA</span>
                             <span>{slaState === 'breach' ? `нарушен на ${Math.abs(slaRemaining).toFixed(1)} мин` : `${slaRemaining.toFixed(1)} мин запаса`}</span>
                           </div>
                         )}

                        {/* LIVE SMOOTH MINIMAL PROGRESS BARS (NO CLUTTERING TEXT ABOVE) */}
                        {!isCompleted ? (
                          <div className="space-y-1 pt-1">
                            {task.status === 'DISPATCHED' && (
                              <div className="w-full h-1.5 rounded-full bg-slate-300 dark:bg-[#1e2a3a] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-sky-500 transition-all duration-300 shadow-sm shadow-sky-500/50"
                                  style={{ width: `${transitPct}%` }}
                                />
                              </div>
                            )}

                            {task.status === 'WORKING' && (
                              <div className="w-full h-1.5 rounded-full bg-slate-300 dark:bg-[#1e2a3a] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all duration-300 shadow-sm shadow-emerald-500/50"
                                  style={{ width: `${repairPct}%` }}
                                />
                              </div>
                            )}

                            {task.status === 'QUEUED' && (
                              <div className="w-full h-1.5 rounded-full bg-slate-300 dark:bg-[#1e2a3a] overflow-hidden">
                                <div className="h-full rounded-full bg-amber-500/50 animate-pulse w-1/3" />
                              </div>
                            )}
                          </div>
                        ) : (
                          /* COMPLETED STATE: NO PROGRESS BAR — SOLID TIME METRIC DISPLAY */
                          <div className="flex items-center justify-between text-xs font-bold text-white pt-1 border-t border-emerald-400/40">
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4 text-emerald-200" /> Итоговое время:
                            </span>
                            <span className="text-emerald-100 bg-black/20 px-2 py-0.5 rounded-md">
                              {formatCompletedTaskDuration(task)}
                            </span>
                          </div>
                        )}
                      </button>

                      {/* Expanded Task Details (Timestamps & Workers Buttons) */}
                      {isExpanded && (
                        <div className={`p-3 border-t space-y-3 animate-fadeIn ${
                          isCompleted
                            ? 'border-emerald-400/40 bg-emerald-700/60 text-white'
                            : 'border-slate-200 dark:border-[#263345] bg-slate-50/50 dark:bg-[#090e15]/60'
                        }`}>
                          {/* Timestamps Section */}
                          <div className={`p-2.5 rounded-lg border space-y-1 text-[11px] ${
                            isCompleted
                              ? 'bg-emerald-800/60 border-emerald-400/40 text-white'
                              : 'bg-slate-100 dark:bg-[#121820] border-slate-300 dark:border-[#263345]'
                          }`}>
                            <div className={`text-[10px] font-bold uppercase border-b pb-1 flex items-center gap-1 ${
                              isCompleted ? 'text-emerald-200 border-emerald-400/30' : 'text-gray-400 border-slate-200 dark:border-[#263345]'
                            }`}>
                              <Clock className="w-3 h-3 text-sky-400" /> Временные метки:
                            </div>
                            {(() => {
                              const { startTime, etaText } = getTaskTimestamps(task);
                              return (
                                <div className="space-y-1 font-semibold pt-1">
                                  <div className="flex justify-between">
                                    <span className={isCompleted ? 'text-emerald-100' : 'text-gray-400'}>🟢 Начало:</span>
                                    <span className="font-bold text-emerald-300">{startTime}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className={isCompleted ? 'text-emerald-100' : 'text-gray-400'}>🚘 В пути (ETA):</span>
                                    <span className="font-bold text-sky-300">{etaText}</span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-2.5 text-[11px]">
                            <div className="mb-1 text-[10px] font-bold uppercase text-sky-400">Почему принято это решение</div>
                            <p className="leading-relaxed text-slate-600 dark:text-gray-300">
                              {task.waitingReason
                                ? task.waitingReason
                                : task.crew.length > 0
                                  ? `Назначены ${task.crew.map(member => `${member.workerName} (${member.categoryCode})`).join(', ')}: минимальный маршрут до стоянки с учётом квалификации и SLA.`
                                  : 'Система подбирает полный состав бригады по регламенту задачи.'}
                            </p>
                          </div>

                          {manualCandidates.length > 0 && onManualAssign && (
                             <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
                               <div className="text-[10px] font-bold uppercase text-amber-400 flex items-center gap-1">
                                 <UserRoundCheck className="w-3 h-3" /> Ручное назначение
                               </div>
                               <div className="flex gap-2">
                                 <select
                                   value={manualWorkerByTask[task.id] || ''}
                                   onChange={e => setManualWorkerByTask(prev => ({ ...prev, [task.id]: e.target.value }))}
                                   onClick={e => e.stopPropagation()}
                                   className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-[#263345] bg-white dark:bg-[#121820] px-2 py-1.5 text-[10px] font-bold"
                                 >
                                   <option value="">Выбрать специалиста</option>
                                   {manualCandidates.map(w => <option key={w.id} value={w.id}>{w.name} · {w.categoryCode}</option>)}
                                 </select>
                                 <button
                                   disabled={!manualWorkerByTask[task.id]}
                                   onClick={e => { e.stopPropagation(); onManualAssign(task.id, manualWorkerByTask[task.id]); }}
                                   className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-[10px] font-extrabold text-slate-950 disabled:opacity-40"
                                 >
                                   Назначить
                                 </button>
                               </div>
                             </div>
                           )}

                           {/* Crew Workers as Action Buttons with Camera Fix */}
                          <div className="space-y-1">
                            <div className={`text-[10px] font-bold uppercase flex items-center gap-1 ${
                              isCompleted ? 'text-emerald-200' : 'text-gray-400'
                            }`}>
                              <Users className="w-3 h-3 text-emerald-300" /> Работники (нажмите для фиксации):
                            </div>

                            {task.crew && task.crew.length > 0 ? (
                              <div className="grid grid-cols-1 gap-1">
                                {task.crew.map((member) => {
                                  const isTracked = trackedWorkerId === member.workerId;
                                  return (
                                    <button
                                      key={member.workerId}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (onTrackWorker) onTrackWorker(member.workerId);
                                      }}
                                      className={`w-full p-2 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer font-bold ${
                                        isTracked
                                          ? 'bg-sky-500/30 border-sky-400 text-white shadow-md animate-pulse ring-2 ring-sky-400/50'
                                          : isCompleted
                                            ? 'bg-emerald-800/60 hover:bg-emerald-800 border-emerald-400/40 text-white'
                                            : 'bg-slate-100 dark:bg-[#121820] hover:bg-slate-200 dark:hover:bg-[#1a2330] border-slate-300 dark:border-[#263345] text-slate-800 dark:text-gray-200'
                                      }`}
                                    >
                                      <div className="flex items-center space-x-2">
                                        <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px]">
                                          👷 {member.categoryCode}
                                        </span>
                                        <span className="text-xs">{member.workerName}</span>
                                      </div>
                                      <div className="flex items-center space-x-1 text-[10px] font-bold text-sky-300">
                                        <Target className="w-3.5 h-3.5" />
                                        <span>{isTracked ? '🎯 В КАМЕРЕ' : 'ФИКС'}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="p-2 rounded-lg bg-slate-100 dark:bg-[#121820] text-center text-gray-400 text-[11px]">
                                ⏳ Сбор бригады...
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* COLLAPSIBLE ARCHIVE DROPDOWN AT BOTTOM OF SCENARIO LIST */}
              {archivedTasks.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-[#1e2a3a] space-y-2">
                  <button
                    onClick={() => setIsArchiveOpen(prev => !prev)}
                    className="w-full p-2.5 rounded-xl border bg-slate-100 dark:bg-[#121820] border-slate-300 dark:border-[#263345] flex items-center justify-between font-bold text-xs text-slate-700 dark:text-gray-300 cursor-pointer hover:bg-slate-200 dark:hover:bg-[#1a2330] transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-gray-400 font-bold">
                      📁 Архив прошлых вызовов ({archivedTasks.length})
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isArchiveOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isArchiveOpen && (
                    <div className="space-y-1.5 animate-fadeIn pl-1">
                      {archivedTasks.map(t => (
                        <div
                          key={t.id}
                          className="p-2 rounded-lg border border-slate-300 dark:border-[#263345] bg-slate-100/60 dark:bg-[#0e141d] flex items-center justify-between text-xs text-gray-300 font-semibold"
                        >
                          <div className="flex items-center space-x-2 font-extrabold text-sm text-sky-400">
                            <span>{t.standLabel.replace(/^Стоянка\s*/i, '')}</span>
                          </div>
                          <span className="text-emerald-400 font-bold">
                            {formatCompletedTaskDuration(t)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )}

        {/* FULL ARCHIVE MODE VIEW */}
        {panelMode === 'ARCHIVE' && (
          <div className="space-y-3 pb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-950/50 to-teal-950/30 border border-emerald-500/40 text-emerald-200 space-y-1 shadow-md">
              <div className="flex justify-between items-center text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <span>📁 Архив вызовов</span>
                <span>{archivedTasks.length} Всего</span>
              </div>
              <div className="font-bold text-xs text-emerald-100">
                Завершённые вызовы предыдущих сценариев
              </div>
            </div>

            {archivedTasks.length === 0 ? (
              <div className="text-center py-12 text-gray-400 space-y-2">
                <Archive className="w-8 h-8 mx-auto text-emerald-500/50" />
                <p className="font-bold">Архив пока пуст</p>
                <p className="text-xs text-gray-500">При запуске нового сценария прошлые задачи попадут сюда</p>
              </div>
            ) : (
              <div className="space-y-2">
                {archivedTasks.map(t => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl border border-slate-300 dark:border-[#263345] bg-slate-100/70 dark:bg-[#121820] space-y-1.5 font-semibold"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-extrabold text-base text-sky-400">{t.standLabel.replace(/^Стоянка\s*/i, '')}</span>
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">
                      🔧 {t.defectLabel || t.categoryLabel}
                    </div>
                    <div className="flex justify-between items-center text-[10px] pt-1 border-t border-slate-200 dark:border-[#263345]">
                      <span className="text-gray-400">🟢 {t.createdAt || '14:00'}</span>
                      <span className="text-emerald-400 font-bold">✅ Итого: {formatCompletedTaskDuration(t)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CONSTRUCTOR MODE (➕ НОВОЕ ЗАДАНИЕ) */}
        {panelMode === 'CREATE' && (
          <div className="space-y-3 pb-4">
            {/* Step 1: Select Stand */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-sky-400" /> Выбор стоянки:
              </label>
              <select
                value={standId}
                onChange={(e) => {
                  setStandId(e.target.value);
                  onSelectStand(e.target.value);
                }}
                className="w-full p-2 rounded-xl border bg-slate-50 dark:bg-[#121820] border-slate-300 dark:border-[#263345] text-slate-900 dark:text-white font-bold cursor-pointer text-xs"
              >
                {availableStands.map(s => (
                  <option key={s.id} value={s.id}>
                    Стоянка {s.label} ({s.aircraftType})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Stand Chips */}
            <div className="flex flex-wrap gap-1">
              {availableStands.slice(0, 6).map(st => {
                const isSel = st.id === standId;
                return (
                  <button
                    key={st.id}
                    onClick={() => {
                      setStandId(st.id);
                      onSelectStand(st.id);
                    }}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                      isSel
                        ? 'bg-sky-500/20 border-sky-500 text-sky-400'
                        : 'bg-slate-100 dark:bg-[#121820] border-slate-300 dark:border-[#263345] text-slate-600 dark:text-gray-400'
                    }`}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>

            {/* Step 2: Defect Type */}
            <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-[#1e2a3a]">
              <label className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" /> Тип неисправности:
              </label>
              <div className="grid grid-cols-1 gap-1 max-h-44 overflow-y-auto pr-1">
                {DEFECT_TYPES.map(def => {
                  const isSel = def.id === defectId;
                  const isAog = def.id === 'ATA72' || def.id === 'ATA49';
                  return (
                    <button
                      key={def.id}
                      onClick={() => setDefectId(def.id)}
                      className={`p-2 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSel
                          ? isAog
                            ? 'bg-red-500/20 border-red-500 text-red-400 font-bold'
                            : 'bg-sky-500/20 border-sky-500 text-sky-400 font-bold'
                          : 'bg-slate-50 dark:bg-[#121820] border-slate-300 dark:border-[#263345] text-slate-700 dark:text-gray-300'
                      }`}
                    >
                      <span className="text-xs font-bold">{def.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        isAog ? 'bg-red-500/30 text-red-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                      }`}>
                        {def.ataLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Auto Crew Preview */}
            {selectedDefect && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#1e2a3a]">
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-[#263345] space-y-1.5 text-xs">
                  {crew.map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <span className="font-bold text-slate-800 dark:text-gray-200">
                        👷 {m.workerName} ({m.categoryCode})
                      </span>
                      <span className="text-emerald-400 font-bold">
                        ETA {m.etaMinutes} мин
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawer Action Footer for Create Mode */}
      {panelMode === 'CREATE' && (
        <div className="p-3 border-t border-slate-200 dark:border-[#1e2a3a] bg-slate-100/50 dark:bg-[#121820]/50 shrink-0">
          <button
            onClick={handleLaunch}
            disabled={!selectedDefect}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 cursor-pointer transition-all shadow-lg ${
              selectedDefect
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-500/25 active:scale-95'
                : 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-gray-500 cursor-not-allowed'
            }`}
          >
            <Rocket className="w-4 h-4" />
            <span>Направить бригаду</span>
          </button>
        </div>
      )}
    </div>
  );
});

export default RightPanel;
