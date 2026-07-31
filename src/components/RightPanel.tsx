import React, { useState, useEffect, useMemo } from 'react';
import { CategoryCode, OtoTask, TaskCrewMember, Worker, ThemeMode, TaskPriority } from '../types/index';
import { SVO_STANDS, DEFECT_TYPES } from '../constants/index';
import { findNearestFreeWorkerOfCategory, calculateCrewMaxEta, getCategoryCandidates, findNaiveNearestWorkerOfCategory } from '../services/dijkstra';
import { Wrench, Trash2, Rocket, CheckCircle2, AlertTriangle, MapPin, Users, Clock, ShieldCheck, Timer, Flame, AlertCircle, Crosshair, BrainCircuit, Sparkles } from 'lucide-react';

interface RightPanelProps {
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  workers: Worker[];
  onLaunchTask: (task: OtoTask) => void;
  onTriggerSlaAlert: (task: OtoTask) => void;
  activeTaskForStand?: OtoTask | null;
  theme: ThemeMode;
}

// Small numbered step badge for a clear, guided workflow
const StepBadge = ({ n, color }: { n: number; color: string }) => (
  <span className={`w-6 h-6 rounded-full ${color} text-white font-mono text-[11px] font-black flex items-center justify-center shrink-0 shadow-sm`}>
    {n}
  </span>
);

const StepTitle = ({ n, color, title, hint }: { n: number; color: string; title: string; hint?: string }) => (
  <div className="flex items-center gap-2 mb-2.5">
    <StepBadge n={n} color={color} />
    <span className="font-bold text-xs uppercase tracking-wider text-gray-400">{title}</span>
    {hint && <span className="ml-auto text-[10px] text-gray-500 font-mono">{hint}</span>}
  </div>
);

export const RightPanel: React.FC<RightPanelProps> = ({
  selectedStandId,
  onSelectStand,
  workers,
  onLaunchTask,
  onTriggerSlaAlert,
  activeTaskForStand,
  theme
}) => {
  const [standId, setStandId] = useState<string>(selectedStandId || SVO_STANDS[0].id);
  const [crew, setCrew] = useState<TaskCrewMember[]>([]);

  // Defect-type selector → auto-maps required qualification (catalog: defect → Cat B1/B2/A)
  const [defectId, setDefectId] = useState<string>('');
  const selectedDefect = DEFECT_TYPES.find(d => d.id === defectId);

  // Task Priority Selector (AOG, URGENT, ROUTINE)
  const [priority, setPriority] = useState<TaskPriority>('ROUTINE');

  // INTERACTIVE SLA LIMIT INPUT (Default 15.0 min, editable by user!)
  const [slaLimitMinutes, setSlaLimitMinutes] = useState<number>(15.0);

  const currentStand = SVO_STANDS.find(s => s.id === standId) || SVO_STANDS[0];

  // Candidate comparison: system (road graph, min ETA) vs intuitive dispatcher (straight line)
  const { systemCandidates, naivePick } = useMemo(() => {
    const reqCat = selectedDefect?.categoryCode || (crew.length ? crew[crew.length - 1].categoryCode : 'B1');
    const busy = new Set(
      workers.filter(w => w.status === 'IN_TRANSIT' || w.status === 'WORKING_ON_SITE').map(w => w.id)
    );
    const load: Record<string, number> = {};
    const systemCandidates = getCategoryCandidates(reqCat, currentStand, workers, busy, load)
      .filter(c => c.isAvailable)
      .sort((a, b) => a.etaMinutes - b.etaMinutes)
      .slice(0, 3);
    const naivePick = findNaiveNearestWorkerOfCategory(reqCat, currentStand, workers, busy);
    return { systemCandidates, naivePick };
  }, [selectedDefect, crew, currentStand, workers]);

  useEffect(() => {
    if (selectedStandId) {
      setStandId(selectedStandId);
      setCrew([]);
    }
  }, [selectedStandId]);

  // Quick Crew Assembly Handlers
  const handleAddNearestWorker = (catCode: CategoryCode) => {
    const alreadySelectedIds = new Set(crew.map(c => c.workerId));
    const nearestMember = findNearestFreeWorkerOfCategory(catCode, currentStand, workers, alreadySelectedIds);

    if (!nearestMember) {
      alert(`⚠️ Нет свободных доступных специалистов категории ${catCode}! При отправке задача встанет в ОЧЕРЕДЬ ОЖИДАНИЯ (QUEUED).`);
    } else {
      setCrew(prev => [...prev, nearestMember]);
    }
  };

  const handleRemoveWorker = (workerId: string) => {
    setCrew(prev => prev.filter(c => c.workerId !== workerId));
  };

  const { maxEtaMinutes, withinSla } = calculateCrewMaxEta(crew, slaLimitMinutes);
  const slaDiff = Math.abs(Math.round((slaLimitMinutes - maxEtaMinutes) * 10) / 10);

  // Submit & Launch Task Handler
  const handleLaunchTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newTask: OtoTask = {
      id: `TASK-${Date.now().toString().slice(-5)}`,
      standId: currentStand.id,
      standLabel: `Стоянка ${currentStand.label}`,
      aircraftType: `${currentStand.aircraftType} (${currentStand.airline || 'ПАО «Аэрофлот»'})`,
      categoryCode: crew[0]?.categoryCode || selectedDefect?.categoryCode || 'B1',
      categoryLabel: selectedDefect ? `ОТО · ${selectedDefect.name}` : `Бригада ОТО (${crew.length} чел.)`,
      defectLabel: selectedDefect?.name,
      priority,
      status: 'DISPATCHED',
      crew,
      arrivedCount: 0,
      maxEtaMinutes: maxEtaMinutes || 10.0,
      slaLimitMinutes,
      withinSla,
      createdAt: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
      elapsedQueueSec: 0,
      elapsedWorkSec: 0,
      targetWorkSec: 120
    };

    if (crew.length > 0 && !withinSla) {
      onTriggerSlaAlert(newTask);
      setCrew([]);
    } else {
      onLaunchTask(newTask);
      setCrew([]);
    }
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const cardClass = theme === 'dark' ? 'bg-[#121820] border-[#263345]' : 'bg-slate-50 border-slate-200';
  const reqCat = selectedDefect?.categoryCode || (crew.length ? crew[crew.length - 1].categoryCode : 'B1');

  return (
    <aside className={`w-[440px] min-w-[440px] h-full border-l overflow-y-auto flex flex-col p-5 space-y-4 select-none font-sans text-sm transition-colors ${
      theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-gray-100' : 'bg-white border-slate-300 text-slate-900 shadow-xl'
    }`}>
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-300 dark:border-[#263345] pb-3">
        <h2 className="font-bold text-base md:text-lg uppercase tracking-wider flex items-center gap-2 text-gray-100 dark:text-gray-100 text-slate-900">
          <Wrench className="w-5 h-5 text-sky-400" />
          📋 СОЗДАНИЕ ЗАДАНИЯ
        </h2>
        <span className="bg-[#121820] dark:bg-[#121820] bg-slate-100 text-sky-400 font-mono px-2.5 py-1 rounded-lg text-xs font-bold border border-[#263345] dark:border-[#263345] border-slate-300">
          Стоянка {currentStand.label}
        </span>
      </div>

      {/* ======================= ACTIVE TASK MONITOR ======================= */}
      {activeTaskForStand ? (
        <div className={`border rounded-xl p-4 space-y-3 font-mono ${cardClass}`}>
          <div className="flex items-center justify-between border-b border-slate-300 dark:border-[#263345] pb-2">
            <span className="font-bold text-sky-400 text-sm flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sky-400" /> Мониторинг задачи
            </span>
            <span className="text-xs text-gray-400">{activeTaskForStand.id}</span>
          </div>

          {activeTaskForStand.status === 'QUEUED' ? (
            /* QUEUED BADGE UPON STAFF DEFICIT WITH SIMULATION TIMER */
            <div className="bg-amber-500/15 border border-amber-500/60 rounded-xl p-3.5 space-y-2 text-amber-300">
              <div className="flex items-center justify-between font-bold text-sm">
                <span className="flex items-center space-x-1.5">
                  <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                  <span>⏳ В ОЧЕРЕДИ ОЖИДАНИЯ</span>
                </span>
                <span className="font-mono text-amber-400 text-sm">
                  {formatSec(activeTaskForStand.elapsedQueueSec || 0)}
                </span>
              </div>
              <div className="text-xs text-amber-200">
                Ожидание освобождения специалистов. Задача поставлена в приоритетную очередь ({activeTaskForStand.priority}).
              </div>
            </div>
          ) : (
            <div className={`p-3 rounded-lg border space-y-2.5 ${
              theme === 'dark' ? 'bg-[#070a0e] border-[#263345]' : 'bg-white border-slate-200'
            }`}>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Сбор и прибытие спецов:</span>
                <span className="font-bold text-emerald-500 text-sm">
                  {activeTaskForStand.arrivedCount} / {activeTaskForStand.crew.length} спецов
                </span>
              </div>

              <div className="w-full bg-slate-300 dark:bg-[#1e293b] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${activeTaskForStand.crew.length > 0 ? (activeTaskForStand.arrivedCount / activeTaskForStand.crew.length) * 100 : 0}%` }}
                />
              </div>

              {activeTaskForStand.arrivedCount === activeTaskForStand.crew.length && activeTaskForStand.crew.length > 0 && (
                <div className="space-y-1.5 border-t border-slate-200 dark:border-[#263345] pt-2">
                  <div className="flex justify-between text-xs items-center">
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <Timer className="w-3.5 h-3.5 animate-spin" /> Таймер ТО (2 мин):
                    </span>
                    <span className="font-bold text-amber-400 text-sm">
                      {formatSec(activeTaskForStand.elapsedWorkSec || 0)} / 02:00 ({Math.round(((activeTaskForStand.elapsedWorkSec || 0) / 120) * 100)}%)
                    </span>
                  </div>

                  <div className="w-full bg-slate-300 dark:bg-[#1e293b] rounded-full h-2.5 overflow-hidden p-0.5">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((activeTaskForStand.elapsedWorkSec || 0) / 120) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            {activeTaskForStand.crew.map(member => {
              const workerObj = workers.find(w => w.id === member.workerId);
              const isArrived = workerObj?.status === 'WORKING_ON_SITE';

              return (
                <div key={member.workerId} className={`p-2.5 rounded-lg border flex justify-between items-center text-xs ${
                  theme === 'dark' ? 'bg-[#070a0e] border-[#263345]' : 'bg-white border-slate-200'
                }`}>
                  <div>
                    <div className="font-bold text-sm">{member.workerName} ({member.categoryCode})</div>
                    <div className="text-xs text-gray-400">{member.vehicleLabel} • {member.etaMinutes} мин ETA</div>
                  </div>
                  <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                    isArrived ? 'bg-red-500/20 border border-red-500 text-red-400' : 'bg-sky-500/20 border border-sky-500 text-sky-400'
                  }`}>
                    {isArrived ? '🔴 На объекте' : '🔵 В пути'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {/* ======================= STEP 1: STAND ======================= */}
          <div className={`border rounded-xl p-4 space-y-3 ${cardClass}`}>
            <StepTitle n={1} color="bg-sky-600" title="Стоянка и борт" />
            <select
              value={standId}
              onChange={(e) => {
                setStandId(e.target.value);
                onSelectStand(e.target.value);
              }}
              className={`w-full border text-sm rounded-lg p-2.5 font-mono focus:border-sky-500 focus:outline-none ${
                theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-gray-100' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              {SVO_STANDS.map(s => (
                <option key={s.id} value={s.id}>
                  Стоянка {s.label} — {s.aircraftType} ({s.airline})
                </option>
              ))}
            </select>

            <div className={`font-mono text-xs p-3 rounded-lg border space-y-1.5 ${
              theme === 'dark' ? 'bg-[#070a0e] border-[#1e293b] text-gray-300' : 'bg-white border-slate-200 text-slate-700'
            }`}>
              <div className="flex justify-between">
                <span className="text-gray-400">Воздушное судно:</span>
                <span className="text-sky-400 font-bold text-sm">{currentStand.aircraftType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Эксплуатант:</span>
                <span className="font-semibold">{currentStand.airline || 'ПАО «Аэрофлот»'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Зона:</span>
                <span className="font-semibold">
                  {currentStand.complex === 'NORTH' ? 'Север B/C' : currentStand.complex === 'REMOTE' ? 'Ангарный сектор' : 'Юг D/E/F'}
                </span>
              </div>
            </div>
          </div>

          {/* ======================= STEP 2: DEFECT ======================= */}
          <div className={`border rounded-xl p-4 space-y-2.5 ${cardClass}`}>
            <StepTitle n={2} color="bg-orange-600" title="Тип неисправности" hint="→ квалификация" />
            <select
              value={defectId}
              onChange={e => {
                setDefectId(e.target.value);
                setCrew([]);
              }}
              className={`w-full border text-xs rounded-lg p-2 font-mono focus:border-orange-500 focus:outline-none ${
                theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-gray-100' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value="">— Не указан (ручной выбор) —</option>
              {DEFECT_TYPES.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} → Cat {d.categoryCode}
                </option>
              ))}
            </select>
            {selectedDefect && (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-gray-400">Требуемая квалификация:</span>
                <span className={`px-2 py-0.5 rounded font-bold border ${
                  selectedDefect.categoryCode === 'B1' ? 'bg-purple-900/40 text-purple-300 border-purple-700' :
                  selectedDefect.categoryCode === 'B2' ? 'bg-sky-900/40 text-sky-300 border-sky-700' :
                  'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                }`}>
                  Cat {selectedDefect.categoryCode}
                </span>
              </div>
            )}
          </div>

          {/* ======================= STEP 3: PRIORITY ======================= */}
          <div className={`border rounded-xl p-4 space-y-2.5 ${cardClass}`}>
            <StepTitle n={3} color="bg-red-600" title="Приоритет вызова" />
            <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
              <button
                type="button"
                onClick={() => setPriority('AOG')}
                className={`py-2 px-2 rounded-lg border text-center font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                  priority === 'AOG'
                    ? 'bg-red-500/25 border-red-500 text-red-400 font-bold shadow-md'
                    : theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-gray-400' : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-red-500" />
                <span>AOG (Срыв)</span>
              </button>

              <button
                type="button"
                onClick={() => setPriority('URGENT')}
                className={`py-2 px-2 rounded-lg border text-center font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                  priority === 'URGENT'
                    ? 'bg-amber-500/25 border-amber-500 text-amber-400 font-bold shadow-md'
                    : theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-gray-400' : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>URGENT</span>
              </button>

              <button
                type="button"
                onClick={() => setPriority('ROUTINE')}
                className={`py-2 px-2 rounded-lg border text-center font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                  priority === 'ROUTINE'
                    ? 'bg-sky-500/25 border-sky-500 text-sky-400 font-bold shadow-md'
                    : theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-gray-400' : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                <span>ROUTINE</span>
              </button>
            </div>
          </div>

          {/* ======================= STEP 4: SYSTEM RECOMMENDATION ======================= */}
          <div className={`border rounded-xl p-4 space-y-2.5 ${cardClass}`}>
            <StepTitle n={4} color="bg-emerald-600" title="Рекомендация системы" hint={`Cat ${reqCat}`} />

            {systemCandidates.length > 0 ? (
              <>
                <div className={`rounded-lg border border-sky-500/60 bg-sky-500/10 p-2.5 flex items-center justify-between ${
                  theme === 'dark' ? '' : 'bg-sky-50'
                }`}>
                  <div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <BrainCircuit className="w-3 h-3 text-sky-400" /> Оптимальный инженер
                    </div>
                    <div className="font-bold text-sm text-sky-300">
                      {systemCandidates[0].workerName} <span className="text-xs text-gray-400">Cat {systemCandidates[0].categoryCode}</span>
                    </div>
                    <div className="text-[10px] text-gray-500">{systemCandidates[0].vehicleLabel} • {systemCandidates[0].startLocationText}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black text-emerald-400">{systemCandidates[0].etaMinutes} мин</div>
                    <div className="text-[10px] text-gray-500">ETA по маршруту</div>
                  </div>
                </div>

                {naivePick && (
                  <div className={`flex items-center justify-between text-[11px] px-1 font-bold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-slate-500'
                  }`}>
                    <span className="flex items-center gap-1 min-w-0">
                      <Crosshair className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="truncate">Диспетчер «по бумагам» (по прямой): {naivePick.workerName} — {naivePick.etaMinutes} мин</span>
                    </span>
                    <span className={naivePick.etaMinutes > systemCandidates[0].etaMinutes + 0.5 ? 'text-emerald-400 shrink-0 ml-2' : 'text-gray-400 shrink-0 ml-2'}>
                      {naivePick.etaMinutes > systemCandidates[0].etaMinutes + 0.5
                        ? `−${Math.round((naivePick.etaMinutes - systemCandidates[0].etaMinutes) * 10) / 10} мин`
                        : 'совпадают'}
                    </span>
                  </div>
                )}

                <div className={`border-t pt-2 space-y-1 ${theme === 'dark' ? 'border-[#263345]' : 'border-slate-200'}`}>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Свободные кандидаты</div>
                  {systemCandidates.map((c, i) => (
                    <div key={c.workerId} className={`flex items-center justify-between text-[11px] rounded px-2 py-1 border ${
                      i === 0 ? 'border-transparent' : theme === 'dark' ? 'bg-[#070a0e] border-[#1e293b] text-gray-300' : 'bg-white border-slate-200 text-slate-600'
                    }`}>
                      <span className="font-bold truncate max-w-[170px]">{c.workerName} <span className="text-gray-400 font-normal">({c.categoryCode})</span></span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="text-gray-400">{c.vehicleLabel.split(' ')[0]}</span>
                        <span className="font-bold">{c.etaMinutes} мин</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-gray-500 text-center py-2 border border-dashed rounded-lg">
                Нет свободных кандидатов нужной квалификации — задача уйдёт в очередь.
              </div>
            )}
          </div>

          {/* ======================= STEP 5: CREW + LAUNCH ======================= */}
          <div className={`border rounded-xl p-4 space-y-3 ${cardClass}`}>
            <StepTitle n={5} color="bg-purple-600" title="Бригада и запуск" />

            {/* Quick crew assembly buttons */}
            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <button
                type="button"
                onClick={() => handleAddNearestWorker('B1')}
                className={`py-2 px-2 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                  theme === 'dark' ? 'bg-[#070a0e] hover:bg-[#1e293b] text-purple-300 border-purple-800/60' : 'bg-white hover:bg-slate-100 text-purple-700 border-purple-300 shadow-sm'
                }`}
              >
                ➕ B1 Механика
              </button>
              <button
                type="button"
                onClick={() => handleAddNearestWorker('B2')}
                className={`py-2 px-2 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                  theme === 'dark' ? 'bg-[#070a0e] hover:bg-[#1e293b] text-sky-300 border-sky-800/60' : 'bg-white hover:bg-slate-100 text-sky-700 border-sky-300 shadow-sm'
                }`}
              >
                ➕ B2 Авионика
              </button>
              <button
                type="button"
                onClick={() => handleAddNearestWorker('A')}
                className={`py-2 px-2 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                  theme === 'dark' ? 'bg-[#070a0e] hover:bg-[#1e293b] text-emerald-300 border-emerald-800/60' : 'bg-white hover:bg-slate-100 text-emerald-700 border-emerald-300 shadow-sm'
                }`}
              >
                ➕ Cat A Линейщик
              </button>
            </div>

            {/* Crew list */}
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" /> Состав бригады
              </span>
              <span className="font-mono text-xs text-sky-400 font-bold bg-[#070a0e] dark:bg-[#070a0e] bg-white px-2.5 py-1 rounded-lg border border-[#263345] dark:border-[#263345] border-slate-300">
                {crew.length} чел.
              </span>
            </div>

            {crew.length > 0 ? (
              <div className="space-y-2 overflow-y-auto max-h-[180px] pr-1">
                {crew.map((member) => (
                  <div
                    key={member.workerId}
                    className={`border rounded-lg p-2.5 font-mono text-xs flex items-center justify-between ${
                      theme === 'dark' ? 'bg-[#070a0e] border-[#263345]' : 'bg-white border-slate-200 shadow-sm'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm">{member.workerName}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-900/40 text-purple-300 border border-purple-700">
                          Cat {member.categoryCode}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-2">
                        <span className="text-amber-400">{member.startLocationText}</span>
                        <span>•</span>
                        <span>{member.vehicleLabel}</span>
                        <span>•</span>
                        <span className="text-sky-400 font-bold">{member.etaMinutes} мин ETA</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveWorker(member.workerId)}
                      className="p-1.5 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                      title="Удалить из бригады"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-gray-400 font-mono text-xs border border-dashed border-slate-300 dark:border-[#263345] rounded-lg">
                Нажмите кнопки выше, чтобы добавить инженеров.
              </div>
            )}

            {/* SLA limit + indicator */}
            <div className={`border rounded-lg p-3 flex items-center justify-between font-mono text-xs font-bold ${
              theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-amber-400' : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span>⏱️ Лимит SLA:</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <input
                  type="number"
                  step="0.5"
                  min="1.0"
                  max="120.0"
                  value={slaLimitMinutes}
                  onChange={e => setSlaLimitMinutes(Math.max(1.0, parseFloat(e.target.value) || 1.0))}
                  className={`w-20 p-1.5 rounded-lg border text-center font-bold text-sm focus:border-amber-500 focus:outline-none ${
                    theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-amber-400' : 'bg-white border-amber-300 text-amber-900'
                  }`}
                />
                <span>мин</span>
              </div>
            </div>

            {crew.length > 0 && (
              <div className={`p-2.5 rounded-lg border font-mono text-xs flex items-center space-x-2 ${
                withinSla
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                  : 'bg-red-500/15 border-red-500 text-red-400'
              }`}>
                {withinSla ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                )}
                <span>
                  {withinSla
                    ? `🟢 В рамках SLA (ETA ${maxEtaMinutes} мин <= ${slaLimitMinutes} мин)`
                    : `🔴 ПРЕВЫШЕНИЕ SLA (ETA ${maxEtaMinutes} мин > ${slaLimitMinutes} мин, Задержка: +${slaDiff} мин!)`}
                </span>
              </div>
            )}

            <button
              onClick={handleLaunchTaskSubmit}
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-3 px-4 rounded-xl border border-red-400 shadow-lg transition-all duration-200 hover:shadow-red-900/40 hover:-translate-y-0.5 active:scale-[0.98] uppercase tracking-wider font-mono text-sm cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>🚀 Отправить людей на задание</span>
            </button>
          </div>
        </>
      )}
    </aside>
  );
};
