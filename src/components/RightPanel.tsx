import React, { useState, useEffect, useMemo } from 'react';
import { CategoryCode, OtoTask, TaskCrewMember, Worker, ThemeMode } from '../types/index';
import { SVO_STANDS, DEFECT_TYPES } from '../constants/index';
import { CrewRequirement } from '../constants/index';
import { findNearestFreeWorkerOfExactCategory, getCategoryCandidates, findNaiveNearestWorkerOfCategory } from '../services/dijkstra';
import { Wrench, Rocket, MapPin, Users, Clock, ChevronRight, ChevronLeft, ShieldCheck, Zap } from 'lucide-react';

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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [standId, setStandId] = useState<string>(selectedStandId || SVO_STANDS[0].id);
  const [defectId, setDefectId] = useState<string>('');

  const selectedDefect = DEFECT_TYPES.find(d => d.id === defectId);
  const currentStand = SVO_STANDS.find(s => s.id === standId) || SVO_STANDS[0];

  useEffect(() => {
    if (selectedStandId) setStandId(selectedStandId);
  }, [selectedStandId]);

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

  const handleLaunch = () => {
    if (!selectedDefect) {
      onNotify('⚠️ Выберите тип неисправности (шаг 2) — бригада подберётся автоматически.');
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
      targetWorkSec: 120
    };

    if (!withinSla) {
      onTriggerSlaAlert(newTask);
    } else {
      onLaunchTask(newTask);
      onNotify(`🚀 Направлена бригада на стоянку ${currentStand.label}`);
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
          title="Развернуть панель задач"
        >
          <ChevronLeft className="w-4 h-4" />
          <Wrench className="w-4 h-4" />
          <span className="font-bold">Стоянка {currentStand.label}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`absolute right-4 top-4 bottom-4 w-96 z-20 flex flex-col rounded-2xl border transition-all overflow-hidden ${cardStyle}`}>
      {/* Drawer Header */}
      <div className="p-4 border-b flex items-center justify-between border-slate-200 dark:border-[#1e2a3a] bg-slate-100/50 dark:bg-[#121820]/50">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm leading-tight text-slate-900 dark:text-white uppercase font-sans">
              Диспетчер ОТО
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 font-mono">Конструктор наряда бригады</p>
          </div>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
          title="Свернуть панель"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
        {/* Step 1: Select Stand */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-sky-400" /> Шаг 1: Выбор стоянки
          </label>
          <select
            value={standId}
            onChange={(e) => {
              setStandId(e.target.value);
              onSelectStand(e.target.value);
            }}
            className="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-[#121820] border-slate-300 dark:border-[#263345] text-slate-900 dark:text-white font-bold cursor-pointer"
          >
            {SVO_STANDS.map(s => (
              <option key={s.id} value={s.id}>
                Стоянка {s.label} ({s.aircraftType})
              </option>
            ))}
          </select>
        </div>

        {/* Quick Stand Chips */}
        <div className="flex flex-wrap gap-1.5">
          {['B10', 'C21', 'D18', 'D24', 'E38', 'F45'].map(lbl => {
            const st = SVO_STANDS.find(s => s.label === lbl);
            if (!st) return null;
            const isSel = st.id === standId;
            return (
              <button
                key={lbl}
                onClick={() => {
                  setStandId(st.id);
                  onSelectStand(st.id);
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                  isSel
                    ? 'bg-sky-500/20 border-sky-500 text-sky-400'
                    : 'bg-slate-100 dark:bg-[#121820] border-slate-300 dark:border-[#263345] text-slate-600 dark:text-gray-400 hover:text-white'
                }`}
              >
                {lbl}
              </button>
            );
          })}
        </div>

        {/* Step 2: Defect Type */}
        <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-[#1e2a3a]">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" /> Шаг 2: Тип неисправности / работы
          </label>
          <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
            {DEFECT_TYPES.map(def => {
              const isSel = def.id === defectId;
              const isAog = def.id === 'ATA72' || def.id === 'ATA49';
              return (
                <button
                  key={def.id}
                  onClick={() => setDefectId(def.id)}
                  className={`p-2.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer ${
                    isSel
                      ? isAog
                        ? 'bg-red-500/20 border-red-500 text-red-400 font-bold'
                        : 'bg-sky-500/20 border-sky-500 text-sky-400 font-bold'
                      : 'bg-slate-50 dark:bg-[#121820] border-slate-300 dark:border-[#263345] text-slate-700 dark:text-gray-300 hover:border-sky-500/50'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold">{def.name}</span>
                    <span className="text-[10px] text-gray-500">{def.description}</span>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    isAog ? 'bg-red-500/30 text-red-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-gray-400'
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
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-400" /> Шаг 3: Авто-состав бригады
            </label>
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#121820] border border-slate-300 dark:border-[#263345] space-y-2">
              {crew.map((m, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800 dark:text-gray-200">
                    {m.workerName} ({m.categoryCode})
                  </span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" /> ETA {m.etaMinutes} мин
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-[#263345] text-xs">
                <span className="text-gray-500">Макс. ETA бригады:</span>
                <span className={`font-bold ${withinSla ? 'text-emerald-400' : 'text-red-400'}`}>
                  {maxEtaMinutes} мин ({withinSla ? 'SLA OK' : 'SLA Превышен!'})
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drawer Action Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-[#1e2a3a] bg-slate-100/50 dark:bg-[#121820]/50">
        <button
          onClick={handleLaunch}
          disabled={!selectedDefect}
          className={`w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 cursor-pointer transition-all shadow-lg ${
            selectedDefect
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-500/25 active:scale-95'
              : 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          <Rocket className="w-4 h-4" />
          <span>Направить бригаду</span>
        </button>
      </div>
    </div>
  );
};

export default RightPanel;
