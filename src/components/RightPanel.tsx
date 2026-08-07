import React, { useState, useEffect, useMemo } from 'react';
import { CategoryCode, OtoTask, TaskCrewMember, Worker, ThemeMode } from '../types/index';
import { SVO_STANDS, DEFECT_TYPES } from '../constants/index';
import { CrewRequirement } from '../constants/index';
import { findNearestFreeWorkerOfExactCategory, getCategoryCandidates, findNaiveNearestWorkerOfCategory } from '../services/dijkstra';
import { Wrench, Rocket, CheckCircle2, AlertTriangle, MapPin, Users, Clock, Timer, BrainCircuit, Crosshair, Sparkles } from 'lucide-react';

interface RightPanelProps {
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  workers: Worker[];
  onLaunchTask: (task: OtoTask) => void;
  onTriggerSlaAlert: (task: OtoTask) => void;
  onNotify: (msg: string) => void;
  activeTaskForStand?: OtoTask | null;
  theme: ThemeMode;
}

const SLA_LIMIT = 15.0;

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
  onNotify,
  activeTaskForStand,
  theme
}) => {
  const [standId, setStandId] = useState<string>(selectedStandId || SVO_STANDS[0].id);
  const [defectId, setDefectId] = useState<string>('');

  const selectedDefect = DEFECT_TYPES.find(d => d.id === defectId);
  const currentStand = SVO_STANDS.find(s => s.id === standId) || SVO_STANDS[0];

  useEffect(() => {
    if (selectedStandId) setStandId(selectedStandId);
  }, [selectedStandId]);

  // Auto crew: assemble the exact crew required by the ATA chapter, picking the
  // nearest available engineer of each qualification. Best-effort — if someone is
  // missing the task simply goes to the queue.
  const autoCrew: TaskCrewMember[] = useMemo(() => {
    if (!selectedDefect) return [];
    const used = new Set<string>();
    const members: TaskCrewMember[] = [];
    for (const req of selectedDefect.requiredCrew as CrewRequirement[]) {
      for (let i = 0; i < req.count; i++) {
        const m = findNearestFreeWorkerOfExactCategory(req.categoryCode, currentStand, workers, used);
        if (!m) break;
        used.add(m.workerId);
        members.push(m);
      }
    }
    return members;
  }, [selectedDefect, currentStand, workers]);

  const crew: TaskCrewMember[] = autoCrew;
  const maxEtaMinutes = crew.length ? Math.max(...crew.map(m => m.etaMinutes)) : 0;
  const withinSla = crew.length > 0 && maxEtaMinutes <= SLA_LIMIT;

  const reqCat: CategoryCode = selectedDefect?.categoryCode || 'B1';

  // Recommendation: closest candidate for the lead category
  const { systemCandidates, naivePick } = useMemo(() => {
    const busy = new Set(
      workers.filter(w => w.status === 'IN_TRANSIT' || w.status === 'WORKING_ON_SITE').map(w => w.id)
    );
    const candidates = getCategoryCandidates(reqCat, currentStand, workers, busy, {})
      .filter(c => c.isAvailable)
      .sort((a, b) => a.etaMinutes - b.etaMinutes)
      .slice(0, 3);
    const naive = findNaiveNearestWorkerOfCategory(reqCat, currentStand, workers, busy);
    return { systemCandidates: candidates, naivePick: naive };
  }, [reqCat, currentStand, workers]);

  const handleLaunch = () => {
    if (!selectedDefect) {
      onNotify('⚠️ Выберите тип неисправности (шаг 2) — бригада подберётся автоматически.');
      return;
    }
    const newTask: OtoTask = {
      id: `TASK-${Date.now().toString().slice(-5)}`,
      standId: currentStand.id,
      standLabel: `Стоянка ${currentStand.label}`,
      aircraftType: `${currentStand.aircraftType} (${currentStand.airline || 'ПАО «Аэрофлот»'})`,
      categoryCode: reqCat,
      categoryLabel: `ОТО · ${selectedDefect.ataLabel} ${selectedDefect.name}`,
      defectLabel: selectedDefect.name,
      priority: 'ROUTINE',
      status: 'DISPATCHED',
      crew,
      requiredCrew: selectedDefect ? selectedDefect.requiredCrew : [{ categoryCode: reqCat, count: 1 }],
      arrivedCount: 0,
      maxEtaMinutes: maxEtaMinutes || 10.0,
      slaLimitMinutes: SLA_LIMIT,
      withinSla,
      createdAt: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
      elapsedQueueSec: 0,
      elapsedWorkSec: 0,
      targetWorkSec: 120
    };

    if (crew.length > 0 && !withinSla) {
      onTriggerSlaAlert(newTask);
    } else {
      onLaunchTask(newTask);
    }
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const cardClass = theme === 'dark' ? 'bg-[#121820] border-[#263345]' : 'bg-slate-50 border-slate-200';

  return (
    <aside className={`w-[440px] min-w-[440px] h-full border-l overflow-y-auto flex flex-col p-5 space-y-4 select-none font-sans text-sm transition-colors ${
      theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-gray-100' : 'bg-white border-slate-300 text-slate-900 shadow-xl'
    }`}>
      <div className="flex items-center justify-between border-b border-slate-300 dark:border-[#263345] pb-3">
        <h2 className="font-bold text-base md:text-lg uppercase tracking-wider flex items-center gap-2 text-gray-100 dark:text-gray-100 text-slate-900">
          <Wrench className="w-5 h-5 text-sky-400" />
          📋 СОЗДАНИЕ ВЫЗОВА
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
            <StepTitle n={2} color="bg-orange-600" title="Тип неисправности" hint="→ бригада подберётся сама" />
            <select
              value={defectId}
              onChange={e => setDefectId(e.target.value)}
              className={`w-full border text-xs rounded-lg p-2 font-mono focus:border-orange-500 focus:outline-none ${
                theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-gray-100' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value="">— Выберите неисправность —</option>
              {DEFECT_TYPES.map(d => (
                <option key={d.id} value={d.id}>
                  {d.ataLabel} — {d.name} → {d.requiredCrew.map(r => `${r.count}× Cat ${r.categoryCode}`).join(' + ')}
                </option>
              ))}
            </select>

            {selectedDefect && (
              <div className="flex items-center justify-between gap-2 text-[11px] flex-wrap">
                <span className="text-gray-400">Нужная бригада ({selectedDefect.ataLabel}):</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {selectedDefect.requiredCrew.map((r: CrewRequirement, i: number) => (
                    <span key={i} className={`px-2 py-0.5 rounded font-bold border ${
                      r.categoryCode === 'B1' ? 'bg-purple-900/40 text-purple-300 border-purple-700' :
                      r.categoryCode === 'B2' ? 'bg-sky-900/40 text-sky-300 border-sky-700' :
                      'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                    }`}>
                      {r.count}× Cat {r.categoryCode}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ======================= SYSTEM RECOMMENDATION ======================= */}
          <div className={`border rounded-xl p-4 space-y-2.5 ${cardClass}`}>
            <StepTitle n={3} color="bg-emerald-600" title="Рекомендация системы" hint={`Cat ${reqCat}`} />

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
              </>
            ) : (
              <div className="text-[11px] text-gray-500 text-center py-2 border border-dashed rounded-lg">
                Нет свободных кандидатов нужной квалификации — задача уйдёт в очередь.
              </div>
            )}
          </div>

          {/* ======================= CREW + LAUNCH ======================= */}
          <div className={`border rounded-xl p-4 space-y-3 ${cardClass}`}>
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
                {crew.map(member => (
                  <div key={member.workerId} className={`border rounded-lg p-2.5 font-mono text-xs flex items-center justify-between ${
                    theme === 'dark' ? 'bg-[#070a0e] border-[#263345]' : 'bg-white border-slate-200 shadow-sm'
                  }`}>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
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
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-gray-400 font-mono text-xs border border-dashed border-slate-300 dark:border-[#263345] rounded-lg">
                {selectedDefect ? 'Не хватает свободных специалистов — задача уйдёт в очередь.' : 'Выберите неисправность — система соберёт бригаду автоматически.'}
              </div>
            )}

            {crew.length > 0 && (
              <div className={`p-2.5 rounded-lg border font-mono text-xs flex items-center space-x-2 ${
                withinSla
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                  : 'bg-red-600/20 border-red-600 text-red-300 animate-pulse'
              }`}>
                {withinSla ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                )}
                <span>
                  {withinSla
                    ? `🟢 В рамках SLA (ETA ${maxEtaMinutes} мин <= ${SLA_LIMIT} мин)`
                    : `🚨 ПРЕВЫШЕНИЕ SLA (+${Math.round((maxEtaMinutes - SLA_LIMIT) * 10) / 10} мин)`}
                </span>
              </div>
            )}

            <button
              onClick={handleLaunch}
              disabled={!selectedDefect}
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-3 px-4 rounded-xl border border-red-400 shadow-lg transition-all duration-200 hover:shadow-red-900/40 hover:-translate-y-0.5 active:scale-[0.98] uppercase tracking-wider font-mono text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>🚀 Отправить бригаду на задание</span>
            </button>
          </div>
        </>
      )}
    </aside>
  );
};
