import React, { useState, useEffect } from 'react';
import { ThemeMode } from '../types/index';
import { Users, X, RefreshCw, Truck } from 'lucide-react';

interface ShiftConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyShift: (b1Count: number, b2Count: number, catACount: number, vehiclesCount: number) => void;
  currentB1: number;
  currentB2: number;
  currentCatA: number;
  currentVehicles: number;
  theme: ThemeMode;
}

export const ShiftConfigModal: React.FC<ShiftConfigModalProps> = ({
  isOpen,
  onClose,
  onApplyShift,
  currentB1,
  currentB2,
  currentCatA,
  currentVehicles,
  theme
}) => {
  const [b1, setB1] = useState<number>(currentB1);
  const [b2, setB2] = useState<number>(currentB2);
  const [catA, setCatA] = useState<number>(currentCatA);
  const [vehicles, setVehicles] = useState<number>(currentVehicles);

  // Refresh form values every time the modal opens with the latest applied shift config
  useEffect(() => {
    if (isOpen) {
      setB1(currentB1);
      setB2(currentB2);
      setCatA(currentCatA);
      setVehicles(currentVehicles);
    }
  }, [isOpen, currentB1, currentB2, currentCatA, currentVehicles]);

  if (!isOpen) return null;

  const totalPersonnel = b1 + b2 + catA;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyShift(b1, b2, catA, vehicles);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-5 transition-all ${
        theme === 'dark' ? 'bg-[#090d11] border-emerald-500/80 text-gray-100' : 'bg-white border-emerald-400 text-slate-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-500/30 pb-3">
          <div className="flex items-center space-x-3 text-emerald-400">
            <Users className="w-6 h-6 shrink-0" />
            <h3 className="font-bold text-base md:text-lg uppercase tracking-wide">
              ⚙️ Управление составом смены
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Controls */}
        <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
          <div className={`p-4 rounded-xl border space-y-3 ${
            theme === 'dark' ? 'bg-[#121820] border-[#263345]' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <label className="text-gray-300 font-bold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400" /> B1 (Планер и Двигатели):
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={b1}
                onChange={e => setB1(Math.max(0, parseInt(e.target.value) || 0))}
                className={`w-20 p-1.5 rounded-lg border text-center font-bold text-sm focus:border-emerald-500 focus:outline-none ${
                  theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-purple-300' : 'bg-white border-slate-300 text-purple-700'
                }`}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-gray-300 font-bold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> B2 (Авионика и Электроника):
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={b2}
                onChange={e => setB2(Math.max(0, parseInt(e.target.value) || 0))}
                className={`w-20 p-1.5 rounded-lg border text-center font-bold text-sm focus:border-emerald-500 focus:outline-none ${
                  theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-sky-300' : 'bg-white border-slate-300 text-sky-700'
                }`}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-gray-300 font-bold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Cat A (Линейные механики):
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={catA}
                onChange={e => setCatA(Math.max(0, parseInt(e.target.value) || 0))}
                className={`w-20 p-1.5 rounded-lg border text-center font-bold text-sm focus:border-emerald-500 focus:outline-none ${
                  theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-emerald-300' : 'bg-white border-slate-300 text-emerald-700'
                }`}
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-700 dark:border-[#263345] pt-3">
              <label className="text-gray-300 font-bold flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-amber-400" /> 🚘 Спецавтомобили ОТО:
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={vehicles}
                onChange={e => setVehicles(Math.max(0, parseInt(e.target.value) || 0))}
                className={`w-20 p-1.5 rounded-lg border text-center font-bold text-sm focus:border-emerald-500 focus:outline-none ${
                  theme === 'dark' ? 'bg-[#070a0e] border-[#263345] text-amber-400' : 'bg-white border-slate-300 text-amber-700'
                }`}
              />
            </div>
          </div>

          <div className="flex justify-between items-center px-1 font-bold">
            <span className="text-gray-400">Всего специалистов в смене:</span>
            <span className="text-emerald-400 text-base">{totalPersonnel} чел.</span>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 py-2.5 px-4 rounded-xl border font-bold transition-colors cursor-pointer text-center ${
                theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-gray-300 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 shadow-lg transition-colors cursor-pointer flex items-center justify-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>🔄 Пересчитать</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
