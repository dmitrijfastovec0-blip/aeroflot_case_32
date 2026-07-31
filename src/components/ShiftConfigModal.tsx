import React, { useState } from 'react';
import { ThemeMode } from '../types';
import { Users, RefreshCw, XCircle } from 'lucide-react';

interface ShiftConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyShift: (b1Count: number, b2Count: number, catACount: number, vehicleCount: number) => void;
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

  if (!isOpen) return null;

  const total = b1 + b2 + catA;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyShift(b1, b2, catA, vehicles);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-5 font-sans select-none ${
        theme === 'dark' ? 'bg-[#0f172a] border-[#263345] text-gray-100' : 'bg-white border-slate-300 text-slate-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-300 dark:border-[#263345] pb-3">
          <div className="flex items-center space-x-2.5">
            <Users className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold uppercase tracking-wider">
              👥 УПРАВЛЕНИЕ СОСТАВОМ СМЕНЫ
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs */}
        <form onSubmit={handleSubmit} className="space-y-4 font-mono text-sm">
          <div className="space-y-3">
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              theme === 'dark' ? 'bg-[#070a0e] border-[#263345]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <label className="font-bold text-purple-400">B1 (Планер и Двигатели)</label>
                <div className="text-xs text-gray-400">Специалисты по техническому обслуживанию</div>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={b1}
                onChange={e => setB1(Math.max(0, parseInt(e.target.value) || 0))}
                className={`w-20 p-2 rounded-lg border text-center font-bold text-base focus:border-purple-500 focus:outline-none ${
                  theme === 'dark' ? 'bg-[#121820] border-[#263345] text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              theme === 'dark' ? 'bg-[#070a0e] border-[#263345]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <label className="font-bold text-sky-400">B2 (Авионика и Электроника)</label>
                <div className="text-xs text-gray-400">Специалисты бортовых радиоэлектронных систем</div>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={b2}
                onChange={e => setB2(Math.max(0, parseInt(e.target.value) || 0))}
                className={`w-20 p-2 rounded-lg border text-center font-bold text-base focus:border-sky-500 focus:outline-none ${
                  theme === 'dark' ? 'bg-[#121820] border-[#263345] text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              theme === 'dark' ? 'bg-[#070a0e] border-[#263345]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <label className="font-bold text-emerald-400">Cat A (Линейные механики)</label>
                <div className="text-xs text-gray-400">Линейный осмотр и мелкий ремонт</div>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={catA}
                onChange={e => setCatA(Math.max(0, parseInt(e.target.value) || 0))}
                className={`w-20 p-2 rounded-lg border text-center font-bold text-base focus:border-emerald-500 focus:outline-none ${
                  theme === 'dark' ? 'bg-[#121820] border-[#263345] text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              theme === 'dark' ? 'bg-[#070a0e] border-[#263345]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <label className="font-bold text-amber-400">🚘 Спецавтомобили ОТО</label>
                <div className="text-xs text-gray-400">Количество доступных машин на перроне</div>
              </div>
              <input
                type="number"
                min="0"
                max="50"
                value={vehicles}
                onChange={e => setVehicles(Math.max(0, parseInt(e.target.value) || 0))}
                className={`w-20 p-2 rounded-lg border text-center font-bold text-base focus:border-amber-500 focus:outline-none ${
                  theme === 'dark' ? 'bg-[#121820] border-[#263345] text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div className="flex justify-between items-center px-1 pt-1 font-bold text-sm">
            <span className="text-gray-400">Итого в смене:</span>
            <span className="text-emerald-400 text-base">{total} специалистов</span>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl border border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg transition-colors uppercase tracking-wider cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>🔄 Применить пересчет смены</span>
          </button>
        </form>
      </div>
    </div>
  );
};
