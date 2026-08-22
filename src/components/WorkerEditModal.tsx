import React, { useState, useEffect } from 'react';
import { Worker, CategoryCode, VehicleType, ThemeMode } from '../types/index';
import { SVO_STANDS, SVO_FACILITIES } from '../constants/index';
import { UserCheck, X, Save, MapPin, Truck, Award } from 'lucide-react';

interface WorkerEditModalProps {
  worker: Worker | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveWorker: (workerId: string, updates: Partial<Worker>) => void;
  theme: ThemeMode;
}

export const WorkerEditModal: React.FC<WorkerEditModalProps> = ({
  worker,
  isOpen,
  onClose,
  onSaveWorker,
  theme
}) => {
  const [categoryCode, setCategoryCode] = useState<CategoryCode>('B1');
  const [baseId, setBaseId] = useState<string>('PTO_NORTH');
  const [vehicle, setVehicle] = useState<VehicleType>('APRON_VEHICLE');
  const [targetStandId, setTargetStandId] = useState<string>('');

  useEffect(() => {
    if (worker) {
      setCategoryCode(worker.categoryCode);
      setBaseId(worker.baseId);
      setVehicle(worker.vehicle);
      setTargetStandId('');
    }
  }, [worker]);

  if (!isOpen || !worker) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const categoryMap: Record<CategoryCode, Worker['category']> = {
      B1: 'ENGINES_AIRFRAME',
      B2: 'AVIONICS',
      A: 'GENERAL_MECHANIC'
    };

    const updates: Partial<Worker> = {
      categoryCode,
      category: categoryMap[categoryCode],
      baseId,
      vehicle
    };

    // If custom stand selected for manual relocation
    if (targetStandId) {
      const stand = SVO_STANDS.find(s => s.id === targetStandId);
      if (stand) {
        updates.x = stand.x;
        updates.y = stand.y;
      }
    } else {
      const fac = SVO_FACILITIES.find(f => f.id === baseId);
      if (fac) {
        updates.x = fac.x;
        updates.y = fac.y;
      }
    }

    onSaveWorker(worker.id, updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn font-mono text-sm select-none">
      <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-5 ${
        theme === 'dark' ? 'bg-[#090d11] border-emerald-500/80 text-gray-100' : 'bg-white border-emerald-400 text-slate-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-500/30 pb-3">
          <div className="flex items-center space-x-3 text-emerald-400">
            <UserCheck className="w-6 h-6 shrink-0" />
            <div>
              <h3 className="font-bold text-base uppercase tracking-wide">
                Редактировать специалиста
              </h3>
              <p className="text-xs text-sky-400 font-bold">{worker.name} ({worker.id})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          {/* Qualification */}
          <div>
            <label className="text-xs font-bold text-gray-400 flex items-center gap-1.5 mb-1.5">
              <Award className="w-4 h-4 text-emerald-400" /> Квалификация (Категория):
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(['B1', 'B2', 'A'] as CategoryCode[]).map(cat => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setCategoryCode(cat)}
                  className={`p-2.5 rounded-xl border text-center font-extrabold transition-all cursor-pointer ${
                    categoryCode === cat
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md'
                      : theme === 'dark'
                      ? 'bg-[#121820] border-[#263345] text-gray-400 hover:border-gray-500'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  {cat === 'B1' ? 'B1 (Планер)' : cat === 'B2' ? 'B2 (Авионика)' : 'A (Техник)'}
                </button>
              ))}
            </div>
          </div>

          {/* Duty Station Base */}
          <div>
            <label className="text-xs font-bold text-gray-400 flex items-center gap-1.5 mb-1.5">
              <MapPin className="w-4 h-4 text-sky-400" /> База приписки:
            </label>
            <select
              value={baseId}
              onChange={e => setBaseId(e.target.value)}
              className={`w-full p-2.5 rounded-xl border font-bold text-xs focus:outline-none ${
                theme === 'dark' ? 'bg-[#121820] border-[#263345] text-gray-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="PTO_NORTH">ПТО-1 (Север B/C)</option>
              <option value="PTO_SOUTH">ПТО-2 (Юг D/E/F)</option>
            </select>
          </div>

          {/* Transport Mode */}
          <div>
            <label className="text-xs font-bold text-gray-400 flex items-center gap-1.5 mb-1.5">
              <Truck className="w-4 h-4 text-amber-400" /> Способ перемещения:
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setVehicle('APRON_VEHICLE')}
                className={`p-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                  vehicle === 'APRON_VEHICLE'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : theme === 'dark'
                    ? 'bg-[#121820] border-[#263345] text-gray-400'
                    : 'bg-slate-100 border-slate-300 text-slate-700'
                }`}
              >
                🚘 Спецавто (25 км/ч)
              </button>
              <button
                type="button"
                onClick={() => setVehicle('PEDESTRIAN')}
                className={`p-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                  vehicle === 'PEDESTRIAN'
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                    : theme === 'dark'
                    ? 'bg-[#121820] border-[#263345] text-gray-400'
                    : 'bg-slate-100 border-slate-300 text-slate-700'
                }`}
              >
                🚶 Пешком (4.5 км/ч)
              </button>
            </div>
          </div>

          {/* Relocate to Stand */}
          <div>
            <label className="text-xs font-bold text-gray-400 flex items-center gap-1.5 mb-1.5">
              📍 Переместить на стоянку (ручной перенос):
            </label>
            <select
              value={targetStandId}
              onChange={e => setTargetStandId(e.target.value)}
              className={`w-full p-2.5 rounded-xl border font-bold text-xs focus:outline-none ${
                theme === 'dark' ? 'bg-[#121820] border-[#263345] text-gray-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="">-- На базе приписки --</option>
              {SVO_STANDS.map(stand => (
                <option key={stand.id} value={stand.id}>
                  Стоянка {stand.label} ({stand.complex === 'NORTH' ? 'Север' : 'Юг'})
                </option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <div className="pt-3 flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className={`w-1/2 py-2.5 rounded-xl border font-bold text-xs transition-colors cursor-pointer ${
                theme === 'dark' ? 'border-[#263345] text-gray-400 hover:bg-[#121820]' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Сохранить</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
