import React from 'react';
import { ThemeMode, OtoTask } from '../types';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface SlaAlertModalProps {
  isOpen: boolean;
  taskData: OtoTask | null;
  onConfirm: () => void;
  onCancel: () => void;
  theme: ThemeMode;
}

export const SlaAlertModal: React.FC<SlaAlertModalProps> = ({
  isOpen,
  taskData,
  onConfirm,
  onCancel,
  theme
}) => {
  if (!isOpen || !taskData) return null;

  const excessMinutes = Math.round((taskData.maxEtaMinutes - taskData.slaLimitMinutes) * 10) / 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-5 font-sans select-none ${
        theme === 'dark'
          ? 'bg-[#0f172a] border-red-500/50 text-gray-100'
          : 'bg-white border-red-400 text-slate-900'
      }`}>
        {/* Modal Header */}
        <div className="flex items-center space-x-3 border-b border-red-500/30 pb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/60 text-red-500 shrink-0">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold uppercase tracking-wider text-red-500 flex items-center gap-2">
              ⚠️ ВНИМАНИЕ: ПРЕВЫШЕНИЕ РЕГЛАМЕНТА ОТО
            </h3>
            <p className="text-xs text-gray-400 font-mono">
              Внимание диспетчера! Лимит времени сбора бригады нарушен.
            </p>
          </div>
        </div>

        {/* Modal Content */}
        <div className="space-y-3 text-sm leading-relaxed font-mono">
          <div className={`p-4 rounded-xl border space-y-2 ${
            theme === 'dark' ? 'bg-[#070a0e] border-[#263345]' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex justify-between">
              <span className="text-gray-400">Стоянка назначения:</span>
              <span className="font-bold text-sky-400 text-base">{taskData.standLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Воздушное судно:</span>
              <span className="font-bold text-white dark:text-white text-slate-900">{taskData.aircraftType}</span>
            </div>
            <div className="flex justify-between border-t border-slate-300 dark:border-[#263345] pt-2">
              <span className="text-gray-400">Расчётное время (ETA):</span>
              <span className="font-bold text-red-400 text-base">{taskData.maxEtaMinutes} мин</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Установленный лимит SLA:</span>
              <span className="font-bold text-amber-400">{taskData.slaLimitMinutes.toFixed(1)} мин</span>
            </div>
            <div className="flex justify-between text-red-400 font-bold bg-red-500/10 p-2 rounded border border-red-500/30">
              <span>Величина задержки:</span>
              <span>+{excessMinutes} мин!</span>
            </div>
          </div>

          <p className="text-xs text-gray-300 dark:text-gray-300 text-slate-700">
            Расчётное время сбора бригады (<strong className="text-red-400">{taskData.maxEtaMinutes} мин</strong>) превышает регламент SLA (<strong className="text-amber-400">{taskData.slaLimitMinutes.toFixed(1)} мин</strong>) на <strong className="text-red-400">+{excessMinutes} мин</strong>.
            Отправка данной бригады может привести к задержке вылета борта <strong className="text-sky-400">{taskData.standLabel}</strong>. Вы подтверждаете отправку?
          </p>
        </div>

        {/* Modal Buttons */}
        <div className="flex items-center space-x-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl border border-slate-400 dark:border-[#263345] bg-slate-200 dark:bg-[#1e293b] hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-gray-200 font-bold text-xs md:text-sm transition-colors cursor-pointer"
          >
            <XCircle className="w-4 h-4 text-gray-400" />
            <span>🛑 Отмена (Пересобрать)</span>
          </button>

          <button
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl border border-red-500 bg-red-600 hover:bg-red-700 text-white font-bold text-xs md:text-sm shadow-lg transition-colors cursor-pointer uppercase tracking-wider"
          >
            <CheckCircle className="w-4 h-4" />
            <span>⚠️ Подтвердить и отправить</span>
          </button>
        </div>
      </div>
    </div>
  );
};
