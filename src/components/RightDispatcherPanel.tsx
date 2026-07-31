import React, { useState, useEffect } from 'react';
import { Stand, CategoryCode, OtoTask, TaskCrewMember, Worker, ThemeMode } from '../types';
import { SVO_STANDS } from '../constants';
import { findNearestFreeWorkerOfCategory, calculateCrewMaxEta } from '../utils/dispatchLogic';
import { Wrench, Trash2, Rocket, CheckCircle2, AlertTriangle, MapPin, Users, Clock, ShieldCheck } from 'lucide-react';

interface RightDispatcherPanelProps {
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  workers: Worker[];
  onLaunchTask: (task: OtoTask) => void;
  onTriggerSlaAlert: (task: OtoTask) => void;
  activeTaskForStand?: OtoTask | null;
  theme: ThemeMode;
}

export const RightDispatcherPanel: React.FC<RightDispatcherPanelProps> = ({
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

  // Default Standard Transit SLA limit (15.0 minutes)
  const slaLimitMinutes = 15.0;

  const currentStand = SVO_STANDS.find(s => s.id === standId) || SVO_STANDS[0];

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
      alert(`⚠️ Нет свободных доступных специалистов категории ${catCode}!`);
      return;
    }

    setCrew(prev => [...prev, nearestMember]);
  };

  const handleRemoveWorker = (workerId: string) => {
    setCrew(prev => prev.filter(c => c.workerId !== workerId));
  };

  const { maxEtaMinutes, withinSla } = calculateCrewMaxEta(crew, slaLimitMinutes);
  const slaDiff = Math.abs(Math.round((slaLimitMinutes - maxEtaMinutes) * 10) / 10);

  // Submit & Launch Task Handler with Modal Interception if SLA Exceeded
  const handleLaunchTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (crew.length === 0) {
      alert('⚠️ Добавьте хотя бы одного специалиста в бригаду!');
      return;
    }

    const newTask: OtoTask = {
      id: `TASK-${Date.now().toString().slice(-5)}`,
      standId: currentStand.id,
      standLabel: `Стоянка ${currentStand.label}`,
      aircraftType: `${currentStand.aircraftType} (${currentStand.airline || 'ПАО «Аэрофлот»'})`,
      categoryCode: crew[0]?.categoryCode || 'B1',
      categoryLabel: `Бригада ОТО (${crew.length} чел.)`,
      status: 'DISPATCHED',
      crew,
      arrivedCount: 0,
      maxEtaMinutes,
      slaLimitMinutes,
      withinSla,
      createdAt: new Date().toLocaleTimeString('ru-RU', { hour12: false })
    };

    // If maxEta exceeds slaLimit, block launch & trigger custom modal dialog!
    if (!withinSla) {
      onTriggerSlaAlert(newTask);
    } else {
      onLaunchTask(newTask);
      setCrew([]);
    }
  };

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

      {/* Stand & Aircraft Selector Info */}
      <div className={`border rounded-xl p-4 space-y-3 ${
        theme === 'dark' ? 'bg-[#121820] border-[#263345]' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex justify-between items-center">
          <label className="text-xs text-gray-400 font-mono flex items-center gap-1.5 font-bold">
            <MapPin className="w-4 h-4 text-sky-400" /> Выбор стоянки ВС:
          </label>
          <span className="font-mono text-xs text-gray-400">
            {currentStand.complex === 'NORTH' ? 'Север B/C' : currentStand.complex === 'REMOTE' ? 'Ангарный сектор' : 'Юг D/E/F'}
          </span>
        </div>

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
        </div>
      </div>

      {/* Active Task Arrival Monitor if task already running */}
      {activeTaskForStand ? (
        <div className={`border rounded-xl p-4 space-y-3 font-mono ${
          theme === 'dark' ? 'bg-[#121820] border-[#263345]' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between border-b border-slate-300 dark:border-[#263345] pb-2">
            <span className="font-bold text-sky-400 text-sm flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sky-400" /> Мониторинг прибытия бригады
            </span>
            <span className="text-xs text-gray-400">{activeTaskForStand.id}</span>
          </div>

          <div className={`p-3 rounded-lg border space-y-2 ${
            theme === 'dark' ? 'bg-[#070a0e] border-[#263345]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Прибытие бригады:</span>
              <span className="font-bold text-emerald-500 text-sm">
                {activeTaskForStand.arrivedCount} / {activeTaskForStand.crew.length} спецов
              </span>
            </div>

            <div className="w-full bg-slate-300 dark:bg-[#1e293b] rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${(activeTaskForStand.arrivedCount / activeTaskForStand.crew.length) * 100}%` }}
              />
            </div>

            <div className="text-xs text-gray-400 flex justify-between pt-1">
              <span>Статус ТО:</span>
              <span className={activeTaskForStand.arrivedCount === activeTaskForStand.crew.length ? 'text-red-500 font-bold' : 'text-amber-500 font-bold'}>
                {activeTaskForStand.arrivedCount === activeTaskForStand.crew.length ? '🔴 Работы ведутся (IN_PROGRESS)' : '⚡ В пути к стоянке'}
              </span>
            </div>
          </div>

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
          {/* SLA TEXT BADGE */}
          <div className={`border rounded-xl p-3.5 flex items-center justify-between font-mono text-xs font-bold ${
            theme === 'dark' ? 'bg-[#121820] border-[#263345] text-amber-400' : 'bg-amber-50 border-amber-300 text-amber-900 shadow-sm'
          }`}>
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>[ ⏱️ Лимит SLA: {slaLimitMinutes.toFixed(1)} мин (Стандартный транзит) ]</span>
            </span>
          </div>

          {/* Quick Crew Assembly (3 BUTTONS) */}
          <div className={`border rounded-xl p-4 space-y-3 ${
            theme === 'dark' ? 'bg-[#121820] border-[#263345]' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="font-bold text-sm border-b border-slate-300 dark:border-[#263345] pb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" /> Быстрая комплектация бригады
              </span>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <button
                type="button"
                onClick={() => handleAddNearestWorker('B1')}
                className={`w-full flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors text-left font-bold cursor-pointer ${
                  theme === 'dark' ? 'bg-[#070a0e] hover:bg-[#1e293b] text-purple-300 border-purple-800/60' : 'bg-white hover:bg-slate-100 text-purple-700 border-purple-300 shadow-sm'
                }`}
              >
                <span>[ ➕ Добавить ближайшего B1 ]</span>
                <span className="text-xs text-purple-400">Механика/Планер</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddNearestWorker('B2')}
                className={`w-full flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors text-left font-bold cursor-pointer ${
                  theme === 'dark' ? 'bg-[#070a0e] hover:bg-[#1e293b] text-sky-300 border-sky-800/60' : 'bg-white hover:bg-slate-100 text-sky-700 border-sky-300 shadow-sm'
                }`}
              >
                <span>[ ➕ Добавить ближайшего B2 ]</span>
                <span className="text-xs text-sky-400">Авионика/Электроника</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddNearestWorker('A')}
                className={`w-full flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors text-left font-bold cursor-pointer ${
                  theme === 'dark' ? 'bg-[#070a0e] hover:bg-[#1e293b] text-emerald-300 border-emerald-800/60' : 'bg-white hover:bg-slate-100 text-emerald-700 border-emerald-300 shadow-sm'
                }`}
              >
                <span>[ ➕ Добавить ближайшего Cat A ]</span>
                <span className="text-xs text-emerald-400">Линейный осмотр</span>
              </button>
            </div>
          </div>

          {/* Selected Crew List & SLA Indicator */}
          <div className={`border rounded-xl p-4 space-y-3 flex-1 flex flex-col ${
            theme === 'dark' ? 'bg-[#121820] border-[#263345]' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="font-bold text-sm border-b border-slate-300 dark:border-[#263345] pb-2 flex justify-between items-center">
              <span>Состав назначенной бригады</span>
              <span className="font-mono text-xs text-sky-400 font-bold bg-[#070a0e] dark:bg-[#070a0e] bg-white px-2.5 py-1 rounded-lg border border-[#263345] dark:border-[#263345] border-slate-300">
                {crew.length} чел.
              </span>
            </div>

            {crew.length > 0 ? (
              <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
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
              <div className="py-6 text-center text-gray-400 font-mono text-xs border border-dashed border-slate-300 dark:border-[#263345] rounded-lg">
                Используйте кнопки выше для мгновенной комплектации бригады.
              </div>
            )}

            {/* SLA Indicator */}
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
              disabled={crew.length === 0}
              className="w-full flex items-center justify-center space-x-2 bg-[#da3633] hover:bg-[#b91c1c] disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl border border-red-600 shadow-lg transition-colors uppercase tracking-wider font-mono text-sm mt-auto cursor-pointer"
            >
              <Rocket className="w-5 h-5" />
              <span>🚀 Отправить людей на задание</span>
            </button>
          </div>
        </>
      )}
    </aside>
  );
};
