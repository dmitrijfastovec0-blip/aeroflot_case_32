/**
 * ============================================================================
 * ДИАЛОГ ПОДТВЕРЖДЕНИЯ ВЫЗОВА ПРИ ПРЕВЫШЕНИИ НОРМАТИВА SLA (SLA CONFIRM MODAL)
 * ----------------------------------------------------------------------------
 * Модальное окно оперативного предупреждения:
 * Появляется, если расчетное время прибытия бригады (ETA) превышает
 * установленный регламент 15 минут (например, из-за неблагоприятных метеоусловий
 * или удаленности свободных инженеров).
 * Требует осознанного подтверждения диспетчера на отправку бригады или отмену вызова.
 * ============================================================================
 */

import React from 'react';
import { OtoTask, ThemeMode } from '../types';
import { AlertTriangle, Clock, Rocket, X } from 'lucide-react';

/** Свойства модального окна подтверждения SLA */
interface SlaConfirmModalProps {

  isOpen: boolean;
  taskData: OtoTask | null;
  onConfirm: () => void;
  onCancel: () => void;
  theme: ThemeMode;
}

export const SlaConfirmModal: React.FC<SlaConfirmModalProps> = ({
  isOpen,
  taskData,
  onConfirm,
  onCancel,
  theme
}) => {
  if (!isOpen || !taskData) return null;

  const slaLimit = taskData.slaLimitMinutes || 15.0;
  const crewEta = taskData.maxEtaMinutes || 18.5;
  const slaDiff = Math.abs(Math.round((crewEta - slaLimit) * 10) / 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-5 transition-all ${
        theme === 'dark' ? 'bg-[#090d11] border-red-500/80 text-gray-100' : 'bg-white border-red-400 text-slate-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-red-500/30 pb-3">
          <div className="flex items-center space-x-3 text-red-500">
            <AlertTriangle className="w-7 h-7 shrink-0 animate-bounce" />
            <h3 className="font-bold text-lg uppercase tracking-wide">
              ⚠️ ПРЕВЫШЕНИЕ ЛИМИТА SLA
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Content */}
        <div className="space-y-3 font-mono text-sm">
          <div className={`p-4 rounded-xl border space-y-2 ${
            theme === 'dark' ? 'bg-[#121820] border-[#263345]' : 'bg-red-50 border-red-200 text-red-950'
          }`}>
            <div className="flex justify-between">
              <span className="text-gray-400">Стоянка ВС:</span>
              <span className="font-bold text-sky-400">{taskData.standLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Воздушное судно:</span>
              <span className="font-bold">{taskData.aircraftType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Лимит SLA:</span>
              <span className="font-bold text-amber-400">{slaLimit} мин</span>
            </div>
            <div className="flex justify-between border-t border-slate-700 dark:border-[#263345] pt-2">
              <span className="text-gray-400">Расчетное время сбора (ETA):</span>
              <span className="font-bold text-red-400 text-base">{crewEta} мин</span>
            </div>
            <div className="flex justify-between text-xs text-red-400 font-bold">
              <span>Прогнозируемая задержка:</span>
              <span>+{slaDiff} мин выше норматива SLA</span>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center leading-relaxed">
            Внимание! Расчетное время сбора бригады ОТО ({crewEta} мин) превышает норматив SLA ({slaLimit} мин). Отправка вызова может повлиять на задержку вылета рейса.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3 font-mono text-sm pt-2">
          <button
            onClick={onCancel}
            className={`flex-1 py-3 px-4 rounded-xl border font-bold transition-colors cursor-pointer text-center ${
              theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-gray-300 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
          >
            ❌ Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 px-4 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white border border-red-500 shadow-lg transition-colors cursor-pointer flex items-center justify-center space-x-2 uppercase tracking-wider"
          >
            <Rocket className="w-4 h-4" />
            <span>🚀 Подтвердить вылет</span>
          </button>
        </div>
      </div>
    </div>
  );
};
